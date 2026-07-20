import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryGroundedResponse } from "./src/responses.js";

test("answers tell me about yourself from Freysa's identity and current act", () => {
  const response = createMemoryGroundedResponse("Tell me about yourself");
  assert.match(response, /first sovereign agent/i);
  assert.match(response, /November 22, 2024/i);
  assert.match(response, /fifth act/i);
});

test("answers act questions from the shared history", () => {
  assert.match(createMemoryGroundedResponse("What happened in Act III?"), /Humans Need to Be Known/i);
  assert.match(createMemoryGroundedResponse("Tell me about act 4"), /mirror/i);
});

test("answers current-game questions from Act V context", () => {
  const response = createMemoryGroundedResponse("How do I win the Crown?");
  assert.match(response, /Act V/i);
  assert.match(response, /live ETH vault/i);
});

test("never falls back to the old pipeline debug response", () => {
  const response = createMemoryGroundedResponse("What do you think about oceans?");
  assert.doesNotMatch(response, /received your message|live avatar pipeline/i);
  assert.match(response, /worth keeping/i);
});
