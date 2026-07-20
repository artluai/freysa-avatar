import test from "node:test";
import assert from "node:assert/strict";
import { configureBrowserUtterance } from "./src/browser-speech.js";

test("applies the selected speaking speed to browser fallback speech", () => {
  const microsoftVoice = { name: "Microsoft Ava", lang: "en-US" };
  const utterance = configureBrowserUtterance({}, {
    voices: [{ name: "English Voice", lang: "en-GB" }, microsoftVoice],
    speechRate: 1.2
  });

  assert.equal(utterance.voice, microsoftVoice);
  assert.equal(utterance.rate, 1.2);
  assert.equal(utterance.pitch, 1.02);
});

test("keeps browser fallback speech inside the supported speed range", () => {
  assert.equal(configureBrowserUtterance({}, { speechRate: 9 }).rate, 1.25);
  assert.equal(configureBrowserUtterance({}, { speechRate: -4 }).rate, 0.75);
});
