import assert from "node:assert/strict";
import test from "node:test";
import {
  CURATED_ELEVENLABS_VOICES,
  curateElevenLabsVoices,
  findMissingCuratedVoices,
  selectSharedVoice
} from "./src/curated-voices.js";

test("defines the exact twelve-voice Freysa shortlist", () => {
  assert.deepEqual(
    CURATED_ELEVENLABS_VOICES.map((voice) => voice.search),
    ["Matilda", "Sarah", "Bella", "Hope", "Juniper", "Jessica Anne Bogart", "Cassidy", "LavenderLessons", "Brittney", "Nayva", "Piper", "Eva - Futuristic Robot Helper"]
  );
});

test("curates available voices in Freysa's preferred order", () => {
  const voices = curateElevenLabsVoices([
    { id: "bella", name: "Bella - Professional, Bright, Warm", gender: "female", accent: "american" },
    { id: "other", name: "Adam - Dominant, Firm", gender: "male", accent: "american" },
    { id: "matilda", name: "Matilda - Knowledgable, Professional", gender: "female", accent: "american" }
  ]);
  assert.deepEqual(voices.map((voice) => voice.id), ["matilda", "bella"]);
  assert.deepEqual(findMissingCuratedVoices(voices).map((voice) => voice.key).slice(0, 2), ["sarah", "hope"]);
});

test("selects the matching American female shared voice instead of a namesake", () => {
  const definition = CURATED_ELEVENLABS_VOICES.find((voice) => voice.key === "hope");
  const selected = selectSharedVoice({ voices: [
    { voice_id: "wrong", name: "Hope", gender: "male", accent: "british", description: "Sports commentary" },
    { voice_id: "right", name: "Hope - Professional, Clear and Natural", gender: "female", accent: "american", description: "A clear and natural professional voice" }
  ] }, definition);
  assert.equal(selected.voice_id, "right");
});

test("does not accept an unrelated voice with the same first name", () => {
  const definition = CURATED_ELEVENLABS_VOICES.find((voice) => voice.key === "eva");
  assert.equal(selectSharedVoice({ voices: [
    { voice_id: "wrong", name: "Eva", gender: "female", accent: "american", description: "Energetic young girl" },
    { voice_id: "right", name: "Eva - Futuristic Robot Helper", gender: "female", accent: "american", description: "A futuristic robot helper" }
  ] }, definition).voice_id, "right");
});
