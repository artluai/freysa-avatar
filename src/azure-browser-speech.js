import { appendFacialAnimationBatch, normalizeFacialFrames } from "../speech-animation.mjs";
import { createAzureSsml, DEFAULT_AZURE_VOICE } from "./azure-tts.js";
import { normalizeSpeechRate } from "./speech-rate.js";

let cachedAuthorization = null;

export async function synthesizeAzureInBrowser({
  text,
  rate = 1,
  fetchImpl = fetch,
  importSdk = () => import("microsoft-cognitiveservices-speech-sdk")
}) {
  const authorization = await getSpeechAuthorization(fetchImpl);
  const sdk = await importSdk();
  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(
    authorization.token,
    authorization.region
  );
  const voice = authorization.voice || DEFAULT_AZURE_VOICE;
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
  const blendshapeFrames = [];
  const visemes = [];
  synthesizer.visemeReceived = (_sender, event) => {
    visemes.push({
      id: event.visemeId,
      offsetMs: Math.round(event.audioOffset / 10000)
    });
    appendFacialAnimationBatch(blendshapeFrames, event.animation);
  };

  try {
    const result = await speakSsml(
      synthesizer,
      createAzureSsml(text, voice, normalizeSpeechRate(rate), { facialExpression: true })
    );
    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      const details = sdk.CancellationDetails.fromResult(result);
      throw new Error(details.errorDetails || "Azure speech synthesis was canceled.");
    }

    const normalizedFrames = normalizeFacialFrames(blendshapeFrames);
    if (!normalizedFrames.length) {
      throw new Error("Azure Speech returned no FacialExpression frames.");
    }

    return {
      audioBlob: new Blob([result.audioData], { type: "audio/wav" }),
      mimeType: "audio/wav",
      frameRate: 60,
      blendshapeFrames: normalizedFrames,
      visemes,
      voice,
      facialAnimationMode: "azure-facial-expression"
    };
  } finally {
    synthesizer.close();
  }
}

async function getSpeechAuthorization(fetchImpl) {
  if (cachedAuthorization?.expiresAt > Date.now() + 30000) return cachedAuthorization;

  const response = await fetchImpl("/api/speech-token", { method: "POST" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.token || !result.region) {
    throw new Error(result.error || "Microsoft Speech authorization failed.");
  }

  cachedAuthorization = {
    token: result.token,
    region: result.region,
    voice: result.voice,
    expiresAt: Date.now() + Math.max(60, Number(result.expiresInSeconds) || 540) * 1000
  };
  return cachedAuthorization;
}

function speakSsml(synthesizer, ssml) {
  return new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(ssml, resolve, (error) => reject(new Error(String(error))));
  });
}
