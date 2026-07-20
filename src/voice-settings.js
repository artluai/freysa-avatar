export const VOICE_PROVIDERS = Object.freeze({
  AZURE: "azure",
  ELEVENLABS_SPONSORED: "elevenlabs-sponsored",
  ELEVENLABS_OWN_KEY: "elevenlabs-own-key",
  BROWSER: "browser"
});

export const DEFAULT_PROVIDER_VERSION = 1;

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
    defaultProviderVersion: Number.isInteger(saved.defaultProviderVersion) ? saved.defaultProviderVersion : 0,
    curatedDefaultVersion: Number.isInteger(saved.curatedDefaultVersion) ? saved.curatedDefaultVersion : 0,
    pronunciationRulesEnabled: saved.pronunciationRulesEnabled !== false,
    ownApiKey: session?.getItem("freysa-elevenlabs-key") || ""
  };
}

export function saveVoiceSettings(settings, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
  storage?.setItem("freysa-voice-settings", JSON.stringify({
    provider: settings.provider,
    voiceId: settings.voiceId,
    voiceName: settings.voiceName,
    defaultProviderVersion: settings.defaultProviderVersion || 0,
    curatedDefaultVersion: settings.curatedDefaultVersion || 0,
    pronunciationRulesEnabled: settings.pronunciationRulesEnabled !== false
  }));
  if (settings.ownApiKey) session?.setItem("freysa-elevenlabs-key", settings.ownApiKey);
  else session?.removeItem("freysa-elevenlabs-key");
}

export function chooseDefaultVoiceProvider({ elevenLabsConfigured, azureSpeechConfigured }) {
  if (azureSpeechConfigured) return VOICE_PROVIDERS.AZURE;
  if (elevenLabsConfigured) return VOICE_PROVIDERS.ELEVENLABS_SPONSORED;
  return VOICE_PROVIDERS.BROWSER;
}

export function migrateDefaultVoiceProvider(
  settings,
  { azureSpeechConfigured, version = DEFAULT_PROVIDER_VERSION }
) {
  if (!azureSpeechConfigured || settings.defaultProviderVersion >= version) return false;
  settings.defaultProviderVersion = version;
  if (!settings.provider || settings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED) {
    settings.provider = VOICE_PROVIDERS.AZURE;
  }
  return true;
}
