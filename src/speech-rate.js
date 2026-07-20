export function speechRateFromControl(value) {
  const control = clamp(Number(value), 0, 1, 0.5);
  return 0.75 + control * 0.5;
}

export function normalizeSpeechRate(value) {
  return clamp(Number(value), 0.75, 1.25, 1);
}

export function speechRateToSsml(value) {
  const percentage = Math.round((normalizeSpeechRate(value) - 1) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

function clamp(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}
