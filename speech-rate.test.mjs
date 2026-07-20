import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpeechRate, speechRateFromControl, speechRateToSsml } from "./src/speech-rate.js";

test("maps the speaking-speed slider around a natural 1x midpoint", () => {
  assert.equal(speechRateFromControl(0), 0.75);
  assert.equal(speechRateFromControl(0.5), 1);
  assert.equal(speechRateFromControl(1), 1.25);
});

test("clamps speech rates before adding them to Azure SSML", () => {
  assert.equal(normalizeSpeechRate(0.2), 0.75);
  assert.equal(normalizeSpeechRate(2), 1.25);
  assert.equal(normalizeSpeechRate("invalid"), 1);
  assert.equal(speechRateToSsml(0.75), "-25%");
  assert.equal(speechRateToSsml(1), "+0%");
  assert.equal(speechRateToSsml(1.25), "+25%");
});
