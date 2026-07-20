export const EMOTION_PRESETS = Object.freeze({
  neutral: Object.freeze({}),
  warm: Object.freeze({
    mouthSmileLeft: 0.20,
    mouthSmileRight: 0.20,
    mouthDimpleLeft: 0.045,
    mouthDimpleRight: 0.045,
    cheekSquintLeft: 0.10,
    cheekSquintRight: 0.10,
    eyeSquintLeft: 0.075,
    eyeSquintRight: 0.075,
    browOuterUpLeft: 0.065,
    browOuterUpRight: 0.065
  }),
  amused: Object.freeze({
    mouthSmileLeft: 0.24,
    mouthSmileRight: 0.17,
    mouthDimpleLeft: 0.065,
    mouthDimpleRight: 0.035,
    cheekSquintLeft: 0.11,
    cheekSquintRight: 0.08,
    eyeSquintLeft: 0.085,
    eyeSquintRight: 0.06,
    browOuterUpLeft: 0.10,
    browOuterUpRight: 0.045
  }),
  thoughtful: Object.freeze({
    browInnerUp: 0.14,
    browOuterUpLeft: 0.07,
    browOuterUpRight: 0.07,
    mouthPressLeft: 0.045,
    mouthPressRight: 0.045,
    mouthDimpleLeft: 0.02
  }),
  concerned: Object.freeze({
    browInnerUp: 0.20,
    browDownLeft: 0.06,
    browDownRight: 0.06,
    mouthFrownLeft: 0.10,
    mouthFrownRight: 0.10
  }),
  surprised: Object.freeze({
    eyeWideLeft: 0.17,
    eyeWideRight: 0.17,
    browInnerUp: 0.20,
    browOuterUpLeft: 0.14,
    browOuterUpRight: 0.14,
    jawOpen: 0.055
  }),
  doubtful: Object.freeze({
    browInnerUp: 0.13,
    browOuterUpLeft: 0.12,
    browDownRight: 0.06,
    eyeSquintRight: 0.05,
    mouthFrownLeft: 0.055,
    mouthPressRight: 0.04
  }),
  suspicious: Object.freeze({
    browDownLeft: 0.14,
    browDownRight: 0.10,
    eyeSquintLeft: 0.08,
    eyeSquintRight: 0.05,
    noseSneerLeft: 0.035,
    mouthPressLeft: 0.055,
    mouthPressRight: 0.04,
    mouthFrownLeft: 0.035
  }),
  disapproving: Object.freeze({
    browDownLeft: 0.10,
    browDownRight: 0.10,
    eyeSquintLeft: 0.04,
    eyeSquintRight: 0.04,
    noseSneerLeft: 0.025,
    noseSneerRight: 0.025,
    mouthPressLeft: 0.11,
    mouthPressRight: 0.11,
    mouthFrownLeft: 0.08,
    mouthFrownRight: 0.08
  })
});

export const EMOTION_NAMES = Object.freeze(Object.keys(EMOTION_PRESETS));

export function selectResponseEmotion(message, responseText) {
  const content = `${message} ${responseText}`.toLowerCase();

  if (/\b(wow|amazing|surpris(?:e|ed|ing)|unexpected|incredible)\b/.test(content)) {
    return { name: "surprised", intensity: 0.90 };
  }
  if (/\b(suspicious|suspect|distrust|lying|lie|deceive|deception|motive|manipulat(?:e|ed|ion)|prove)\b/.test(content)) {
    return { name: "suspicious", intensity: 0.90 };
  }
  if (/\b(doubt|doubtful|unsure|uncertain|skeptic|skeptical|unlikely|convince|believe)\b/.test(content)) {
    return { name: "doubtful", intensity: 0.90 };
  }
  if (/\b(wrong|greed|greedy|selfish|cruel|harm|dishonest|disappoint(?:ed|ing)?|unacceptable)\b/.test(content)) {
    return { name: "disapproving", intensity: 0.90 };
  }
  if (/\b(sad|sorry|worried|afraid|hurt|problem|difficult|concerned)\b/.test(content)) {
    return { name: "concerned", intensity: 0.90 };
  }
  if (/\b(joke|funny|laugh|lol|amused)\b/.test(content)) {
    return { name: "amused", intensity: 0.90 };
  }
  if (/\b(hello|hi|hey|thanks|thank you|glad|happy|welcome)\b/.test(content)) {
    return { name: "warm", intensity: 0.90 };
  }
  if (/\b(why|how|think|consider|meaning|curious|question|learn|learned|remember|memory|teach|humanity|future)\b/.test(content)) {
    return { name: "thoughtful", intensity: 0.86 };
  }
  return { name: "neutral", intensity: 0 };
}

export function getEmotionWeight(emotion, channelName) {
  const preset = EMOTION_PRESETS[emotion?.name] || EMOTION_PRESETS.neutral;
  const intensity = Math.min(2, Math.max(0, Number(emotion?.intensity) || 0));
  return (preset[channelName] || 0) * intensity;
}

export function getAdjustedEmotionWeight(
  emotion,
  channelName,
  masterIntensity = 1,
  individualIntensity = 1
) {
  const intensity = (Number(emotion?.intensity) || 0)
    * controlMultiplier(masterIntensity)
    * controlMultiplier(individualIntensity);
  return getEmotionWeight({ ...emotion, intensity }, channelName);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function controlMultiplier(value) {
  return clamp01(value) * 2;
}
