import test from "node:test";
import assert from "node:assert/strict";
import { issueAzureSpeechToken } from "./src/azure-token.js";

test("Azure Speech token exchange uses the regional endpoint", async () => {
  let requestUrl;
  let requestOptions;
  const authorization = await issueAzureSpeechToken({
    key: "test-key",
    region: "eastus",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response("temporary-token");
    }
  });

  assert.equal(requestUrl, "https://eastus.api.cognitive.microsoft.com/sts/v1.0/issueToken");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers["Ocp-Apim-Subscription-Key"], "test-key");
  assert.equal(authorization.token, "temporary-token");
  assert.equal(authorization.expiresInSeconds, 540);
});
