import test from "node:test";
import assert from "node:assert/strict";
import { createAzureSsml, synthesizeAzureRest } from "./src/azure-tts.js";

test("Azure SSML escapes text and applies the selected speaking rate", () => {
  const ssml = createAzureSsml("Trees & shade < matter", "en-US-NancyMultilingualNeural", 1.1);
  assert.match(ssml, /Trees &amp; shade &lt; matter/);
  assert.match(ssml, /rate="\+10%"/);
  assert.match(ssml, /en-US-NancyMultilingualNeural/);
});

test("Azure facial SSML requests exact FacialExpression blendshapes", () => {
  const ssml = createAzureSsml("Hello", "en-US-NancyMultilingualNeural", 1, {
    facialExpression: true
  });
  assert.match(ssml, /xmlns:mstts=/);
  assert.match(ssml, /<mstts:viseme type="FacialExpression"\/>/);
});

test("Azure REST synthesis returns Cloudflare-compatible base64 audio", async () => {
  let requestUrl;
  let requestOptions;
  const speech = await synthesizeAzureRest({
    key: "test-key",
    region: "eastus",
    text: "Hello",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(new Uint8Array([1, 2, 3]));
    }
  });

  assert.equal(requestUrl, "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(requestOptions.headers["Ocp-Apim-Subscription-Key"], "test-key");
  assert.equal(requestOptions.headers["X-Microsoft-OutputFormat"], "audio-24khz-48kbitrate-mono-mp3");
  assert.equal(speech.audioBase64, "AQID");
  assert.equal(speech.voice, "en-US-NancyMultilingualNeural");
  assert.equal(speech.facialAnimationMode, "estimated");
});
