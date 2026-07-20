import { createElevenLabsRequest, ELEVENLABS_MODEL } from "../../../src/elevenlabs.js";
import {
  enforceOwnKeyRateLimit,
  getVoiceAccess,
  refundSponsoredCredit,
  reserveSponsoredCredit,
  resolveVoiceVisitor,
  withVisitorCookie
} from "../_lib/voice-access.js";
import { verifyTurnstileIfConfigured } from "../_lib/turnstile.js";

export async function onRequestPost({ request, env }) {
  let visitor;
  let sponsoredReserved = false;
  try {
    const payload = await request.json();
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    const voiceId = typeof payload?.voiceId === "string" ? payload.voiceId.trim() : "";
    const ownApiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
    if (!text || text.length > 1000) return json({ error: "Text must contain 1 to 1000 characters." }, 400);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(voiceId)) return json({ error: "Choose a valid ElevenLabs voice." }, 400);
    if (ownApiKey.length > 256) return json({ error: "Enter a valid ElevenLabs API key." }, 400);

    visitor = await resolveVoiceVisitor(request, env);
    let apiKey = ownApiKey;
    let access = null;
    if (apiKey) {
      await enforceOwnKeyRateLimit(env, visitor);
    } else {
      if (!env.ELEVENLABS_API_KEY) return json({ error: "Sponsored ElevenLabs is not configured." }, 503, visitor);
      await verifyTurnstileIfConfigured({ env, request, token: payload.turnstileToken });
      apiKey = env.ELEVENLABS_API_KEY;
      access = await reserveSponsoredCredit(env, visitor);
      sponsoredReserved = true;
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify(createElevenLabsRequest({
          text,
          rate: payload.rate,
          modelId: payload.modelId || ELEVENLABS_MODEL
        }))
      }
    );
    const speech = await response.json().catch(() => ({}));
    if (!response.ok || !speech.audio_base64) {
      throw apiError(elevenLabsError(speech, "ElevenLabs speech generation failed."), response.status || 502);
    }

    return json({
      audioBase64: speech.audio_base64,
      mimeType: "audio/mpeg",
      alignment: speech.normalized_alignment || speech.alignment,
      voiceId,
      modelId: payload.modelId || ELEVENLABS_MODEL,
      access
    }, 200, visitor);
  } catch (error) {
    if (sponsoredReserved && visitor) await refundSponsoredCredit(env, visitor).catch(() => {});
    const code = error.code || "ELEVENLABS_REQUEST_FAILED";
    const access = visitor && ["DAILY_LIMIT_REACHED", "NETWORK_LIMIT_REACHED"].includes(code)
      ? await getVoiceAccess(env, visitor).catch(() => null)
      : null;
    return json({ error: error.message, code, ...(access ? { access } : {}) }, error.status || 502, visitor);
  }
}

function elevenLabsError(payload, fallback) {
  return payload?.detail?.message || payload?.detail?.status || payload?.message || fallback;
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(value, status = 200, visitor = null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if (visitor) withVisitorCookie(headers, visitor);
  return new Response(JSON.stringify(value), { status, headers });
}
