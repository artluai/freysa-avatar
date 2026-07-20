import "./styles.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  ARKIT_BLENDSHAPE_NAMES,
  createFacialFramesFromVisemes,
  createSyntheticFacialFrames,
  limitFacialWeight,
  speechFacialGain
} from "./visemes.js";
import { EMOTION_NAMES, getAdjustedEmotionWeight } from "./emotions.js";
import { createPerformancePlan, INTEGRATION_MODES } from "./integration.js";
import {
  DEFAULT_SPEECH_RATE_RANGE,
  ELEVENLABS_SPEECH_RATE_RANGE,
  speechRateFromControl
} from "./speech-rate.js";
import { synthesizeAzureInBrowser } from "./azure-browser-speech.js";
import { createVisemesFromElevenLabsAlignment } from "./elevenlabs.js";
import { configureBrowserUtterance } from "./browser-speech.js";
import {
  VOICE_ACCESS_PROMPT_STATES,
  voiceAccessPromptState
} from "./voice-access-prompt.js";
import { applyPronunciationRules } from "./pronunciation.js";
import {
  VOICE_PROVIDERS,
  chooseDefaultVoiceProvider,
  loadVoiceSettings,
  saveVoiceSettings
} from "./voice-settings.js";
import {
  GAZE_CHANNEL_NAMES,
  avatarPositionFromDrag,
  cameraFixedGazeForRotation,
  isAvatarPositionDefault
} from "./avatar-position.js";

const canvas = document.querySelector("#avatar-canvas");
const avatarStatus = document.querySelector("#avatar-status");
const avatarStatusLabel = document.querySelector("#avatar-status-label");
const speechBadge = document.querySelector("#speech-badge");
const voiceNote = document.querySelector("#voice-note");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatComposer = document.querySelector("#chat-composer");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const voiceAccessGate = document.querySelector("#voice-access-gate");
const voiceAccessGateMessage = document.querySelector("#voice-access-gate-message");
const voiceAccessUnlockLink = document.querySelector("#voice-access-unlock-link");
const voiceAccessOwnKeyButton = document.querySelector("#voice-access-own-key-button");
const voiceAccessMicrosoftButton = document.querySelector("#voice-access-microsoft-button");
const performanceLabel = document.querySelector("#performance-label");
const emotionOptions = document.querySelector("#emotion-options");
const resetPositionButton = document.querySelector("#reset-position-button");
const settingsButton = document.querySelector("#settings-button");
const chatView = document.querySelector("#chat-view");
const settingsView = document.querySelector("#settings-view");
const settingsCloseButton = document.querySelector("#settings-close-button");
const voiceProviderMenu = document.querySelector("#voice-provider-menu");
const voiceProviderLabel = document.querySelector("#voice-provider-label");
const voiceProviderOptions = document.querySelector("#voice-provider-options");
const voiceProviderStatus = document.querySelector("#voice-provider-status");
const elevenLabsControls = document.querySelector("#elevenlabs-controls");
const elevenLabsKeyField = document.querySelector("#elevenlabs-key-field");
const elevenLabsApiKeyInput = document.querySelector("#elevenlabs-api-key");
const elevenLabsVoiceMenu = document.querySelector("#elevenlabs-voice-menu");
const elevenLabsVoiceLabel = document.querySelector("#elevenlabs-voice-label");
const elevenLabsVoiceOptions = document.querySelector("#elevenlabs-voice-options");
const loadVoicesButton = document.querySelector("#load-voices-button");
const previewVoiceButton = document.querySelector("#preview-voice-button");
const sponsoredAllowance = document.querySelector("#sponsored-allowance");
const allowanceCount = document.querySelector("#allowance-count");
const allowanceProgress = document.querySelector("#allowance-progress");
const allowanceMessage = document.querySelector("#allowance-message");
const followFreysaButton = document.querySelector("#follow-freysa-button");
const turnstileWidget = document.querySelector("#turnstile-widget");
const speakingSpeedSetting = document.querySelector("#speaking-speed-setting");
const pronunciationRulesButton = document.querySelector("#pronunciation-rules-button");
const pronunciationRulesButtonLabel = document.querySelector("#pronunciation-rules-button-label");
const pronunciationRulesContent = document.querySelector("#pronunciation-rules-content");
const pronunciationRulesToggle = document.querySelector("#pronunciation-rules-toggle");

const SPEECH_RELEASE_HOLD_MS = 140;
const SPEECH_RELEASE_FADE_MS = 760;
const EMOTION_HOLD_AFTER_SPEECH_MS = 650;
const MOBILE_VIEW_QUERY = "(max-width: 880px)";
const MOBILE_AVATAR_PITCH = THREE.MathUtils.degToRad(3.5);
const MOBILE_AVATAR_SCALE = 1.42;
const MOBILE_AVATAR_VERTICAL_OFFSET = -0.075;
const CURATED_DEFAULT_VOICE_VERSION = 2;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
camera.position.set(0, 0.02, 1.85);

