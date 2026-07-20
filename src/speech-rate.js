export const DEFAULT_SPEECH_RATE_RANGE = Object.freeze({ minimum: 0.75, maximum: 1.25 });
export const ELEVENLABS_SPEECH_RATE_RANGE = Object.freeze({ minimum: 0.7, maximum: 1.2 });

export function speechRateFromControl(value, range = DEFAULT_SPEECH_RATE_RANGE) {
  const control = clamp(Number(value), 0, 1, 0.5);
  const minimum = clamp(Number(range?.minimum), 0.1, 1, DEFAULT_SPEECH_RATE_RANGE.minimum);
  const maximum = clamp(Number(range?.maximum), 1, 4, DEFAULT_SPEECH_RATE_RANGE.maximum);
  if (control <= 0.5) return minimum + control * 2 * (1 - minimum);
  return 1 + (control - 0.5) * 2 * (maximum - 1);
}

export function normalizeSpeechRate(value, range = DEFAULT_SPEECH_RATE_RANGE) {
  return clamp(Number(value), range.minimum, range.maximum, 1);
}

export function speechRateToSsml(value) {
  const percentage = Math.round((normalizeSpeechRate(value) - 1) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

function clamp(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}
