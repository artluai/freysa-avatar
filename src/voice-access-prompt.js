export const VOICE_ACCESS_PROMPT_STATES = Object.freeze({
  HIDDEN: "hidden",
  AVAILABLE: "available",
  EXHAUSTED: "exhausted"
});

export function voiceAccessPromptState(access, { sponsoredSelected = true } = {}) {
  if (!sponsoredSelected || !access?.sponsoredConfigured) {
    return VOICE_ACCESS_PROMPT_STATES.HIDDEN;
  }
  if (access?.bonusAvailable) return VOICE_ACCESS_PROMPT_STATES.AVAILABLE;
  if (Number(access?.remaining) <= 0) return VOICE_ACCESS_PROMPT_STATES.EXHAUSTED;
  return VOICE_ACCESS_PROMPT_STATES.HIDDEN;
}