scene.add(new THREE.HemisphereLight(0xe9fff4, 0x152019, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(1.5, 2.2, 2.8);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x69ff9b, 2.0);
rimLight.position.set(-2.5, 1.0, -1.5);
scene.add(rimLight);

const avatarRoot = new THREE.Group();
scene.add(avatarRoot);

let morphMeshes = [];
let avatarReady = false;
let activeFacialFrames = [];
let facialFrameRate = 60;
let facialDurationMs = 0;
let speechStartedAt = 0;
let isSpeaking = false;
let azureSpeechConfigured = false;
let azureSpeechMode = "server";
let elevenLabsConfigured = false;
let activeAudio = null;
let blinkStart = 0;
let nextBlinkAt = performance.now() + 1800;
let activeEmotion = { name: "neutral", intensity: 0 };
let emotionBlend = 0;
let emotionBlendTarget = 0;
let emotionReleaseTimer = 0;
let speechReleaseFrame = null;
let speechReleaseStartedAt = 0;
let emotionPreviewRun = 0;
const savedEmotionSettings = loadEmotionSettings();
let masterEmotionIntensity = savedEmotionSettings.master;
let speechRateControl = savedEmotionSettings.speechRate;
const emotionIntensityByName = savedEmotionSettings.emotions;
const runtimeEvents = new EventTarget();
let activePerformancePlan = null;
const runtimeConversationHistory = [];
const avatarPosition = { yaw: 0, pitch: 0 };
const avatarPositionTarget = { yaw: 0, pitch: 0 };
let positionPointerId = null;
let positionDragStart = null;
let lastPositionFrameAt = 0;
const voiceSettings = loadVoiceSettings();
let voiceAccess = null;
let availableElevenLabsVoices = [];
let turnstileSiteKey = "";
let turnstileWidgetId = null;

renderEmotionOptions();
installRuntimeApi();

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(
  "/freysa_head_arkit.glb",
  (gltf) => {
    const model = gltf.scene;
    model.traverse((object) => {
      if (object.isMesh) {
        object.frustumCulled = false;
        if (object.morphTargetDictionary && object.morphTargetInfluences) morphMeshes.push(object);
      }
    });

    frameModel(model);
    avatarRoot.add(model);
    avatarReady = morphMeshes.length > 0;
    avatarStatus.classList.toggle("ready", avatarReady);
    avatarStatusLabel.textContent = avatarReady
      ? `${morphMeshes.length} facial meshes · 51 ARKit channels`
      : "Avatar loaded without morph targets";
    if (avatarReady) emitRuntimeEvent("ready", getRuntimeState());
  },
  undefined,
  (error) => {
    console.error(error);
    avatarStatus.classList.add("error");
    avatarStatusLabel.textContent = "Avatar failed to load";
  }
);

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => {
    azureSpeechConfigured = Boolean(health.azureSpeechConfigured);
    elevenLabsConfigured = Boolean(health.elevenLabsConfigured);
    turnstileSiteKey = health.turnstileSiteKey || "";
    azureSpeechMode = health.speechMode || "server";
    if (!voiceSettings.provider) {
      voiceSettings.provider = chooseDefaultVoiceProvider({ elevenLabsConfigured, azureSpeechConfigured });
      saveVoiceSettings(voiceSettings);
    }
    syncVoiceSettingsUi();
    updateVoiceBadge(health.voice);
    return refreshVoiceAccess();
  })
  .catch(() => {
    azureSpeechConfigured = false;
    elevenLabsConfigured = false;
    voiceSettings.provider = voiceSettings.provider || VOICE_PROVIDERS.BROWSER;
    syncVoiceSettingsUi();
    speechBadge.textContent = "Browser voice fallback";
    speechBadge.classList.remove("error", "online");
    voiceNote.textContent = "The hosted test is using your browser voice; avatar motion and all three integration modes remain active.";
  });

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || sendButton.disabled) return;

  appendMessage("You", message, "user");
  chatInput.value = "";
  setBusy(true);
  let responseDisplayed = false;
  let plan = null;
  const displayResponse = () => {
    if (responseDisplayed || !plan) return;
    responseDisplayed = true;
    appendMessage("Freysa", plan.text, "freysa");
  };

  try {
    plan = await requestFullFreysaPlan({ message });
    await performPlan(plan, { onSpeechStart: displayResponse });
    syncVoiceAccessGate();
  } catch (error) {
    displayResponse();
    console.error(error);
    voiceNote.textContent = `Voice playback failed: ${error.message}`;
    releaseResponseEmotion();
  } finally {
    setBusy(false);
    chatInput.focus();
  }
});

emotionOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-emotion]");
  if (!button) return;
  const selection = button.dataset.emotion;
  showEmotionAdjustment(selection);
  runEmotionPreview(selection);
});

function handleSettingsSliderInput(event) {
  const input = event.target.closest("input[data-intensity-target]");
  if (!input) return;
  const value = Number(input.value) / 100;
  const target = input.dataset.intensityTarget;
  if (target === "master") masterEmotionIntensity = value;
  else if (target === "speech-rate") speechRateControl = value;
  else {
    emotionIntensityByName[target] = value;
    if (activeEmotion.name !== target || emotionBlendTarget === 0 || isSpeaking) {
      runEmotionPreview(target);
    }
  }
  input.parentElement.querySelector("output").textContent = formatSliderOutput(target, value);
  saveEmotionSettings();
}

emotionOptions.addEventListener("input", handleSettingsSliderInput);
speakingSpeedSetting.addEventListener("input", handleSettingsSliderInput);

canvas.addEventListener("pointerdown", beginAvatarDrag);
canvas.addEventListener("pointermove", updateAvatarDrag);
canvas.addEventListener("pointerup", endAvatarDrag);
canvas.addEventListener("pointercancel", endAvatarDrag);
resetPositionButton.addEventListener("click", resetAvatarPosition);
settingsButton.addEventListener("click", toggleSettings);
settingsCloseButton.addEventListener("click", () => closeSettings());
voiceProviderOptions.addEventListener("click", handleVoiceProviderChange);
elevenLabsApiKeyInput.addEventListener("change", handleOwnApiKeyChange);
elevenLabsVoiceOptions.addEventListener("click", handleElevenLabsVoiceChange);
loadVoicesButton.addEventListener("click", loadElevenLabsVoices);
previewVoiceButton.addEventListener("click", previewElevenLabsVoice);
followFreysaButton.addEventListener("click", unlockSponsoredBonus);
voiceAccessUnlockLink.addEventListener("click", handleVoiceAccessUnlockClick);
voiceAccessOwnKeyButton.addEventListener("click", () => selectVoiceProvider(VOICE_PROVIDERS.ELEVENLABS_OWN_KEY, { openSettingsPanel: true }));
voiceAccessMicrosoftButton.addEventListener("click", () => selectVoiceProvider(VOICE_PROVIDERS.AZURE));
pronunciationRulesButton.addEventListener("click", togglePronunciationRulesDetails);
pronunciationRulesToggle.addEventListener("change", handlePronunciationRulesChange);
document.addEventListener("pointerdown", handleDocumentPointerDown);

window.addEventListener("resize", resizeRenderer);
resizeRenderer();
renderer.setAnimationLoop(render);

function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = 0.88;
  const scale = targetHeight / Math.max(size.y, 0.001);

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale - 0.06, -center.z * scale);
}

function render(time) {
  const performanceState = updateFacialPerformance(time);
  updateHeadAndBreathing(time, performanceState.speechEnergy);
  updateGaze(time, performanceState.hasSpeechFrames);
  if (!performanceState.hasSpeechFrames) updateProceduralBlink(time);
  renderer.render(scene, camera);
}

function updateFacialPerformance(time) {
  let targetFrame = null;
  let speechEnergy = 0;
  let hasSpeechFrames = false;
  emotionBlend = THREE.MathUtils.lerp(
    emotionBlend,
    emotionBlendTarget,
    emotionBlendTarget > emotionBlend ? 0.10 : 0.025
  );

  if (isSpeaking && activeFacialFrames.length) {
    const elapsedMs = activeAudio ? activeAudio.currentTime * 1000 : time - speechStartedAt;
    targetFrame = interpolateFacialFrame(elapsedMs);
    speechEnergy = targetFrame?.[17] || 0;
    hasSpeechFrames = Boolean(targetFrame);

    if (!activeAudio && elapsedMs > facialDurationMs) {
      beginSpeechRelease(facialDurationMs, time);
      isSpeaking = false;
      targetFrame = null;
      speechEnergy = 0;
      hasSpeechFrames = false;
      releaseResponseEmotion(EMOTION_HOLD_AFTER_SPEECH_MS);
    }
  }

  if (!targetFrame && speechReleaseFrame) {
    const releaseElapsedMs = time - speechReleaseStartedAt;
    const releaseProgress = Math.max(
      0,
      Math.min(1, (releaseElapsedMs - SPEECH_RELEASE_HOLD_MS) / SPEECH_RELEASE_FADE_MS)
    );
    const releaseWeight = 1 - smoothstep(releaseProgress);
    targetFrame = speechReleaseFrame.map((value) => value * releaseWeight);
    speechEnergy = targetFrame[17] || 0;

    if (releaseProgress >= 1) clearSpeechRelease();
  }

  for (let channel = 0; channel < ARKIT_BLENDSHAPE_NAMES.length; channel += 1) {
    const name = ARKIT_BLENDSHAPE_NAMES[channel];
    const target = limitFacialWeight(
      name,
      (targetFrame?.[channel] || 0) * speechFacialGain(name)
        + getAdjustedEmotionWeight(
          activeEmotion,
          name,
          masterEmotionIntensity,
          emotionIntensityByName[activeEmotion.name] ?? 1
        ) * emotionBlend
    );
    smoothMorphWeight(name, target, targetFrame ? facialResponse(name) : 0.2);
  }

  return { hasSpeechFrames, speechEnergy };
}

