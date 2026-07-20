import assert from "node:assert/strict";
import test from "node:test";

import { FACIAL_WEIGHT_LIMITS, limitFacialWeight, speechFacialGain } from "./src/visemes.js";


test("limits the excessive KeenTools speech targets", () => {
  assert.equal(limitFacialWeight("jawOpen", 0.9), FACIAL_WEIGHT_LIMITS.jawOpen);
  assert.equal(limitFacialWeight("mouthClose", 0.9), FACIAL_WEIGHT_LIMITS.mouthClose);
  assert.equal(limitFacialWeight("mouthFunnel", 0.9), FACIAL_WEIGHT_LIMITS.mouthFunnel);
  assert.equal(limitFacialWeight("mouthLowerDownLeft", 0.9), FACIAL_WEIGHT_LIMITS.mouthLowerDownLeft);
  assert.equal(limitFacialWeight("mouthLowerDownRight", 0.9), FACIAL_WEIGHT_LIMITS.mouthLowerDownRight);
});

test("leaves other valid ARKit weights unchanged", () => {
  assert.equal(limitFacialWeight("mouthPucker", 0.42), 0.42);
  assert.equal(limitFacialWeight("eyeBlinkLeft", 1), 1);
});

test("normalizes invalid and out-of-range weights", () => {
  assert.equal(limitFacialWeight("jawOpen", -0.5), 0);
  assert.equal(limitFacialWeight("mouthPucker", 3), 1);
  assert.equal(limitFacialWeight("mouthPucker", Number.NaN), 0);
});

test("speech tuning restrains the lower lip and strengthens upper-lip articulation", () => {
  assert.ok(speechFacialGain("mouthLowerDownLeft") < speechFacialGain("mouthUpperUpLeft"));
  assert.ok(speechFacialGain("mouthRollLower") < speechFacialGain("mouthRollUpper"));
  assert.ok(speechFacialGain("mouthShrugLower") < speechFacialGain("mouthShrugUpper"));
  assert.ok(speechFacialGain("jawOpen") < speechFacialGain("mouthUpperUpLeft"));
});
