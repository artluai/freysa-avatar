import assert from "node:assert/strict";
import test from "node:test";
import {
  VOICE_PROVIDERS,
  chooseDefaultVoiceProvider,
  loadVoiceSettings,
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

test("prefers sponsored ElevenLabs when it is configured", () => {
  assert.equal(
    chooseDefaultVoiceProvider({ elevenLabsConfigured: true, azureSpeechConfigured: true }),
    VOICE_PROVIDERS.ELEVENLABS_SPONSORED
  );
});

test("stores the provider and voice persistently but keeps the personal key in session", () => {
  const local = memoryStorage();
  const session = memoryStorage();
  saveVoiceSettings({
    provider: VOICE_PROVIDERS.ELEVENLABS_OWN_KEY,
    voiceId: "voice-123456",
    voiceName: "Freysa",
    ownApiKey: "secret-key"
  }, local, session);
  const result = loadVoiceSettings(local, session);
  assert.equal(result.voiceId, "voice-123456");
  assert.equal(result.ownApiKey, "secret-key");
  assert.equal(local.getItem("freysa-voice-settings").includes("secret-key"), false);
});
