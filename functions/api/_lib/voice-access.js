export const BASE_DAILY_CREDITS = 5;
export const BONUS_DAILY_CREDITS = 5;
export const IP_DAILY_CREDITS = 30;

const COOKIE_NAME = "freysa_voice_client";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function resolveVoiceVisitor(request, env) {
  requireBindings(env);
  const cookieValue = readCookie(request.headers.get("Cookie"), COOKIE_NAME);
  const verifiedClientId = await verifyClientCookie(cookieValue, env.ABUSE_HASH_SECRET);
  const clientId = verifiedClientId || crypto.randomUUID();
  const clientHash = await keyedHash(env.ABUSE_HASH_SECRET, `client:${clientId}`);
  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "local-development";
  const ipHash = await keyedHash(env.ABUSE_HASH_SECRET, `ip:${ip}`);
  const day = new Date().toISOString().slice(0, 10);
  const setCookie = verifiedClientId
    ? null
    : serializeCookie(await createClientCookie(clientId, env.ABUSE_HASH_SECRET));

  return { clientHash, ipHash, day, setCookie };
}

export async function getVoiceAccess(env, visitor) {
  await ensureDailyRows(env.VOICE_USAGE, visitor);
  const [client, ip] = await Promise.all([
    env.VOICE_USAGE.prepare(
      "SELECT used, bonus_unlocked AS bonusUnlocked FROM voice_clients WHERE client_hash = ? AND day = ?"
    ).bind(visitor.clientHash, visitor.day).first(),
    env.VOICE_USAGE.prepare(
      "SELECT used FROM voice_ips WHERE ip_hash = ? AND day = ?"
    ).bind(visitor.ipHash, visitor.day).first()
  ]);
  return formatAccess(client, ip, env);
}

export async function unlockBonus(env, visitor) {
  await ensureDailyRows(env.VOICE_USAGE, visitor);
  await env.VOICE_USAGE.prepare(
    "UPDATE voice_clients SET bonus_unlocked = 1, updated_at = CURRENT_TIMESTAMP WHERE client_hash = ? AND day = ?"
  ).bind(visitor.clientHash, visitor.day).run();
  return getVoiceAccess(env, visitor);
}

export async function reserveSponsoredCredit(env, visitor) {
  await enforceMinuteLimit(env.VOICE_USAGE, `client:${visitor.clientHash}`, 12);
  await enforceMinuteLimit(env.VOICE_USAGE, `ip:${visitor.ipHash}`, 30);
  await ensureDailyRows(env.VOICE_USAGE, visitor);

  const clientResult = await env.VOICE_USAGE.prepare(`
    UPDATE voice_clients
    SET used = used + 1, updated_at = CURRENT_TIMESTAMP
    WHERE client_hash = ? AND day = ?
      AND used < CASE WHEN bonus_unlocked = 1 THEN ? ELSE ? END
    RETURNING used, bonus_unlocked AS bonusUnlocked
  `).bind(
    visitor.clientHash,
    visitor.day,
    BASE_DAILY_CREDITS + BONUS_DAILY_CREDITS,
    BASE_DAILY_CREDITS
  ).first();
  if (!clientResult) throw accessError("DAILY_LIMIT_REACHED", "Your sponsored ElevenLabs allowance has been used for today.", 429);

  const ipResult = await env.VOICE_USAGE.prepare(`
    UPDATE voice_ips
    SET used = used + 1, updated_at = CURRENT_TIMESTAMP
    WHERE ip_hash = ? AND day = ? AND used < ?
    RETURNING used
  `).bind(visitor.ipHash, visitor.day, IP_DAILY_CREDITS).first();

  if (!ipResult) {
    await decrementUsage(env.VOICE_USAGE, visitor.clientHash, visitor.ipHash, visitor.day, { client: true, ip: false });
    throw accessError("NETWORK_LIMIT_REACHED", "This network has reached its sponsored voice allowance for today.", 429);
  }

  return formatAccess(clientResult, ipResult, env);
}

