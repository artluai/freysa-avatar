import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_PROVIDERS,
  chooseDefaultVoiceProvider,
  loadVoiceSettings,
  migrateDefaultVoiceProvider,
  saveVoiceSettings
} from "./src/voice-settings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test("prefers Microsoft when both hosted voice providers are configured", () => {
  assert.equal(
    chooseDefaultVoiceProvider({ elevenLabsConfigured: true, azureSpeechConfigured: true }),
    VOICE_PROVIDERS.AZURE
  );
});

test("migrates the previous sponsored ElevenLabs default to Microsoft once", () => {
  const settings = {
    provider: VOICE_PROVIDERS.ELEVENLABS_SPONSORED,
    defaultProviderVersion: 0
  };
  assert.equal(migrateDefaultVoiceProvider(settings, { azureSpeechConfigured: true }), true);
  assert.equal(settings.provider, VOICE_PROVIDERS.AZURE);
  assert.equal(settings.defaultProviderVersion, 1);
  settings.provider = VOICE_PROVIDERS.ELEVENLABS_SPONSORED;
  assert.equal(migrateDefaultVoiceProvider(settings, { azureSpeechConfigured: true }), false);
  assert.equal(settings.provider, VOICE_PROVIDERS.ELEVENLABS_SPONSORED);
});

test("preserves an existing personal ElevenLabs choice during the default migration", () => {
  const settings = {
    provider: VOICE_PROVIDERS.ELEVENLABS_OWN_KEY,
    defaultProviderVersion: 0
  };
  assert.equal(migrateDefaultVoiceProvider(settings, { azureSpeechConfigured: true }), true);
  assert.equal(settings.provider, VOICE_PROVIDERS.ELEVENLABS_OWN_KEY);
});

test("stores the provider and voice persistently but keeps the personal key in session", () => {
  const local = memoryStorage();
  const session = memoryStorage();
  saveVoiceSettings({
    provider: VOICE_PROVIDERS.ELEVENLABS_OWN_KEY,
    voiceId: "voice-123456",
    voiceName: "Freysa",
    defaultProviderVersion: 1,
    curatedDefaultVersion: 1,
    pronunciationRulesEnabled: false,
    ownApiKey: "secret-key"
  }, local, session);
  const result = loadVoiceSettings(local, session);
  assert.equal(result.voiceId, "voice-123456");
  assert.equal(result.defaultProviderVersion, 1);
  assert.equal(result.curatedDefaultVersion, 1);
  assert.equal(result.ownApiKey, "secret-key");
  assert.equal(result.pronunciationRulesEnabled, false);
  assert.equal(local.getItem("freysa-voice-settings").includes("secret-key"), false);
});

test("enables Freysa pronunciation rules by default", () => {
  const settings = loadVoiceSettings(memoryStorage(), memoryStorage());
  assert.equal(settings.pronunciationRulesEnabled, true);
  assert.equal(settings.defaultProviderVersion, 0);
  assert.equal(settings.curatedDefaultVersion, 0);
});
