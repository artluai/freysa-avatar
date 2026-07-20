const FRAME_WIDTH = 55;

export function appendFacialAnimationBatch(targetFrames, animationJson) {
  if (typeof animationJson !== "string" || !animationJson.trim()) return 0;

  const batch = JSON.parse(animationJson);
  const frameIndex = Math.max(0, Math.trunc(Number(batch.FrameIndex) || 0));
  if (!Array.isArray(batch.BlendShapes)) return 0;

  let appended = 0;
  for (let index = 0; index < batch.BlendShapes.length; index += 1) {
    const sourceFrame = batch.BlendShapes[index];
    if (!Array.isArray(sourceFrame)) continue;

    targetFrames[frameIndex + index] = Array.from(
      { length: FRAME_WIDTH },
      (_unused, channel) => clamp01(Number(sourceFrame[channel]) || 0)
    );
    appended += 1;
  }

  return appended;
}

export function normalizeFacialFrames(frames) {
  const normalized = [];
  let previous = Array(FRAME_WIDTH).fill(0);

  for (let index = 0; index < frames.length; index += 1) {
    const frame = Array.isArray(frames[index]) ? frames[index] : previous;
    previous = Array.from(
      { length: FRAME_WIDTH },
      (_unused, channel) => round4(clamp01(Number(frame[channel]) || 0))
    );
    normalized.push(previous);
  }

  return normalized;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
