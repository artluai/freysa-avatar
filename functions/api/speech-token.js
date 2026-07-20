import { DEFAULT_AZURE_VOICE } from "../../src/azure-tts.js";
import { issueAzureSpeechToken } from "../../src/azure-token.js";

export async function onRequestPost({ env }) {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    return json({ error: "Azure Speech is not configured." }, 503);
  }

  try {
    const authorization = await issueAzureSpeechToken({
      key: env.AZURE_SPEECH_KEY,
      region: env.AZURE_SPEECH_REGION
    });
    return json({
      ...authorization,
      voice: env.AZURE_SPEECH_VOICE || DEFAULT_AZURE_VOICE
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