function interpolateFacialFrame(elapsedMs) {
  const framePosition = Math.max(0, elapsedMs / 1000 * facialFrameRate);
  const lowerIndex = Math.min(Math.floor(framePosition), activeFacialFrames.length - 1);
  const upperIndex = Math.min(lowerIndex + 1, activeFacialFrames.length - 1);
  const alpha = framePosition - Math.floor(framePosition);
  const lower = activeFacialFrames[lowerIndex];
  const upper = activeFacialFrames[upperIndex];
  if (!lower || !upper) return null;
  return lower.map((value, index) => THREE.MathUtils.lerp(value || 0, upper[index] || 0, alpha));
}

function facialResponse(name) {
  if (name.startsWith("mouth") || name.startsWith("jaw")) return 0.55;
  return 0.34;
}

function updateProceduralGaze(time) {
  const horizontal = Math.sin(time * 0.00047) * 0.035;
  const vertical = Math.sin(time * 0.00031 + 1.4) * 0.022;
  const targets = Object.fromEntries(GAZE_CHANNEL_NAMES.map((name) => [name, 0]));
  targets[horizontal >= 0 ? "eyeLookInLeft" : "eyeLookOutLeft"] = Math.abs(horizontal);
  targets[horizontal >= 0 ? "eyeLookOutRight" : "eyeLookInRight"] = Math.abs(horizontal);
  targets[vertical >= 0 ? "eyeLookUpLeft" : "eyeLookDownLeft"] = Math.abs(vertical);
  targets[vertical >= 0 ? "eyeLookUpRight" : "eyeLookDownRight"] = Math.abs(vertical);
  applyGazeTargets(targets, 0.16);
}

function updateGaze(time, hasSpeechFrames) {
  const presentationPitch = getAvatarPresentationPitch();
  const shouldTrackCamera = positionPointerId !== null
    || !isAvatarPositionDefault(avatarPosition)
    || !isAvatarPositionDefault(avatarPositionTarget)
    || presentationPitch !== 0;
  if (shouldTrackCamera) {
    applyGazeTargets(cameraFixedGazeForRotation({
      yaw: avatarPosition.yaw,
      pitch: avatarPosition.pitch + presentationPitch
    }), 0.48);
  } else if (!hasSpeechFrames) {
    updateProceduralGaze(time);
  }
}

function applyGazeTargets(targets, response) {
  for (const name of GAZE_CHANNEL_NAMES) smoothMorphWeight(name, targets[name] || 0, response);
}

function updateProceduralBlink(time) {
  if (!avatarReady) return;
  if (!blinkStart && time >= nextBlinkAt) blinkStart = time;

  let blinkWeight = 0;
  if (blinkStart) {
    const phase = (time - blinkStart) / 170;
    blinkWeight = phase < 0.45 ? phase / 0.45 : Math.max(0, 1 - (phase - 0.45) / 0.55);
    if (phase >= 1) {
      blinkStart = 0;
      nextBlinkAt = time + 2200 + Math.random() * 2600;
    }
  }

  setMorphWeight("eyeBlinkLeft", blinkWeight);
  setMorphWeight("eyeBlinkRight", blinkWeight);
}

function updateHeadAndBreathing(time, speechEnergy) {
  const deltaSeconds = lastPositionFrameAt
    ? Math.min(0.05, Math.max(0, (time - lastPositionFrameAt) / 1000))
    : 1 / 60;
  lastPositionFrameAt = time;
  const damping = positionPointerId === null ? 10 : 18;
  avatarPosition.yaw = THREE.MathUtils.damp(avatarPosition.yaw, avatarPositionTarget.yaw, damping, deltaSeconds);
  avatarPosition.pitch = THREE.MathUtils.damp(avatarPosition.pitch, avatarPositionTarget.pitch, damping, deltaSeconds);

  const speakingAmount = isSpeaking ? 1 : 0;
  avatarRoot.rotation.y = avatarPosition.yaw
    + Math.sin(time * 0.00029) * 0.018
    + speakingAmount * Math.sin(time * 0.0013 + 0.4) * 0.015;
  avatarRoot.rotation.x = avatarPosition.pitch + getAvatarPresentationPitch()
    + Math.sin(time * 0.00037 + 0.9) * 0.008
    + speakingAmount * Math.sin(time * 0.0032) * (0.006 + speechEnergy * 0.012);
  avatarRoot.rotation.z = Math.sin(time * 0.00021 + 2.1) * 0.007
    + speakingAmount * Math.sin(time * 0.00083 + 1.1) * 0.004;
  avatarRoot.position.x = Math.sin(time * 0.00019 + 1.7) * 0.003
    + speakingAmount * Math.sin(time * 0.0011) * 0.002;
  avatarRoot.position.y = (isMobileViewport() ? MOBILE_AVATAR_VERTICAL_OFFSET : 0)
    + Math.sin(time * 0.00115) * 0.0035;

  if (
    resetPositionButton.disabled
    && !isAvatarPositionDefault(avatarPositionTarget)
  ) resetPositionButton.disabled = false;
}

