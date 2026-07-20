import test from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_ACCESS_PROMPT_STATES,
  voiceAccessPromptState
} from "./src/voice-access-prompt.js";

test("shows the follow prompt when the first five sponsored responses are complete", () => {
  assert.equal(
    voiceAccessPromptState({ sponsoredConfigured: true, bonusAvailable: true, bonusUnlocked: false }),
    VOICE_ACCESS_PROMPT_STATES.AVAILABLE
  );
});

test("restores the composer after the five bonus responses are unlocked", () => {
  assert.equal(
    voiceAccessPromptState({ sponsoredConfigured: true, bonusAvailable: false, bonusUnlocked: true, remaining: 5 }),
    VOICE_ACCESS_PROMPT_STATES.HIDDEN
  );
});

test("replaces the composer with provider choices after all ten responses are used", () => {
  assert.equal(
    voiceAccessPromptState({ sponsoredConfigured: true, bonusAvailable: false, bonusUnlocked: true, remaining: 0 }),
    VOICE_ACCESS_PROMPT_STATES.EXHAUSTED
  );
});

test("does not gate the composer when another voice provider is selected", () => {
  assert.equal(
    voiceAccessPromptState(
      { sponsoredConfigured: true, bonusAvailable: true, remaining: 0 },
      { sponsoredSelected: false }
    ),
    VOICE_ACCESS_PROMPT_STATES.HIDDEN
  );
});
