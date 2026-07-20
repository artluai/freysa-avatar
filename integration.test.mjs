import test from "node:test";
import assert from "node:assert/strict";
import { createPerformancePlan, INTEGRATION_MODES } from "./src/integration.js";

test("directed mode preserves the host script and emotion", () => {
  const plan = createPerformancePlan({
    mode: INTEGRATION_MODES.DIRECTED,
    text: "The host controls this line.",
    emotion: { name: "suspicious", intensity: 0.4 }
  });
  assert.equal(plan.text, "The host controls this line.");
  assert.deepEqual(plan.emotion, { name: "suspicious", intensity: 0.4 });
  assert.deepEqual(plan.controlledBy, { script: "host", emotion: "host" });
});

test("emotion-assist mode preserves the script and assigns an emotion", () => {
  const plan = createPerformancePlan({
    mode: INTEGRATION_MODES.EMOTION_ASSIST,
    text: "I am uncertain that this claim is true."
  });
  assert.equal(plan.text, "I am uncertain that this claim is true.");
  assert.equal(plan.emotion.name, "doubtful");
  assert.deepEqual(plan.controlledBy, { script: "host", emotion: "freysa" });
});

test("full Freysa mode creates a memory-grounded script and emotion", () => {
  const plan = createPerformancePlan({
    mode: INTEGRATION_MODES.FULL_FREYSA,
    message: "Tell me about yourself",
    conversationId: "wallet-123"
  });
  assert.match(plan.text, /first sovereign agent/i);
  assert.equal(plan.conversationId, "wallet-123");
  assert.deepEqual(plan.controlledBy, { script: "freysa", emotion: "freysa" });
});

test("directed mode rejects missing or unknown emotions", () => {
  assert.throws(
    () => createPerformancePlan({ mode: INTEGRATION_MODES.DIRECTED, text: "Hello" }),
    /requires an emotion/i
  );
  assert.throws(
    () => createPerformancePlan({ mode: INTEGRATION_MODES.DIRECTED, text: "Hello", emotion: "angry" }),
    /emotion must be one of/i
  );
});
