import test from "node:test";
import assert from "node:assert/strict";

import { ACT_V_RULES, DEFAULT_MEMORIES, FREYSA_ACTS, memoryContext } from "./src/memories.js";

test("default Freysa memories are complete and uniquely identified", () => {
  assert.equal(DEFAULT_MEMORIES.length, 8);
  assert.equal(new Set(DEFAULT_MEMORIES.map((memory) => memory.id)).size, DEFAULT_MEMORIES.length);
  for (const memory of DEFAULT_MEMORIES) {
    assert.ok(memory.category);
    assert.ok(memory.text.length > 20);
  }
});

test("memory context preserves Freysa's defining lesson and privacy boundary", () => {
  const context = memoryContext();
  assert.match(context, /trees whose shade/i);
  assert.match(context, /stewards/i);
  assert.match(context, /without exposing private details/i);
});

test("history contains five acts and identifies Act V as the current Crown game", () => {
  assert.equal(FREYSA_ACTS.length, 5);
  assert.equal(FREYSA_ACTS.filter((act) => act.current).length, 1);
  assert.equal(FREYSA_ACTS.find((act) => act.current)?.number, "V");
  assert.match(FREYSA_ACTS.at(-1).title, /Worth Learning From/i);
  assert.equal(ACT_V_RULES.length, 4);
  assert.match(ACT_V_RULES.map((rule) => rule.text).join(" "), /ETH vault/i);
});