function beginAvatarDrag(event) {
  if (!avatarReady || (event.pointerType === "mouse" && event.button !== 0)) return;
  positionPointerId = event.pointerId;
  positionDragStart = {
    x: event.clientX,
    y: event.clientY,
    yaw: avatarPositionTarget.yaw,
    pitch: avatarPositionTarget.pitch
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-dragging");
  event.preventDefault();
}

function updateAvatarDrag(event) {
  if (event.pointerId !== positionPointerId || !positionDragStart) return;
  const rect = canvas.getBoundingClientRect();
  const next = avatarPositionFromDrag({
    startYaw: positionDragStart.yaw,
    startPitch: positionDragStart.pitch,
    deltaX: event.clientX - positionDragStart.x,
    deltaY: event.clientY - positionDragStart.y,
    width: rect.width,
    height: rect.height
  });
  avatarPositionTarget.yaw = next.yaw;
  avatarPositionTarget.pitch = next.pitch;
  resetPositionButton.disabled = isAvatarPositionDefault(avatarPositionTarget);
  event.preventDefault();
}

function endAvatarDrag(event) {
  if (event.pointerId !== positionPointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  positionPointerId = null;
  positionDragStart = null;
  canvas.classList.remove("is-dragging");
}

function resetAvatarPosition() {
  avatarPositionTarget.yaw = 0;
  avatarPositionTarget.pitch = 0;
  resetPositionButton.disabled = true;
  emitRuntimeEvent("positionreset", { position: { ...avatarPositionTarget } });
}

function openSettings() {
  chatView.hidden = true;
  settingsView.hidden = false;
  settingsButton.setAttribute("aria-pressed", "true");
  syncVoiceSettingsUi();
  refreshVoiceAccess();
  if (
    voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
    && elevenLabsConfigured
    && !availableElevenLabsVoices.length
  ) loadElevenLabsVoices();
}

function toggleSettings() {
  if (settingsView.hidden) openSettings();
  else closeSettings();
}

function closeSettings({ focusChat = true } = {}) {
  settingsView.hidden = true;
  chatView.hidden = false;
  settingsButton.setAttribute("aria-pressed", "false");
  if (focusChat) chatInput.focus();
}

function handleDocumentPointerDown(event) {
  for (const menu of [voiceProviderMenu, elevenLabsVoiceMenu]) {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  }
  if (
    !settingsView.hidden
    && !settingsView.contains(event.target)
    && !settingsButton.contains(event.target)
  ) closeSettings({ focusChat: false });
}

function handlePronunciationRulesChange() {
  voiceSettings.pronunciationRulesEnabled = pronunciationRulesToggle.checked;
  saveVoiceSettings(voiceSettings);
}

function togglePronunciationRulesDetails() {
  const expanded = pronunciationRulesButton.getAttribute("aria-expanded") !== "true";
  pronunciationRulesButton.setAttribute("aria-expanded", String(expanded));
  pronunciationRulesButtonLabel.textContent = expanded ? "Hide rules" : "Show rules";
  pronunciationRulesContent.hidden = !expanded;
}

function handleVoiceProviderChange(event) {
  const button = event.target.closest("button[data-voice-provider]");
  if (!button) return;
  selectVoiceProvider(button.dataset.voiceProvider);
  voiceProviderMenu.open = false;
}

function selectVoiceProvider(provider, { openSettingsPanel = false } = {}) {
  voiceSettings.provider = provider;
  saveVoiceSettings(voiceSettings);
  syncVoiceSettingsUi();
  updateVoiceBadge();
  syncVoiceAccessGate();
  if (
    voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
    && elevenLabsConfigured
    && !availableElevenLabsVoices.length
  ) loadElevenLabsVoices();
  if (openSettingsPanel) {
    openSettings();
    window.setTimeout(() => elevenLabsApiKeyInput.focus(), 0);
  }
}

function handleOwnApiKeyChange() {
  voiceSettings.ownApiKey = elevenLabsApiKeyInput.value.trim();
  availableElevenLabsVoices = [];
  saveVoiceSettings(voiceSettings);
  syncVoiceSettingsUi();
}

function handleElevenLabsVoiceChange(event) {
  const button = event.target.closest("button[data-elevenlabs-voice]");
  if (!button) return;
  const voice = availableElevenLabsVoices.find((item) => item.id === button.dataset.elevenlabsVoice);
  voiceSettings.voiceId = voice?.id || "";
  voiceSettings.voiceName = voice?.name || "";
  voiceSettings.curatedDefaultVersion = CURATED_DEFAULT_VOICE_VERSION;
  elevenLabsVoiceMenu.open = false;
  saveVoiceSettings(voiceSettings);
  previewVoiceButton.disabled = !voice;
  syncVoiceSettingsUi();
  updateVoiceBadge();
}

function syncVoiceSettingsUi() {
  voiceProviderLabel.textContent = voiceProviderName(voiceSettings.provider);
  for (const button of voiceProviderOptions.querySelectorAll("button[data-voice-provider]")) {
    button.setAttribute("aria-selected", String(button.dataset.voiceProvider === voiceSettings.provider));
  }
  elevenLabsApiKeyInput.value = voiceSettings.ownApiKey;
  pronunciationRulesToggle.checked = voiceSettings.pronunciationRulesEnabled !== false;
  const isElevenLabs = [
    VOICE_PROVIDERS.ELEVENLABS_SPONSORED,
    VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
  ].includes(voiceSettings.provider);
  const usesOwnKey = voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY;
  elevenLabsControls.hidden = !isElevenLabs;
  elevenLabsKeyField.hidden = !usesOwnKey;
  sponsoredAllowance.hidden = voiceSettings.provider !== VOICE_PROVIDERS.ELEVENLABS_SPONSORED;
  loadVoicesButton.textContent = availableElevenLabsVoices.length ? "Reload voices" : "Load voices";
  previewVoiceButton.disabled = !voiceSettings.voiceId;
  elevenLabsVoiceLabel.textContent = voiceSettings.voiceName || "Load voices to choose…";

  if (voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED) {
    voiceProviderStatus.textContent = elevenLabsConfigured ? "Sponsored" : "Needs API key";
    voiceProviderStatus.classList.toggle("online", elevenLabsConfigured);
  } else if (usesOwnKey) {
    voiceProviderStatus.textContent = voiceSettings.ownApiKey ? "Own key ready" : "Enter key";
    voiceProviderStatus.classList.toggle("online", Boolean(voiceSettings.ownApiKey));
  } else if (voiceSettings.provider === VOICE_PROVIDERS.AZURE) {
    voiceProviderStatus.textContent = azureSpeechConfigured ? "Connected" : "Unavailable";
    voiceProviderStatus.classList.toggle("online", azureSpeechConfigured);
  } else {
    voiceProviderStatus.textContent = "Local fallback";
    voiceProviderStatus.classList.remove("online");
  }
  syncSpeakingSpeedUi();
}

function speechRateRangeForProvider(provider = voiceSettings.provider) {
  return [
    VOICE_PROVIDERS.ELEVENLABS_SPONSORED,
    VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
  ].includes(provider)
    ? ELEVENLABS_SPEECH_RATE_RANGE
    : DEFAULT_SPEECH_RATE_RANGE;
}

function syncSpeakingSpeedUi() {
  const input = speakingSpeedSetting.querySelector('input[data-intensity-target="speech-rate"]');
  const output = input?.parentElement.querySelector("output");
  const rangeLabel = speakingSpeedSetting.querySelector(".speech-speed-range");
  if (!input || !output || !rangeLabel) return;
  const range = speechRateRangeForProvider();
  const rate = speechRateFromControl(speechRateControl, range);
  output.textContent = `${rate.toFixed(2)}×`;
  input.setAttribute("aria-valuetext", `${rate.toFixed(2)} times normal speed`);
  rangeLabel.textContent = `${range.minimum.toFixed(2)}×–${range.maximum.toFixed(2)}×`;
}

function voiceProviderName(provider) {
  return {
    [VOICE_PROVIDERS.ELEVENLABS_SPONSORED]: "ElevenLabs · Freysa sponsored",
    [VOICE_PROVIDERS.ELEVENLABS_OWN_KEY]: "ElevenLabs · Use my own key",
    [VOICE_PROVIDERS.AZURE]: "Microsoft · Nancy Multilingual",
    [VOICE_PROVIDERS.BROWSER]: "Browser voice · Fallback"
  }[provider] || "Browser voice · Fallback";
}

async function refreshVoiceAccess() {
  try {
    const response = await fetch("/api/voice-access", { cache: "no-store" });
    const access = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(access.error || "Voice allowance could not be loaded.");
    updateVoiceAccess(access);
  } catch (error) {
    allowanceMessage.textContent = error.message;
    allowanceCount.textContent = "Unavailable";
  }
}

function updateVoiceAccess(access, { deferChatPrompt = false } = {}) {
  voiceAccess = access;
  elevenLabsConfigured = Boolean(access.sponsoredConfigured);
  const total = Math.max(1, Number(access.total) || 5);
  const used = Math.max(0, Number(access.used) || 0);
  const remaining = Math.max(0, Number(access.remaining) || 0);
  allowanceCount.textContent = `${remaining} of ${total} left`;
  allowanceProgress.style.width = `${Math.min(100, used / total * 100)}%`;
  followFreysaButton.hidden = !access.bonusAvailable;

  if (!access.sponsoredConfigured) {
    allowanceMessage.textContent = "Add ELEVENLABS_API_KEY to Cloudflare to activate sponsored voices.";
  } else if (access.bonusAvailable) {
    allowanceMessage.textContent = "Your first 5 are complete. Visit Freysa on X to unlock 5 more today.";
  } else if (remaining === 0) {
    allowanceMessage.textContent = "Today’s 10 sponsored responses are complete. Use your own key or return tomorrow.";
  } else if (access.bonusUnlocked) {
    allowanceMessage.textContent = "Your 5 bonus responses are unlocked for today.";
  } else {
    allowanceMessage.textContent = "No login required. Refreshing or switching browsers on this network will not reset the server allowance.";
  }
  syncVoiceSettingsUi();
  if (!deferChatPrompt) syncVoiceAccessGate();
}

function syncVoiceAccessGate() {
  const state = voiceAccessPromptState(voiceAccess, {
    sponsoredSelected: voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
  });
  const hidden = state === VOICE_ACCESS_PROMPT_STATES.HIDDEN;
  chatComposer.hidden = !hidden;
  voiceAccessGate.hidden = hidden;
  voiceAccessUnlockLink.hidden = state !== VOICE_ACCESS_PROMPT_STATES.AVAILABLE;
  voiceAccessOwnKeyButton.hidden = state !== VOICE_ACCESS_PROMPT_STATES.EXHAUSTED;
  voiceAccessMicrosoftButton.hidden = state !== VOICE_ACCESS_PROMPT_STATES.EXHAUSTED;
  voiceAccessMicrosoftButton.disabled = !azureSpeechConfigured;

  if (state === VOICE_ACCESS_PROMPT_STATES.AVAILABLE) {
    voiceAccessGateMessage.textContent = "You’ve used your 5 sponsored voice responses today. Follow Freysa on X to unlock 5 more.";
  } else if (state === VOICE_ACCESS_PROMPT_STATES.EXHAUSTED) {
    voiceAccessGateMessage.textContent = Number(voiceAccess?.total) >= 10
      ? "You’ve used all 10 sponsored voice responses today. Continue with your own ElevenLabs key or switch to Microsoft TTS."
      : "Sponsored voice access is unavailable on this network. Continue with your own ElevenLabs key or switch to Microsoft TTS.";
  }
}

async function handleVoiceAccessUnlockClick() {
  voiceAccessUnlockLink.textContent = "Unlocking…";
  const unlocked = await unlockSponsoredBonus();
  voiceAccessUnlockLink.textContent = "Follow Freysa on X · unlock 5 more";
  if (unlocked) chatInput.focus();
}

async function unlockSponsoredBonus() {
  try {
    const response = await fetch("/api/voice-access/unlock", { method: "POST" });
    const access = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(access.error || "Bonus unlock failed.");
    updateVoiceAccess(access);
    return true;
  } catch (error) {
    allowanceMessage.textContent = error.message;
    return false;
  }
}

async function loadElevenLabsVoices() {
  if (
    voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
    && !voiceSettings.ownApiKey
  ) {
    elevenLabsApiKeyInput.focus();
    voiceProviderStatus.textContent = "Enter key";
    return;
  }

  loadVoicesButton.disabled = true;
  loadVoicesButton.textContent = "Loading…";
  try {
    const ownKey = voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY;
    const response = await fetch("/api/elevenlabs/voices", {
      method: ownKey ? "POST" : "GET",
      headers: ownKey ? { "Content-Type": "application/json" } : undefined,
      body: ownKey ? JSON.stringify({ apiKey: voiceSettings.ownApiKey }) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "ElevenLabs voices could not be loaded.");
    availableElevenLabsVoices = result.voices || [];
    populateElevenLabsVoiceSelect();
    const isCuratedList = !ownKey;
    voiceProviderStatus.textContent = isCuratedList
      ? `${availableElevenLabsVoices.length} of 12 voices`
      : `${availableElevenLabsVoices.length} voices`;
    voiceProviderStatus.title = Array.isArray(result.missing) && result.missing.length
      ? `Unavailable: ${result.missing.join(", ")}`
      : "";
    voiceProviderStatus.classList.add("online");
  } catch (error) {
    voiceProviderStatus.textContent = "Voice load failed";
    voiceProviderStatus.classList.remove("online");
    voiceNote.textContent = error.message;
  } finally {
    loadVoicesButton.disabled = false;
    loadVoicesButton.textContent = availableElevenLabsVoices.length ? "Reload voices" : "Load voices";
  }
}

function populateElevenLabsVoiceSelect() {
  elevenLabsVoiceOptions.replaceChildren();
  for (const voice of availableElevenLabsVoices) {
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.elevenlabsVoice = voice.id;
    option.setAttribute("role", "option");
    const details = [voice.gender, voice.accent].filter(Boolean).join(" · ");
    option.textContent = details ? `${voice.name} — ${details}` : voice.name;
    elevenLabsVoiceOptions.append(option);
  }

  const curatedMatilda = availableElevenLabsVoices.find((voice) => voice.curatedKey === "matilda");
  const migrateToMatilda = voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
    && voiceSettings.curatedDefaultVersion < CURATED_DEFAULT_VOICE_VERSION;
  const selected = migrateToMatilda
    ? curatedMatilda || availableElevenLabsVoices[0]
    : availableElevenLabsVoices.find((voice) => voice.id === voiceSettings.voiceId)
      || curatedMatilda
      || availableElevenLabsVoices[0];
  elevenLabsVoiceMenu.classList.toggle("is-disabled", !selected);
  if (selected) {
    voiceSettings.voiceId = selected.id;
    voiceSettings.voiceName = selected.name;
    if (migrateToMatilda) voiceSettings.curatedDefaultVersion = CURATED_DEFAULT_VOICE_VERSION;
    saveVoiceSettings(voiceSettings);
  }
  for (const button of elevenLabsVoiceOptions.querySelectorAll("button[data-elevenlabs-voice]")) {
    button.setAttribute("aria-selected", String(button.dataset.elevenlabsVoice === selected?.id));
  }
  previewVoiceButton.disabled = !selected;
  syncVoiceSettingsUi();
  updateVoiceBadge();
}

function previewElevenLabsVoice() {
  const voice = availableElevenLabsVoices.find((item) => item.id === voiceSettings.voiceId);
  if (!voice?.previewUrl) {
    voiceNote.textContent = "This ElevenLabs voice does not include a preview sample.";
    return;
  }
  stopCurrentSpeech();
  activeAudio = new Audio(voice.previewUrl);
  activeAudio.play().catch((error) => {
    voiceNote.textContent = `Voice preview failed: ${error.message}`;
  });
}

function updateVoiceBadge(azureVoice = "en-US-NancyMultilingualNeural") {
  speechBadge.classList.remove("error");
  if (
    voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
    || voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
  ) {
    speechBadge.textContent = voiceSettings.voiceName
      ? `ElevenLabs · ${voiceSettings.voiceName}`
      : "ElevenLabs · choose a voice in Settings";
    speechBadge.classList.toggle("online", elevenLabsConfigured || Boolean(voiceSettings.ownApiKey));
    return;
  }
  if (voiceSettings.provider === VOICE_PROVIDERS.AZURE && azureSpeechConfigured) {
    speechBadge.textContent = `Microsoft TTS · ${azureVoice}`;
    speechBadge.classList.add("online");
    return;
  }
  speechBadge.textContent = "Browser voice fallback";
  speechBadge.classList.remove("online");
}

function setMorphWeight(name, value) {
  for (const mesh of morphMeshes) {
    const index = mesh.morphTargetDictionary[name];
    if (index !== undefined) mesh.morphTargetInfluences[index] = value;
  }
}

function smoothMorphWeight(name, target, amount) {
  for (const mesh of morphMeshes) {
    const index = mesh.morphTargetDictionary[name];
    if (index === undefined) continue;
    mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
      mesh.morphTargetInfluences[index] || 0,
      target,
      amount
    );
  }
}

async function speakReply(text, {
  onSpeechStart,
  pronunciationRules = voiceSettings.pronunciationRulesEnabled
} = {}) {
  const speechRate = speechRateFromControl(speechRateControl, speechRateRangeForProvider());
  const spokenText = applyPronunciationRules(text, { enabled: pronunciationRules !== false });
  if (
    voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED
    || voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
  ) {
    const speech = await requestElevenLabsSpeech(spokenText, speechRate);
    const alignment = speech.alignment || {};
    const facialTimeline = createFacialFramesFromVisemes(
      createVisemesFromElevenLabsAlignment(alignment)
    );
    const audioBlob = base64ToBlob(speech.audioBase64, speech.mimeType);
    await playAudioSpeech(audioBlob, facialTimeline, { onSpeechStart });
    return;
  }

  if (voiceSettings.provider === VOICE_PROVIDERS.AZURE && azureSpeechConfigured) {
    const speech = await requestAzureSpeech(spokenText, speechRate);
    const facialTimeline = speech.blendshapeFrames?.length
      ? {
          frames: speech.blendshapeFrames,
          frameRate: speech.frameRate || 60,
          durationMs: speech.blendshapeFrames.length / (speech.frameRate || 60) * 1000
        }
      : speech.visemes?.length
        ? createFacialFramesFromVisemes(speech.visemes)
        : createSyntheticFacialFrames(spokenText);
    const audioBlob = speech.audioBlob || base64ToBlob(speech.audioBase64, speech.mimeType);
    await playAudioSpeech(audioBlob, facialTimeline, {
      onSpeechStart,
      preserveExactTiming: speech.facialAnimationMode === "azure-facial-expression"
    });
    return;
  }

  const timeline = createSyntheticFacialFrames(spokenText);
  timeline.frameRate *= speechRate;
  timeline.durationMs /= speechRate;
  playFacialTimeline(timeline);
  speakWithBrowserVoice(spokenText, speechRate);
  onSpeechStart?.();
  emitRuntimeEvent("speakingstart", { plan: activePerformancePlan });
}

async function requestElevenLabsSpeech(text, rate) {
  if (!voiceSettings.voiceId) {
    openSettings();
    throw new Error("Choose an ElevenLabs voice in Settings first.");
  }
  if (voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY && !voiceSettings.ownApiKey) {
    openSettings();
    throw new Error("Enter your ElevenLabs API key in Settings first.");
  }

  const sponsored = voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_SPONSORED;
  const turnstileToken = sponsored ? await getTurnstileToken() : null;
  const response = await fetch("/api/elevenlabs/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      rate,
      voiceId: voiceSettings.voiceId,
      apiKey: voiceSettings.provider === VOICE_PROVIDERS.ELEVENLABS_OWN_KEY
        ? voiceSettings.ownApiKey
        : undefined,
      turnstileToken
    })
  });
  const speech = await response.json().catch(() => ({}));
  if (speech.access) updateVoiceAccess(speech.access, { deferChatPrompt: true });
  if (!response.ok) {
    if (["DAILY_LIMIT_REACHED", "NETWORK_LIMIT_REACHED"].includes(speech.code)) syncVoiceAccessGate();
    throw new Error(speech.error || "ElevenLabs speech request failed.");
  }
  return speech;
}

