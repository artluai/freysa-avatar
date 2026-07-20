import test from "node:test";
import assert from "node:assert/strict";
import { buildFreysaMessages, generateFreysaReply } from "./src/glm.js";

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
