import assert from "node:assert/strict";
import test from "node:test";
import {
  createElevenLabsRequest,
  createVisemesFromElevenLabsAlignment,
  normalizeElevenLabsVoices
} from "./src/elevenlabs.js";

test("creates a natural ElevenLabs request with the selected speech speed", () => {
  const request = createElevenLabsRequest({ text: "Hello", rate: 1.12 });
  assert.equal(request.text, "Hello");
  assert.equal(request.model_id, "eleven_multilingual_v2");
  assert.equal(request.voice_settings.speed, 1.12);
  assert.equal(request.voice_settings.use_speaker_boost, true);
});

test("turns ElevenLabs character timing into a closed viseme timeline", () => {
  const events = createVisemesFromElevenLabsAlignment({
    characters: ["M", "a", " ", "v"],
    character_start_times_seconds: [0, 0.08, 0.17, 0.23],
    character_end_times_seconds: [0.08, 0.17, 0.23, 0.34]
  });
  assert.deepEqual(events.slice(0, 5), [
    { id: 21, offsetMs: 0 },
    { id: 2, offsetMs: 80 },
    { id: 0, offsetMs: 170 },
    { id: 18, offsetMs: 230 },
    { id: 0, offsetMs: 420 }
  ]);
});

test("normalizes and prioritizes female ElevenLabs voices", () => {
  const voices = normalizeElevenLabsVoices({ voices: [
    { voice_id: "male-voice", name: "B", labels: { gender: "male" } },
    { voice_id: "female-voice", name: "A", labels: { gender: "female", accent: "American" } }
  ] });
  assert.equal(voices[0].id, "female-voice");
  assert.equal(voices[0].accent, "American");
});