export async function enforceOwnKeyRateLimit(env, visitor) {
  await enforceMinuteLimit(env.VOICE_USAGE, `own-client:${visitor.clientHash}`, 20);
  await enforceMinuteLimit(env.VOICE_USAGE, `own-ip:${visitor.ipHash}`, 50);
}

export async function refundSponsoredCredit(env, visitor) {
  await decrementUsage(env.VOICE_USAGE, visitor.clientHash, visitor.ipHash, visitor.day, { client: true, ip: true });
}

export function withVisitorCookie(headers, visitor) {
  if (visitor.setCookie) headers.set("Set-Cookie", visitor.setCookie);
  return headers;
}

function formatAccess(client = {}, ip = {}, env = {}) {
  const used = Math.max(0, Number(client?.used) || 0);
  const bonusUnlocked = Boolean(client?.bonusUnlocked);
  const total = BASE_DAILY_CREDITS + (bonusUnlocked ? BONUS_DAILY_CREDITS : 0);
  const ipUsed = Math.max(0, Number(ip?.used) || 0);
  return {
    sponsoredConfigured: Boolean(env.ELEVENLABS_API_KEY),
    used,
    total,
    remaining: Math.max(0, Math.min(total - used, IP_DAILY_CREDITS - ipUsed)),
    bonusUnlocked,
    bonusAvailable: !bonusUnlocked && used >= BASE_DAILY_CREDITS,
    baseCredits: BASE_DAILY_CREDITS,
    bonusCredits: BONUS_DAILY_CREDITS,
    resetsAt: nextUtcMidnight()
  };
}

async function ensureDailyRows(database, visitor) {
  await database.batch([
    database.prepare(`
      INSERT OR IGNORE INTO voice_clients (client_hash, day, used, bonus_unlocked)
      VALUES (?, ?, 0, 0)
    `).bind(visitor.clientHash, visitor.day),
    database.prepare(`
      INSERT OR IGNORE INTO voice_ips (ip_hash, day, used)
      VALUES (?, ?, 0)
    `).bind(visitor.ipHash, visitor.day)
  ]);
}

async function enforceMinuteLimit(database, key, limit) {
  const window = Math.floor(Date.now() / 60000);
  const result = await database.prepare(`
    INSERT INTO rate_limits (rate_key, window, count)
    VALUES (?, ?, 1)
    ON CONFLICT(rate_key, window) DO UPDATE SET count = count + 1
      WHERE count < ?
    RETURNING count
  `).bind(key, window, limit).first();
  if (!result) throw accessError("RATE_LIMIT_REACHED", "Please wait a moment before generating more speech.", 429);
}

async function decrementUsage(database, clientHash, ipHash, day, targets) {
  const statements = [];
  if (targets.client) {
    statements.push(database.prepare(`
      UPDATE voice_clients SET used = MAX(0, used - 1), updated_at = CURRENT_TIMESTAMP
      WHERE client_hash = ? AND day = ?
    `).bind(clientHash, day));
  }
  if (targets.ip) {
    statements.push(database.prepare(`
      UPDATE voice_ips SET used = MAX(0, used - 1), updated_at = CURRENT_TIMESTAMP
      WHERE ip_hash = ? AND day = ?
    `).bind(ipHash, day));
  }
  if (statements.length) await database.batch(statements);
}

async function createClientCookie(clientId, secret) {
  const signature = await keyedHash(secret, `cookie:${clientId}`);
  return `${clientId}.${signature}`;
}

async function verifyClientCookie(value, secret) {
  if (!value || value.length > 180) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const clientId = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = await keyedHash(secret, `cookie:${clientId}`);
  return timingSafeEqual(supplied, expected) ? clientId : null;
}

async function keyedHash(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function serializeCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function nextUtcMidnight() {
  const date = new Date();
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function requireBindings(env) {
  if (!env.VOICE_USAGE) throw accessError("USAGE_DATABASE_NOT_CONFIGURED", "Voice usage tracking is not configured.", 503);
  if (!env.ABUSE_HASH_SECRET) throw accessError("USAGE_SECRET_NOT_CONFIGURED", "Voice usage signing is not configured.", 503);
}

export function accessError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
