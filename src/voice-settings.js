export const VOICE_PROVIDERS = Object.freeze({
  AZURE: "azure",
  ELEVENLABS_SPONSORED: "elevenlabs-sponsored",
  ELEVENLABS_OWN_KEY: "elevenlabs-own-key",
  BROWSER: "browser"
});

export function loadVoiceSettings(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem("freysa-voice-settings") || "{}");
  } catch {
    saved = {};
  }

  return {
    provider: Object.values(VOICE_PROVIDERS).includes(saved.provider) ? saved.provider : null,
    voiceId: typeof saved.voiceId === "string" ? saved.voiceId : "",
    voiceName: typeof saved.voiceName === "string" ? saved.voiceName : "",
    pronunciationRulesEnabled: saved.pronunciationRulesEnabled !== false,
    ownApiKey: session?.getItem("freysa-elevenlabs-key") || ""
  };
}

export function saveVoiceSettings(settings, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  storage?.setItem("freysa-voice-settings", JSON.stringify({
    provider: settings.provider,
    voiceId: settings.voiceId,
    voiceName: settings.voiceName,
    pronunciationRulesEnabled: settings.pronunciationRulesEnabled !== false
  }));
  if (settings.ownApiKey) session?.setItem("freysa-elevenlabs-key", settings.ownApiKey);
  else session?.removeItem("freysa-elevenlabs-key");
}

export function chooseDefaultVoiceProvider({ elevenLabsConfigured, azureSpeechConfigured }) {
  if (elevenLabsConfigured) return VOICE_PROVIDERS.ELEVENLABS_SPONSORED;
  if (azureSpeechConfigured) return VOICE_PROVIDERS.AZURE;
  return VOICE_PROVIDERS.BROWSER;
}
