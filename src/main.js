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
import { speechRateFromControl } from "./speech-rate.js";
import { synthesizeAzureInBrowser } from "./azure-browser-speech.js";
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
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const performanceMenu = document.querySelector("#performance-menu");
const performanceLabel = document.querySelector("#performance-label");
const emotionOptions = document.querySelector("#emotion-options");
const resetPositionButton = document.querySelector("#reset-position-button");

const SPEECH_RELEASE_HOLD_MS = 140;
const SPEECH_RELEASE_FADE_MS = 760;
const EMOTION_HOLD_AFTER_SPEECH_MS = 650;

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
    azureSpeechMode = health.speechMode || "server";
    speechBadge.textContent = azureSpeechConfigured
      ? `Microsoft TTS · ${health.voice}`
      : "Browser voice fallback";
    speechBadge.classList.toggle("online", azureSpeechConfigured);
    voiceNote.textContent = azureSpeechConfigured
      ? health.facialAnimationMode === "estimated"
        ? "Microsoft voice and a duration-matched facial animation are active."
        : ""
      : "No Azure key yet: browser speech plus a smoothed full-face preview are active now.";
  })
  .catch(() => {
    azureSpeechConfigured = false;
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
  const adjustButton = event.target.closest("button[data-adjust-emotion]");
  if (adjustButton) {
    toggleEmotionAdjustment(adjustButton);
    return;
  }
  const button = event.target.closest("button[data-emotion]");
  if (!button) return;
  runEmotionPreview(button.dataset.emotion);
});

document.addEventListener("pointerdown", (event) => {
  if (performanceMenu.open && !performanceMenu.contains(event.target)) {
    performanceMenu.open = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && performanceMenu.open) {
    performanceMenu.open = false;
    performanceMenu.querySelector("summary").focus();
  }
});

emotionOptions.addEventListener("input", (event) => {
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
});

