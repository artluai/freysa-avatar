const bilateral = (name, value) => ({ [`${name}Left`]: value, [`${name}Right`]: value });

export const AZURE_BLENDSHAPE_NAMES = [
  "eyeBlinkLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeSquintLeft", "eyeWideLeft",
  "eyeBlinkRight", "eyeLookDownRight", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeSquintRight", "eyeWideRight",
  "jawForward", "jawLeft", "jawRight", "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight",
  "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
  "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft",
  "cheekSquintRight", "noseSneerLeft", "noseSneerRight", "tongueOut", "headRoll", "leftEyeRoll", "rightEyeRoll"
];

export const ARKIT_BLENDSHAPE_NAMES = AZURE_BLENDSHAPE_NAMES.slice(0, 51);

export const FACIAL_WEIGHT_LIMITS = Object.freeze({
  jawOpen: 0.30,
  mouthClose: 0.28,
  mouthFunnel: 0.18,
  mouthRollLower: 0.22,
  mouthShrugLower: 0.24,
  mouthLowerDownLeft: 0.07,
  mouthLowerDownRight: 0.07
});

export function limitFacialWeight(name, value) {
  const normalized = Math.min(1, Math.max(0, Number(value) || 0));
  return Math.min(normalized, FACIAL_WEIGHT_LIMITS[name] ?? 1);
}

export function speechFacialGain(name) {
  if (name.startsWith("mouthLowerDown")) return 0.08;
  if (name === "mouthRollLower") return 0.34;
  if (name === "mouthShrugLower") return 0.38;
  if (name.startsWith("mouthUpperUp") || name === "mouthRollUpper" || name === "mouthShrugUpper") return 0.92;
  if (name.startsWith("jaw")) return 0.62;
  if (name.startsWith("mouth")) return 0.68;
  if (name.startsWith("cheek") || name.startsWith("nose")) return 0.62;
  if (name.startsWith("brow")) return 0.72;
  return 0.82;
}

export const AZURE_VISEME_TO_ARKIT = {
  0: {},
  1: { jawOpen: 0.42, ...bilateral("mouthStretch", 0.08) },
  2: { jawOpen: 0.68, mouthFunnel: 0.12 },
  3: { jawOpen: 0.38, mouthFunnel: 0.58 },
  4: { jawOpen: 0.30, ...bilateral("mouthStretch", 0.34) },
  5: { jawOpen: 0.20, mouthPucker: 0.28 },
  6: { jawOpen: 0.16, ...bilateral("mouthStretch", 0.55) },
  7: { jawOpen: 0.14, mouthPucker: 0.72 },
  8: { jawOpen: 0.24, mouthFunnel: 0.62, mouthPucker: 0.20 },
  9: { jawOpen: 0.54, mouthPucker: 0.25 },
  10: { jawOpen: 0.35, mouthPucker: 0.44, ...bilateral("mouthStretch", 0.18) },
  11: { jawOpen: 0.60, ...bilateral("mouthStretch", 0.38) },
  12: { jawOpen: 0.20 },
  13: { jawOpen: 0.16, mouthPucker: 0.18 },
  14: { jawOpen: 0.24, ...bilateral("mouthStretch", 0.18) },
  15: { jawOpen: 0.08, mouthClose: 0.18, ...bilateral("mouthStretch", 0.40) },
  16: { jawOpen: 0.16, mouthFunnel: 0.36, mouthPucker: 0.22 },
  17: { jawOpen: 0.12, ...bilateral("mouthStretch", 0.20) },
  18: { jawOpen: 0.06, ...bilateral("mouthPress", 0.56) },
  19: { jawOpen: 0.12, mouthClose: 0.25 },
  20: { jawOpen: 0.17, mouthShrugUpper: 0.24 },
  21: { mouthClose: 0.84, ...bilateral("mouthPress", 0.62) }
};

export function createApproximateVisemes(text) {
  const events = [{ id: 0, offsetMs: 0 }];
  const characters = [...text.toLowerCase()];
  let offsetMs = 70;

  for (const character of characters) {
    if (/\s/.test(character)) {
      events.push({ id: 0, offsetMs });
      offsetMs += 55;
      continue;
    }

    events.push({ id: approximateVisemeId(character), offsetMs });
    offsetMs += /[.!?,]/.test(character) ? 150 : 72;
  }

  events.push({ id: 0, offsetMs: offsetMs + 80 });
  return events;
}

export function createSyntheticFacialFrames(text, frameRate = 60) {
  return createFacialFramesFromVisemes(createApproximateVisemes(text), frameRate);
}

