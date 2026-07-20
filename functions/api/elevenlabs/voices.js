import { normalizeElevenLabsVoices } from "../../../src/elevenlabs.js";

export async function onRequestGet({ env }) {
  if (!env.ELEVENLABS_API_KEY) return json({ error: "Sponsored ElevenLabs is not configured." }, 503);
  return requestVoices(env.ELEVENLABS_API_KEY);
}

export async function onRequestPost({ request }) {
  const payload = await request.json().catch(() => ({}));
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 256) return json({ error: "Enter a valid ElevenLabs API key." }, 400);
  return requestVoices(apiKey);
}

async function requestVoices(apiKey) {
  try {
    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=50", {
      headers: { "xi-api-key": apiKey }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: elevenLabsError(payload, "ElevenLabs voice list failed.") }, response.status);
    return json({ voices: normalizeElevenLabsVoices(payload) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

function elevenLabsError(payload, fallback) {
  return payload?.detail?.message || payload?.detail?.status || payload?.message || fallback;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
