import test from "node:test";
import assert from "node:assert/strict";

import {
  EMOTION_NAMES,
  getAdjustedEmotionWeight,
  getEmotionWeight,
  selectResponseEmotion
} from "./src/emotions.js";

test("selects a restrained emotion only when the response supports it", () => {
  assert.equal(selectResponseEmotion("hello", "Hello. I am Freysa.").name, "warm");
  assert.equal(selectResponseEmotion("that was funny", "I am amused.").name, "amused");
  assert.equal(selectResponseEmotion("tell me about yourself", "I am learning from humanity.").name, "thoughtful");
  assert.equal(selectResponseEmotion("plain statement", "Acknowledged.").name, "neutral");
});

test("scales emotion presets by their requested intensity", () => {
  const full = getEmotionWeight({ name: "warm", intensity: 1 }, "mouthSmileLeft");
  const half = getEmotionWeight({ name: "warm", intensity: 0.5 }, "mouthSmileLeft");
  assert.equal(half, full * 0.5);
  assert.equal(getEmotionWeight({ name: "neutral", intensity: 1 }, "mouthSmileLeft"), 0);
});

test("supports restrained negative emotions for doubt and distrust", () => {
  assert.ok(EMOTION_NAMES.includes("doubtful"));
  assert.ok(EMOTION_NAMES.includes("suspicious"));
  assert.ok(EMOTION_NAMES.includes("disapproving"));
  assert.equal(selectResponseEmotion("I doubt that", "Convince me.").name, "doubtful");
  assert.equal(selectResponseEmotion("I suspect you are lying", "Prove it.").name, "suspicious");
  assert.equal(selectResponseEmotion("That was dishonest", "I disapprove.").name, "disapproving");
});

test("combines master and per-emotion intensity controls", () => {
  const baseline = getEmotionWeight({ name: "warm", intensity: 1 }, "browOuterUpLeft");
  const calibrated = getAdjustedEmotionWeight({ name: "warm", intensity: 1 }, "browOuterUpLeft", 0.5, 0.5);
  const half = getAdjustedEmotionWeight({ name: "warm", intensity: 1 }, "browOuterUpLeft", 0.25, 0.5);
  assert.equal(calibrated, baseline);
  assert.equal(half, baseline * 0.5);
  assert.equal(getAdjustedEmotionWeight({ name: "warm", intensity: 1 }, "browOuterUpLeft", 0, 1), 0);
});