export function createFacialFramesFromVisemes(events, frameRate = 60, {
  intensity = 1,
  jawIntensity = 1,
  mouthIntensity = 1,
  smoothing = 0
} = {}) {
  const safeEvents = events.length ? events : [{ id: 0, offsetMs: 0 }];
  const durationMs = (safeEvents.at(-1)?.offsetMs || 0) + 160;
  const frameCount = Math.ceil(durationMs / 1000 * frameRate) + 1;
  const frames = [];
  let previousArticulation = Array(AZURE_BLENDSHAPE_NAMES.length).fill(0);
  let eventIndex = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const elapsedMs = frameIndex / frameRate * 1000;
    while (eventIndex < safeEvents.length - 2 && safeEvents[eventIndex + 1].offsetMs <= elapsedMs) {
      eventIndex += 1;
    }

    const current = safeEvents[eventIndex];
    const next = safeEvents[Math.min(eventIndex + 1, safeEvents.length - 1)];
    const interval = Math.max(1, next.offsetMs - current.offsetMs);
    const blend = smoothstep(clamp01((elapsedMs - current.offsetMs) / interval));
    const frame = Array(AZURE_BLENDSHAPE_NAMES.length).fill(0);
    blendViseme(frame, current.id, (1 - blend) * intensity);
    blendViseme(frame, next.id, blend * intensity);

    for (let index = 0; index < frame.length; index += 1) {
      const name = AZURE_BLENDSHAPE_NAMES[index];
      if (name.startsWith("jaw")) frame[index] *= jawIntensity;
      else if (name.startsWith("mouth")) frame[index] *= mouthIntensity;
    }

    if (smoothing > 0) {
      const response = 1 - clamp01(smoothing);
      for (let index = 0; index < frame.length; index += 1) {
        const name = AZURE_BLENDSHAPE_NAMES[index];
        if (!name.startsWith("mouth") && !name.startsWith("jaw")) continue;
        frame[index] = previousArticulation[index] + (frame[index] - previousArticulation[index]) * response;
      }
      previousArticulation = [...frame];
    }

    const energy = frame[AZURE_BLENDSHAPE_NAMES.indexOf("jawOpen")];
    frame[AZURE_BLENDSHAPE_NAMES.indexOf("browInnerUp")] = 0.012 + energy * 0.035;
    frame[AZURE_BLENDSHAPE_NAMES.indexOf("cheekSquintLeft")] = energy * 0.018;
    frame[AZURE_BLENDSHAPE_NAMES.indexOf("cheekSquintRight")] = energy * 0.018;
    addSyntheticGaze(frame, elapsedMs);
    addSyntheticBlink(frame, elapsedMs);
    frames.push(frame);
  }

  return { frames, frameRate, durationMs };
}

function blendViseme(frame, visemeId, amount) {
  const weights = AZURE_VISEME_TO_ARKIT[visemeId] || {};
  for (const [name, value] of Object.entries(weights)) {
    const index = AZURE_BLENDSHAPE_NAMES.indexOf(name);
    if (index !== -1) frame[index] += value * amount * 0.62;
  }
}

function addSyntheticGaze(frame, elapsedMs) {
  const horizontal = Math.sin(elapsedMs * 0.0011) * 0.045;
  const vertical = Math.sin(elapsedMs * 0.00073 + 1.2) * 0.028;
  setDirectionalPair(frame, horizontal, "eyeLookInLeft", "eyeLookOutRight", "eyeLookOutLeft", "eyeLookInRight");
  setDirectionalPair(frame, vertical, "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight");
}

function setDirectionalPair(frame, value, positiveLeft, positiveRight, negativeLeft, negativeRight) {
  const leftName = value >= 0 ? positiveLeft : negativeLeft;
  const rightName = value >= 0 ? positiveRight : negativeRight;
  frame[AZURE_BLENDSHAPE_NAMES.indexOf(leftName)] = Math.abs(value);
  frame[AZURE_BLENDSHAPE_NAMES.indexOf(rightName)] = Math.abs(value);
}

function addSyntheticBlink(frame, elapsedMs) {
  const cycle = elapsedMs % 3200;
  if (cycle < 150) {
    const phase = cycle / 150;
    const weight = phase < 0.42 ? phase / 0.42 : Math.max(0, 1 - (phase - 0.42) / 0.58);
    frame[AZURE_BLENDSHAPE_NAMES.indexOf("eyeBlinkLeft")] = weight;
    frame[AZURE_BLENDSHAPE_NAMES.indexOf("eyeBlinkRight")] = weight;
  }
}

function approximateVisemeId(character) {
  if ("pbm".includes(character)) return 21;
  if ("fv".includes(character)) return 18;
  if ("tdn".includes(character)) return 19;
  if ("kgq".includes(character)) return 20;
  if ("szx".includes(character)) return 15;
  if ("cj".includes(character)) return 16;
  if ("lr".includes(character)) return 14;
  if ("wou".includes(character)) return 7;
  if ("eiy".includes(character)) return 6;
  if (character === "a") return 2;
  if (character === "h") return 12;
  return 1;
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
