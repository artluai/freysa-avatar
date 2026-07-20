import { normalizeSpeechRate } from "./speech-rate.js";

export const ELEVENLABS_MODEL = "eleven_multilingual_v2";

export function createElevenLabsRequest({ text, rate = 1, modelId = ELEVENLABS_MODEL }) {
  return {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.48,
      similarity_boost: 0.78,
      style: 0.18,
      use_speaker_boost: true,
      speed: normalizeSpeechRate(rate)
    }
  };
}

export function createVisemesFromElevenLabsAlignment(alignment) {
  const characters = Array.isArray(alignment?.characters) ? alignment.characters : [];
  const starts = Array.isArray(alignment?.character_start_times_seconds)
    ? alignment.character_start_times_seconds
    : [];
  const events = [{ id: 0, offsetMs: 0 }];

  for (let index = 0; index < Math.min(characters.length, starts.length); index += 1) {
    const offsetMs = Math.max(0, Math.round(Number(starts[index]) * 1000));
    events.push({ id: visemeIdForCharacter(characters[index]), offsetMs });
  }

  const ends = Array.isArray(alignment?.character_end_times_seconds)
    ? alignment.character_end_times_seconds
    : [];
  const finalSeconds = Number(ends.at(-1) ?? starts.at(-1) ?? 0);
  events.push({ id: 0, offsetMs: Math.max(0, Math.round(finalSeconds * 1000) + 80) });
  return dedupeTimedEvents(events);
}

export function normalizeElevenLabsVoices(payload) {
  const voices = Array.isArray(payload?.voices) ? payload.voices : [];
  return voices
    .filter((voice) => typeof voice?.voice_id === "string" && typeof voice?.name === "string")
    .map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category || "voice",
      accent: voice.labels?.accent || "",
      gender: voice.labels?.gender || "",
      description: voice.labels?.description || voice.description || "",
      previewUrl: voice.preview_url || null
    }))
    .sort((left, right) => {
      const leftFemale = left.gender.toLowerCase() === "female" ? 0 : 1;
      const rightFemale = right.gender.toLowerCase() === "female" ? 0 : 1;
      return leftFemale - rightFemale || left.name.localeCompare(right.name);
    })
    .slice(0, 50);
}

function visemeIdForCharacter(character) {
  const value = String(character || "").toLowerCase();
  if (/\s|[.!?,;:]/.test(value)) return 0;
  if ("pbm".includes(value)) return 21;
  if ("fv".includes(value)) return 18;
  if ("tdn".includes(value)) return 19;
  if ("kgq".includes(value)) return 20;
  if ("szx".includes(value)) return 15;
  if ("cj".includes(value)) return 16;
  if ("lr".includes(value)) return 14;
  if ("wou".includes(value)) return 7;
  if ("eiy".includes(value)) return 6;
  if (value === "a") return 2;
  if (value === "h") return 12;
  return 1;
}

function dedupeTimedEvents(events) {
  const result = [];
  for (const event of events) {
    const previous = result.at(-1);
    if (previous && previous.offsetMs === event.offsetMs) {
      previous.id = event.id;
    } else {
      result.push({ ...event });
    }
  }
  return result;
}