async function getTurnstileToken() {
  if (!turnstileSiteKey) return null;
  await loadTurnstileScript();
  return new Promise((resolve, reject) => {
    const options = {
      sitekey: turnstileSiteKey,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token) => resolve(token),
      "error-callback": () => reject(new Error("The human check could not be completed.")),
      "expired-callback": () => reject(new Error("The human check expired. Please try again."))
    };
    if (turnstileWidgetId === null) {
      turnstileWidgetId = window.turnstile.render(turnstileWidget, options);
    } else {
      window.turnstile.reset(turnstileWidgetId);
    }
    window.turnstile.execute(turnstileWidgetId);
  });
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-freysa-turnstile]");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("The human check could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.freysaTurnstile = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("The human check could not load.")), { once: true });
    document.head.append(script);
  });
}

async function playAudioSpeech(audioBlob, facialTimeline, { onSpeechStart, preserveExactTiming = false } = {}) {
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio._freysaAudioUrl = audioUrl;
  activeAudio = audio;
  await loadAudioMetadata(audio);
  if (
    !preserveExactTiming
    && Number.isFinite(audio.duration)
    && audio.duration > 0
    && facialTimeline.frames.length > 1
  ) {
    facialTimeline.durationMs = audio.duration * 1000;
    facialTimeline.frameRate = (facialTimeline.frames.length - 1) / audio.duration;
  }
  setFacialTimeline(facialTimeline);

  audio.addEventListener("ended", () => {
    beginSpeechRelease(audio.currentTime * 1000);
    isSpeaking = false;
    if (activeAudio === audio) activeAudio = null;
    releaseResponseEmotion(EMOTION_HOLD_AFTER_SPEECH_MS);
    URL.revokeObjectURL(audioUrl);
    emitRuntimeEvent("speakingend", { plan: activePerformancePlan, reason: "completed" });
  }, { once: true });

  isSpeaking = true;
  await audio.play();
  onSpeechStart?.();
  emitRuntimeEvent("speakingstart", { plan: activePerformancePlan });
}

