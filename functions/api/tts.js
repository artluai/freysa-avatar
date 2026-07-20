import { DEFAULT_AZURE_VOICE, synthesizeAzureRest } from "../../src/azure-tts.js";
import { normalizeSpeechRate } from "../../src/speech-rate.js";

export async function onRequestPost({ request, env }) {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    return json({
      error: "Azure Speech is not configured.",
      required: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"]
    }, 503);
  }

  try {
    const payload = await request.json();
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text || text.length > 1000) {
      return json({ error: "Text must contain 1 to 1000 characters." }, 400);
    }

    const voice = typeof payload?.voice === "string" && payload.voice.trim()
      ? payload.voice.trim()
      : env.AZURE_SPEECH_VOICE || DEFAULT_AZURE_VOICE;
    const speech = await synthesizeAzureRest({
      key: env.AZURE_SPEECH_KEY,
      region: env.AZURE_SPEECH_REGION,
      text,
      voice,
      rate: normalizeSpeechRate(payload?.rate)
    });
    return json(speech);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
