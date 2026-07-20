import { DEFAULT_AZURE_VOICE } from "../../src/azure-tts.js";

export function onRequestGet({ env }) {
  const azureSpeechConfigured = Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION);
  return new Response(JSON.stringify({
    azureSpeechConfigured,
    voice: env.AZURE_SPEECH_VOICE || DEFAULT_AZURE_VOICE,
    speechMode: azureSpeechConfigured ? "browser-sdk" : "none",
    facialAnimationMode: azureSpeechConfigured ? "azure-facial-expression" : "estimated"
  }), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
