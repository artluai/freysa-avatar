import { normalizeSpeechRate } from "./speech-rate.js";

export function configureBrowserUtterance(utterance, { voices = [], speechRate = 1 } = {}) {
  utterance.voice = voices.find((voice) => /microsoft/i.test(voice.name) && /^en/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
  utterance.rate = normalizeSpeechRate(speechRate);
  utterance.pitch = 1.02;
  return utterance;
}