async function requestAzureSpeech(text, rate) {
  if (azureSpeechMode === "browser-sdk") {
    try {
      return await synthesizeAzureInBrowser({ text, rate });
    } catch (error) {
      console.warn("Exact Azure facial synthesis failed; using REST fallback:", error);
      voiceNote.textContent = "Microsoft voice is active; exact facial data was unavailable for this reply.";
    }
  }

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, rate })
  });
  const speech = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(speech.error || "Microsoft TTS request failed.");
  return speech;
}

function loadAudioMetadata(audio) {
  if (audio.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      audio.removeEventListener("loadedmetadata", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };
    audio.addEventListener("loadedmetadata", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.load();
  });
}

function speakWithBrowserVoice(text, speechRate) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  configureBrowserUtterance(utterance, {
    voices: window.speechSynthesis.getVoices(),
    speechRate
  });
  utterance.addEventListener("end", () => {
    beginSpeechRelease(facialDurationMs);
    isSpeaking = false;
    releaseResponseEmotion(EMOTION_HOLD_AFTER_SPEECH_MS);
    emitRuntimeEvent("speakingend", { plan: activePerformancePlan, reason: "completed" });
  }, { once: true });
  window.speechSynthesis.speak(utterance);
}

function playFacialTimeline(timeline) {
  clearSpeechRelease();
  activeAudio = null;
  setFacialTimeline(timeline);
  speechStartedAt = performance.now();
  isSpeaking = true;
}

