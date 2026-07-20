import { normalizeElevenLabsVoices } from "../../../src/elevenlabs.js";
import {
  curateElevenLabsVoices,
  findMissingCuratedVoices,
  selectSharedVoice
} from "../../../src/curated-voices.js";

export async function onRequestGet({ env }) {
  if (!env.ELEVENLABS_API_KEY) return json({ error: "Sponsored ElevenLabs is not configured." }, 503);
  return requestCuratedVoices(env.ELEVENLABS_API_KEY);
}

export async function onRequestPost({ request }) {
  const payload = await request.json().catch(() => ({}));
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 256) return json({ error: "Enter a valid ElevenLabs API key." }, 400);
  return requestVoices(apiKey);
}

async function requestVoices(apiKey) {
  try {
    const payload = await fetchAccountVoices(apiKey);
    return json({ voices: normalizeElevenLabsVoices(payload) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, error.status || 502);
  }
}

async function requestCuratedVoices(apiKey) {
  try {
    let accountVoices = normalizeElevenLabsVoices(await fetchAccountVoices(apiKey));
    const missingBeforeImport = findMissingCuratedVoices(accountVoices);
    const imported = [];
    const unavailable = [];

    for (const definition of missingBeforeImport) {
      try {
        const sharedVoice = selectSharedVoice(await searchSharedVoices(apiKey, definition.search), definition);
        if (!sharedVoice?.voice_id || !sharedVoice?.public_owner_id) {
          unavailable.push(definition.search);
          continue;
        }
        await addSharedVoice(apiKey, sharedVoice);
        imported.push(sharedVoice.name);
      } catch {
        unavailable.push(definition.search);
      }
    }

    if (imported.length) accountVoices = normalizeElevenLabsVoices(await fetchAccountVoices(apiKey));
    const voices = curateElevenLabsVoices(accountVoices);
    const stillMissing = findMissingCuratedVoices(accountVoices).map((voice) => voice.search);
    return json({ voices, imported, missing: [...new Set([...stillMissing, ...unavailable])] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, error.status || 502);
  }
}

async function fetchAccountVoices(apiKey) {
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(elevenLabsError(payload, "ElevenLabs voice list failed."), response.status);
  return payload;
}

async function searchSharedVoices(apiKey, search) {
  const params = new URLSearchParams({
    search,
    page_size: "20",
    language: "en",
    locale: "en-US",
    gender: "female",
    accent: "american",
    include_custom_rates: "true"
  });
  const response = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
    headers: { "xi-api-key": apiKey }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(elevenLabsError(payload, `Could not find ${search}.`), response.status);
  return payload;
}

async function addSharedVoice(apiKey, voice) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(voice.public_owner_id)}/${encodeURIComponent(voice.voice_id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ new_name: voice.name, bookmarked: true })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(elevenLabsError(payload, `Could not add ${voice.name}.`), response.status);
  return payload;
}

function elevenLabsError(payload, fallback) {
  return payload?.detail?.message || payload?.detail?.status || payload?.message || fallback;
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
