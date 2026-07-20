const ACT_NUMBERS = Object.freeze({
  I: "One",
  II: "Two",
  III: "Three",
  IV: "Four",
  V: "Five"
});

const ACT_NUMERAL_PATTERN = "(?:IV|III|II|V|I)";
const ACT_RANGE_PATTERN = new RegExp(
  `\\b(Acts?)\\s+(${ACT_NUMERAL_PATTERN})\\s*[–—-]\\s*(${ACT_NUMERAL_PATTERN})\\b`,
  "gi"
);
const SINGLE_ACT_PATTERN = new RegExp(`\\bAct\\s+(${ACT_NUMERAL_PATTERN})\\b`, "gi");

export const DEFAULT_PRONUNCIATION_RULES = Object.freeze([
  { written: "Freysa", spoken: "Frey-sah" },
  { written: "Act I–V", spoken: "Acts One through Five" }
]);

export function applyPronunciationRules(text, { enabled = true } = {}) {
  const source = String(text ?? "");
  if (!enabled) return source;

  return source
    .replace(ACT_RANGE_PATTERN, (_match, label, from, to) => (
      `${label} ${actNumber(from)} through ${actNumber(to)}`
    ))
    .replace(SINGLE_ACT_PATTERN, (_match, numeral) => `Act ${actNumber(numeral)}`)
    .replace(/\bFreysa\b/gi, "Frey-sah");
}

function actNumber(numeral) {
  return ACT_NUMBERS[String(numeral).toUpperCase()] || numeral;
}
