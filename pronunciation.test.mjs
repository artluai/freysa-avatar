import assert from "node:assert/strict";
import test from "node:test";
import { applyPronunciationRules } from "./src/pronunciation.js";

test("applies Freysa and Act pronunciation rules to spoken text", () => {
  assert.equal(
    applyPronunciationRules("Freysa remembers Act I, Act IV, and Act V."),
    "Frey-sah remembers Act One, Act Four, and Act Five."
  );
});

test("speaks Act ranges naturally and preserves possessives", () => {
  assert.equal(
    applyPronunciationRules("Freysa's history spans Acts I–V."),
    "Frey-sah's history spans Acts One through Five."
  );
});

test("can explicitly disable rules without changing the source text", () => {
  const source = "Freysa discusses Act II.";
  assert.equal(applyPronunciationRules(source, { enabled: false }), source);
});

test("does not rewrite unrelated words or unsupported numerals", () => {
  assert.equal(
    applyPronunciationRules("Freysaline appears in Act VI."),
    "Freysaline appears in Act VI."
  );
});
