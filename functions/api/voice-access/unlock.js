import { resolveVoiceVisitor, unlockBonus, withVisitorCookie } from "../_lib/voice-access.js";

export async function onRequestPost({ request, env }) {
  try {
    const visitor = await resolveVoiceVisitor(request, env);
    const access = await unlockBonus(env, visitor);
    return json(access, 200, visitor);
  } catch (error) {
    return json({ error: error.message, code: error.code || "BONUS_UNLOCK_FAILED" }, error.status || 500);
  }
}

function json(value, status = 200, visitor = null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if (visitor) withVisitorCookie(headers, visitor);
  return new Response(JSON.stringify(value), { status, headers });
}