canvas.addEventListener("pointerdown", beginAvatarDrag);
canvas.addEventListener("pointermove", updateAvatarDrag);
canvas.addEventListener("pointerup", endAvatarDrag);
canvas.addEventListener("pointercancel", endAvatarDrag);
resetPositionButton.addEventListener("click", resetAvatarPosition);

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
  const shouldTrackCamera = positionPointerId !== null
    || !isAvatarPositionDefault(avatarPosition)
    || !isAvatarPositionDefault(avatarPositionTarget);
  if (shouldTrackCamera) {
    applyGazeTargets(cameraFixedGazeForRotation(avatarPosition), 0.48);
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
  avatarRoot.rotation.x = avatarPosition.pitch
    + Math.sin(time * 0.00037 + 0.9) * 0.008
    + speakingAmount * Math.sin(time * 0.0032) * (0.006 + speechEnergy * 0.012);
  avatarRoot.rotation.z = Math.sin(time * 0.00021 + 2.1) * 0.007
    + speakingAmount * Math.sin(time * 0.00083 + 1.1) * 0.004;
  avatarRoot.position.x = Math.sin(time * 0.00019 + 1.7) * 0.003
    + speakingAmount * Math.sin(time * 0.0011) * 0.002;
  avatarRoot.position.y = Math.sin(time * 0.00115) * 0.0035;

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

async function speakReply(text, { onSpeechStart } = {}) {
  const speechRate = speechRateFromControl(speechRateControl);
  if (azureSpeechConfigured) {
    const speech = await requestAzureSpeech(text, speechRate);
    const facialTimeline = speech.blendshapeFrames?.length
      ? {
          frames: speech.blendshapeFrames,
          frameRate: speech.frameRate || 60,
          durationMs: speech.blendshapeFrames.length / (speech.frameRate || 60) * 1000
        }
      : speech.visemes?.length
        ? createFacialFramesFromVisemes(speech.visemes)
        : createSyntheticFacialFrames(text);
    const audioBlob = speech.audioBlob || base64ToBlob(speech.audioBase64, speech.mimeType);
    const audioUrl = URL.createObjectURL(audioBlob);
    activeAudio = new Audio(audioUrl);
    await loadAudioMetadata(activeAudio);
    if (
      speech.facialAnimationMode !== "azure-facial-expression"
      && Number.isFinite(activeAudio.duration)
      && activeAudio.duration > 0
      && facialTimeline.frames.length > 1
    ) {
      facialTimeline.durationMs = activeAudio.duration * 1000;
      facialTimeline.frameRate = (facialTimeline.frames.length - 1) / activeAudio.duration;
    }
    setFacialTimeline(facialTimeline);

    activeAudio.addEventListener("ended", () => {
      beginSpeechRelease(activeAudio.currentTime * 1000);
      isSpeaking = false;
      activeAudio = null;
      releaseResponseEmotion(EMOTION_HOLD_AFTER_SPEECH_MS);
      URL.revokeObjectURL(audioUrl);
      emitRuntimeEvent("speakingend", { plan: activePerformancePlan, reason: "completed" });
    }, { once: true });

    isSpeaking = true;
    await activeAudio.play();
    onSpeechStart?.();
    emitRuntimeEvent("speakingstart", { plan: activePerformancePlan });
    return;
  }

  const timeline = createSyntheticFacialFrames(text);
  timeline.frameRate *= speechRate;
  timeline.durationMs /= speechRate;
  playFacialTimeline(timeline);
  speakWithBrowserVoice(text, speechRate);
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
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => /microsoft/i.test(voice.name) && /^en/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang))
    || null;
  utterance.rate = speechRate;
  utterance.pitch = 1.02;
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
      return requestPerformancePlan({ ...options, mode }).then(performPlan);
    },
    chat(options = {}) {
      return requestFullFreysaPlan(options).then(performPlan);
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
  emotionOptions.append(createMasterIntensityControl());
  emotionOptions.append(createSpeakingSpeedControl());

  const allButton = createEmotionOption("all", "Test all emotions");
  allButton.classList.add("emotion-option-all");
  emotionOptions.append(allButton);

  for (const name of EMOTION_NAMES) {
    const row = document.createElement("div");
    row.className = "emotion-option-row";
    row.append(createEmotionOption(name, formatEmotionName(name)));
    if (name !== "neutral") {
      const toggle = createAdjustmentToggle(name);
      const panel = document.createElement("div");
      panel.id = `emotion-adjustment-${name}`;
      panel.className = "emotion-adjustment-panel";
      panel.hidden = true;
      panel.append(createIntensitySlider(name, emotionIntensityByName[name] ?? 0.5));
      row.append(toggle, panel);
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
  const label = document.createElement("span");
  label.textContent = "Speaking speed";
  control.append(label, createIntensitySlider("speech-rate", speechRateControl));
  return control;
}

function createAdjustmentToggle(name) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "emotion-adjust-toggle";
  button.dataset.adjustEmotion = name;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `emotion-adjustment-${name}`);
  button.textContent = "Adjust";
  return button;
}

function toggleEmotionAdjustment(button) {
  const targetId = button.getAttribute("aria-controls");
  const panel = document.querySelector(`#${targetId}`);
  const shouldOpen = panel.hidden;

  for (const openPanel of emotionOptions.querySelectorAll(".emotion-adjustment-panel")) {
    openPanel.hidden = true;
  }
  for (const toggle of emotionOptions.querySelectorAll(".emotion-adjust-toggle")) {
    toggle.setAttribute("aria-expanded", "false");
  }

  panel.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
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
    performanceLabel.textContent = `Test: ${formatEmotionName(selection)}`;
    return;
  }

  const sequence = [...EMOTION_NAMES.filter((name) => name !== "neutral"), "neutral"];

  for (const name of sequence) {
    if (runId !== emotionPreviewRun) return;
    activeEmotion = { name, intensity: name === "neutral" ? 0 : 1 };
    emotionBlendTarget = name === "neutral" ? 0 : 1;
    performanceLabel.textContent = `Test: ${formatEmotionName(name)}`;
    await delay(1650);
  }

  if (runId !== emotionPreviewRun) return;
  releaseResponseEmotion();
  await delay(900);
  if (runId === emotionPreviewRun) {
    performanceLabel.textContent = "Facial performance";
    setActiveEmotionOption("neutral");
  }
}

function cancelEmotionPreview() {
  emotionPreviewRun += 1;
  performanceLabel.textContent = "Facial performance";
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
  if (name === "speech-rate") return `${speechRateFromControl(value).toFixed(2)}×`;
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
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}