function setFacialTimeline(timeline) {
  activeFacialFrames = timeline.frames || [];
  facialFrameRate = timeline.frameRate || 60;
  facialDurationMs = timeline.durationMs || activeFacialFrames.length / facialFrameRate * 1000;
}

function stopCurrentSpeech() {
  const wasSpeaking = isSpeaking;
  if (activeAudio) {
    activeAudio.pause();
    if (activeAudio._freysaAudioUrl) URL.revokeObjectURL(activeAudio._freysaAudioUrl);
    activeAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  isSpeaking = false;
  activeFacialFrames = [];
  clearSpeechRelease();
  releaseResponseEmotion();
  if (wasSpeaking) emitRuntimeEvent("speakingend", { plan: activePerformancePlan, reason: "stopped" });
}

async function requestPerformancePlan(payload) {
  try {
    const response = await fetch("/api/avatar/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Freysa avatar request failed.");
    return result;
  } catch {
    return createPerformancePlan(payload);
  }
}

async function requestFullFreysaPlan(options = {}) {
  const suppliedHistory = Array.isArray(options.history);
  const history = suppliedHistory ? options.history : runtimeConversationHistory;
  const plan = await requestPerformancePlan({
    ...options,
    history,
    mode: INTEGRATION_MODES.FULL_FREYSA
  });
  if (!suppliedHistory) {
    runtimeConversationHistory.push(
      { role: "user", content: options.message },
      { role: "assistant", content: plan.text }
    );
    if (runtimeConversationHistory.length > 12) runtimeConversationHistory.splice(0, runtimeConversationHistory.length - 12);
  }
  return plan;
}

async function performPlan(plan, options = {}) {
  cancelEmotionPreview();
  stopCurrentSpeech();
  activePerformancePlan = plan;
  prepareResponseEmotion(plan.emotion);
  emitRuntimeEvent("performance", { plan });
  await delay(260);
  await speakReply(plan.text, options);
  return plan;
}

function installRuntimeApi() {
  const api = Object.freeze({
    version: "1.0",
    emotions: [...EMOTION_NAMES],
    perform(options = {}) {
      const mode = options.emotion === undefined
        ? INTEGRATION_MODES.EMOTION_ASSIST
        : INTEGRATION_MODES.DIRECTED;
      return requestPerformancePlan({ ...options, mode }).then((plan) => performPlan(plan, options));
    },
    chat(options = {}) {
      return requestFullFreysaPlan(options).then((plan) => performPlan(plan, options));
    },
    stop() {
      cancelEmotionPreview();
      stopCurrentSpeech();
    },
    resetPosition: resetAvatarPosition,
    getState: getRuntimeState,
    addEventListener: runtimeEvents.addEventListener.bind(runtimeEvents),
    removeEventListener: runtimeEvents.removeEventListener.bind(runtimeEvents)
  });

  window.freysaAvatar = api;
  document.body.classList.toggle("embed-mode", new URLSearchParams(window.location.search).get("embed") === "avatar");
  window.addEventListener("message", handleHostMessage);
}

async function handleHostMessage(event) {
  if (event.source !== window.parent || event.source === window) return;
  const message = event.data;
  if (!message || message.source !== "freysa-avatar-host" || !message.id) return;

  try {
    let result;
    if (message.action === "perform") result = await window.freysaAvatar.perform(message.payload);
    else if (message.action === "chat") result = await window.freysaAvatar.chat(message.payload);
    else if (message.action === "stop") result = window.freysaAvatar.stop();
    else if (message.action === "resetPosition") result = window.freysaAvatar.resetPosition();
    else if (message.action === "getState") result = window.freysaAvatar.getState();
    else throw new Error(`Unknown Freysa avatar action: ${message.action}`);
    event.source.postMessage({ source: "freysa-avatar-runtime", id: message.id, type: "result", result }, event.origin);
  } catch (error) {
    event.source.postMessage({
      source: "freysa-avatar-runtime",
      id: message.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error)
    }, event.origin);
  }
}

function emitRuntimeEvent(name, detail) {
  runtimeEvents.dispatchEvent(new CustomEvent(name, { detail }));
  window.dispatchEvent(new CustomEvent(`freysa:${name}`, { detail }));
  if (window.parent !== window) {
    window.parent.postMessage({ source: "freysa-avatar-runtime", type: "event", event: name, detail }, "*");
  }
}

function getRuntimeState() {
  return {
    ready: avatarReady,
    speaking: isSpeaking,
    emotion: activeEmotion,
    plan: activePerformancePlan,
    voice: {
      provider: voiceSettings.provider,
      voiceId: voiceSettings.voiceId || null,
      voiceName: voiceSettings.voiceName || null,
      pronunciationRulesEnabled: voiceSettings.pronunciationRulesEnabled !== false,
      sponsoredAccess: voiceAccess
    },
    position: { ...avatarPositionTarget }
  };
}

function prepareResponseEmotion(emotion) {
  window.clearTimeout(emotionReleaseTimer);
  activeEmotion = emotion;
  emotionBlendTarget = emotion.name === "neutral" ? 0 : 1;
}

function releaseResponseEmotion(delayMs = 0) {
  window.clearTimeout(emotionReleaseTimer);
  if (delayMs > 0) {
    emotionReleaseTimer = window.setTimeout(() => {
      emotionBlendTarget = 0;
    }, delayMs);
    return;
  }
  emotionBlendTarget = 0;
}

function beginSpeechRelease(elapsedMs, now = performance.now()) {
  const sampleTime = Math.max(0, Math.min(elapsedMs, facialDurationMs) - 120);
  const sampledFrame = interpolateFacialFrame(sampleTime);
  speechReleaseFrame = sampledFrame?.map((value, index) => {
    const name = ARKIT_BLENDSHAPE_NAMES[index];
    return name && (name.startsWith("mouth") || name.startsWith("jaw")) ? value : 0;
  }).slice(0, ARKIT_BLENDSHAPE_NAMES.length) || null;
  speechReleaseStartedAt = now;
}

