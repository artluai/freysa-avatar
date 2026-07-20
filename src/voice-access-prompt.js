export const VOICE_ACCESS_PROMPT_STATES = Object.freeze({
  HIDDEN: "hidden",
  AVAILABLE: "available",
  UNLOCKED: "unlocked"
});

export function voiceAccessPromptState(access, { hasPrompt = false } = {}) {
  if (access?.bonusAvailable) return VOICE_ACCESS_PROMPT_STATES.AVAILABLE;
  if (hasPrompt && access?.bonusUnlocked) return VOICE_ACCESS_PROMPT_STATES.UNLOCKED;
  return VOICE_ACCESS_PROMPT_STATES.HIDDEN;
}
