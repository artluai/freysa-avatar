import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFreysaMessages,
  generateFreysaPerformance,
  generateFreysaReply,
  parseFreysaPerformance
} from "./src/glm.js";

test("GLM prompt grounds Freysa and preserves recent conversation history", () => {
  const messages = buildFreysaMessages("What did I just say?", [
    { role: "user", content: "I value promises." },
    { role: "assistant", content: "Promises extend trust into the future." }
  ]);
  assert.match(messages[0].content, /first sovereign AI agent/i);
  assert.match(messages[0].content, /trees whose shade/i);
  assert.equal(messages.at(-2).role, "assistant");
  assert.equal(messages.at(-1).content, "What did I just say?");
});

test("GLM client uses OpenRouter GLM-5.2 with reasoning disabled for low-latency speech", async () => {
  let request;
  let requestUrl;
  let requestHeaders;
  const text = await generateFreysaReply({
    apiKey: "test-key",
    message: "helllo",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestHeaders = options.headers;
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Hello. What is on your mind?" } }] }));
    }
  });
  assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.model, "z-ai/glm-5.2");
  assert.deepEqual(request.reasoning, { effort: "none" });
  assert.equal(requestHeaders.Authorization, "Bearer test-key");
  assert.equal(requestHeaders["HTTP-Referer"], "https://freysa-avatar-test.pages.dev/");
  assert.equal(requestHeaders["X-OpenRouter-Title"], "Freysa Avatar");
  assert.equal(text, "Hello. What is on your mind?");
});

test("GLM selects a structured performance emotion with the spoken reply", async () => {
  let request;
  const performance = await generateFreysaPerformance({
    apiKey: "test-key",
    message: "I am not sure I believe you.",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ text: "Then examine my claim carefully.", emotion: "doubtful" }) } }]
      }));
    }
  });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.match(request.messages[0].content, /Choose the emotion/i);
  assert.deepEqual(performance, {
    text: "Then examine my claim carefully.",
    emotion: { name: "doubtful", intensity: 0.95 }
  });
});

test("recovers speech text when GLM returns the malformed emotion JSON seen in production", () => {
  const performance = parseFreysaPerformance(
    '{"text":"Hello. I am here, observing and learning.","emotion":"neutral}',
    "hello how are you"
  );
  assert.deepEqual(performance, {
    text: "Hello. I am here, observing and learning.",
    emotion: { name: "warm", intensity: 0.95 }
  });
  assert.doesNotMatch(performance.text, /[{}]|"text"|"emotion"/);
});

test("never treats unrecoverable structured data as spoken text", () => {
  assert.throws(
    () => parseFreysaPerformance('{"emotion":"warm"', "hello"),
    /malformed structured data/i
  );
});