function clearSpeechRelease() {
  speechReleaseFrame = null;
  speechReleaseStartedAt = 0;
}

function renderEmotionOptions() {
  speakingSpeedSetting.append(createSpeakingSpeedControl());
  emotionOptions.append(createMasterIntensityControl());

  const allButton = createEmotionOption("all", "Test all emotions");
  allButton.classList.add("emotion-option-all");
  emotionOptions.append(allButton);

  for (const name of EMOTION_NAMES) {
    const row = document.createElement("div");
    row.className = "emotion-option-row";
    const option = createEmotionOption(name, formatEmotionName(name));
    row.append(option);
    if (name !== "neutral") {
      const panel = document.createElement("div");
      panel.id = `emotion-adjustment-${name}`;
      panel.className = "emotion-adjustment-panel";
      panel.hidden = true;
      panel.append(createIntensitySlider(name, emotionIntensityByName[name] ?? 0.5));
      option.setAttribute("aria-expanded", "false");
      option.setAttribute("aria-controls", panel.id);
      row.append(panel);
    } else {
      const neutralNote = document.createElement("span");
      neutralNote.className = "neutral-note";
      neutralNote.textContent = "rest";
      row.append(neutralNote);
    }
    emotionOptions.append(row);
  }
  setActiveEmotionOption("neutral");
}

function createMasterIntensityControl() {
  const control = document.createElement("div");
  control.className = "emotion-global-control";
  const label = document.createElement("span");
  label.textContent = "Master intensity";
  control.append(label, createIntensitySlider("master", masterEmotionIntensity));
  return control;
}

function createSpeakingSpeedControl() {
  const control = document.createElement("div");
  control.className = "emotion-global-control speech-speed-control";
  const copy = document.createElement("span");
  copy.className = "speech-speed-copy";
  const label = document.createElement("span");
  label.textContent = "Speaking speed";
  const range = document.createElement("small");
  range.className = "speech-speed-range";
  const activeRange = speechRateRangeForProvider();
  range.textContent = `${activeRange.minimum.toFixed(2)}×–${activeRange.maximum.toFixed(2)}×`;
  copy.append(label, range);
  control.append(copy, createIntensitySlider("speech-rate", speechRateControl));
  return control;
}

function showEmotionAdjustment(selection) {
  for (const panel of emotionOptions.querySelectorAll(".emotion-adjustment-panel")) {
    panel.hidden = panel.id !== `emotion-adjustment-${selection}`;
  }
  for (const button of emotionOptions.querySelectorAll("button[data-emotion][aria-controls]")) {
    button.setAttribute("aria-expanded", String(button.dataset.emotion === selection));
  }
}

function createEmotionOption(value, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.emotion = value;
  button.setAttribute("aria-pressed", "false");
  button.textContent = label;
  return button;
}

function createIntensitySlider(name, value) {
  const wrapper = document.createElement("label");
  wrapper.className = "emotion-intensity-control";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "5";
  input.value = String(Math.round(value * 100));
  input.dataset.intensityTarget = name;
  input.setAttribute("aria-label", name === "speech-rate" ? "Speaking speed" : `${formatEmotionName(name)} intensity`);
  const output = document.createElement("output");
  output.textContent = formatSliderOutput(name, value);
  wrapper.append(input, output);
  return wrapper;
}

async function runEmotionPreview(selection) {
  cancelEmotionPreview();
  stopCurrentSpeech();
  const runId = emotionPreviewRun;
  setActiveEmotionOption(selection);
  if (selection !== "all") {
    activeEmotion = { name: selection, intensity: selection === "neutral" ? 0 : 1 };
    emotionBlendTarget = selection === "neutral" ? 0 : 1;
    performanceLabel.textContent = `Previewing ${formatEmotionName(selection)}.`;
    return;
  }

  const sequence = [...EMOTION_NAMES.filter((name) => name !== "neutral"), "neutral"];

  for (const name of sequence) {
    if (runId !== emotionPreviewRun) return;
    activeEmotion = { name, intensity: name === "neutral" ? 0 : 1 };
    emotionBlendTarget = name === "neutral" ? 0 : 1;
    performanceLabel.textContent = `Previewing ${formatEmotionName(name)}.`;
    await delay(1650);
  }

  if (runId !== emotionPreviewRun) return;
  releaseResponseEmotion();
  await delay(900);
  if (runId === emotionPreviewRun) {
    performanceLabel.textContent = "Tune and test Freysa’s expressions.";
    setActiveEmotionOption("neutral");
  }
}

function cancelEmotionPreview() {
  emotionPreviewRun += 1;
  performanceLabel.textContent = "Tune and test Freysa’s expressions.";
}

function formatEmotionName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function setActiveEmotionOption(selection) {
  for (const button of emotionOptions.querySelectorAll("button[data-emotion]")) {
    button.setAttribute("aria-pressed", String(button.dataset.emotion === selection));
  }
}

function loadEmotionSettings() {
  const defaults = {
    master: 0.5,
    speechRate: 0.5,
    emotions: Object.fromEntries(EMOTION_NAMES.map((name) => [name, 0.5]))
  };
  try {
    const saved = JSON.parse(localStorage.getItem("freysa-emotion-settings-v2"));
    if (!saved || typeof saved !== "object") return defaults;
    if (saved.master !== undefined) defaults.master = clampIntensity(saved.master);
    if (saved.speechRate !== undefined) defaults.speechRate = clampIntensity(saved.speechRate);
    for (const name of EMOTION_NAMES) {
      if (saved.emotions?.[name] !== undefined) {
        defaults.emotions[name] = clampIntensity(saved.emotions[name]);
      }
    }
  } catch {
    return defaults;
  }
  return defaults;
}

function saveEmotionSettings() {
  try {
    localStorage.setItem("freysa-emotion-settings-v2", JSON.stringify({
      master: masterEmotionIntensity,
      speechRate: speechRateControl,
      emotions: emotionIntensityByName
    }));
  } catch {
    // The controls still work for this session when storage is unavailable.
  }
}

function clampIntensity(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function formatSliderOutput(name, value) {
  if (name === "speech-rate") {
    return `${speechRateFromControl(value, speechRateRangeForProvider()).toFixed(2)}×`;
  }
  return `${Math.round(value * 100)}%`;
}

function appendMessage(sender, text, type) {
  const article = document.createElement("article");
  article.className = `message message-${type}`;
  const senderElement = document.createElement("span");
  senderElement.className = "message-sender";
  senderElement.textContent = sender;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.append(senderElement, paragraph);
  chatLog.append(article);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setBusy(busy) {
  sendButton.disabled = busy;
  chatInput.disabled = busy;
  sendButton.textContent = busy ? "Speaking…" : "Send";
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function resizeRenderer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  avatarRoot.scale.setScalar(isMobileViewport() ? MOBILE_AVATAR_SCALE : 1);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_VIEW_QUERY).matches;
}

function getAvatarPresentationPitch() {
  return isMobileViewport() ? MOBILE_AVATAR_PITCH : 0;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}
