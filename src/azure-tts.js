import { normalizeSpeechRate, speechRateToSsml } from "./speech-rate.js";

export const DEFAULT_AZURE_VOICE = "en-US-NancyMultilingualNeural";
export const AZURE_AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

export async function synthesizeAzureRest({
  key,
  region,
  text,
  voice = DEFAULT_AZURE_VOICE,
  rate = 1,
  fetchImpl = fetch
}) {
  if (!key || !region) throw new Error("Azure Speech is not configured.");
  if (!/^[a-z0-9-]+$/i.test(region)) throw new Error("Azure Speech region is invalid.");

  const response = await fetchImpl(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": AZURE_AUDIO_FORMAT,
        "User-Agent": "FreysaAvatar"
      },
      body: createAzureSsml(text, voice, rate)
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Azure Speech request failed (${response.status}).`);
  }

  return {
    audioBase64: bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    mimeType: "audio/mpeg",
    frameRate: 60,
    blendshapeFrames: [],
    visemes: [],
    voice,
    facialAnimationMode: "estimated"
  };
}

export function createAzureSsml(
  text,
  voice = DEFAULT_AZURE_VOICE,
  rate = 1,
  { facialExpression = false } = {}
) {
  const escapedText = escapeXml(String(text || ""));
  const escapedVoice = escapeXml(String(voice || DEFAULT_AZURE_VOICE));
  const escapedRate = speechRateToSsml(normalizeSpeechRate(rate));
  const microsoftNamespace = facialExpression
    ? ' xmlns:mstts="http://www.w3.org/2001/mstts"'
    : "";
  const visemeRequest = facialExpression
    ? '<mstts:viseme type="FacialExpression"/>'
    : "";
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"${microsoftNamespace} xml:lang="en-US"><voice name="${escapedVoice}">${visemeRequest}<prosody rate="${escapedRate}">${escapedText}</prosody></voice></speak>`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
