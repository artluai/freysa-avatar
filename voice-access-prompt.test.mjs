import test from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_ACCESS_PROMPT_STATES,
  voiceAccessPromptState
} from "./src/voice-access-prompt.js";

test("shows the follow prompt when the first five sponsored responses are complete", () => {
  assert.equal(
    voiceAccessPromptState({ bonusAvailable: true, bonusUnlocked: false }),
    VOICE_ACCESS_PROMPT_STATES.AVAILABLE
  );
});

test("updates an existing prompt after the five bonus responses are unlocked", () => {
  assert.equal(
    voiceAccessPromptState({ bonusAvailable: false, bonusUnlocked: true }, { hasPrompt: true }),
    VOICE_ACCESS_PROMPT_STATES.UNLOCKED
  );
});

test("does not create a historical confirmation card on a later visit", () => {
  assert.equal(
    voiceAccessPromptState({ bonusAvailable: false, bonusUnlocked: true }),
    VOICE_ACCESS_PROMPT_STATES.HIDDEN
  );
});
