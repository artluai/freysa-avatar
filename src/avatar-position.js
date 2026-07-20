export const MAX_AVATAR_YAW = 35 * Math.PI / 180;
export const MAX_AVATAR_PITCH = 12 * Math.PI / 180;

const MAX_HORIZONTAL_GAZE = 0.58;
const MAX_VERTICAL_GAZE = 0.38;

export const GAZE_CHANNEL_NAMES = Object.freeze([
  "eyeLookInLeft",
  "eyeLookOutRight",
  "eyeLookOutLeft",
  "eyeLookInRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeLookDownLeft",
  "eyeLookDownRight"
]);

export function avatarPositionFromDrag({
  startYaw = 0,
  startPitch = 0,
  deltaX = 0,
  deltaY = 0,
  width = 1,
  height = 1
} = {}) {
  return {
    yaw: clamp(
      startYaw + deltaX / Math.max(width, 1) * MAX_AVATAR_YAW * 2,
      -MAX_AVATAR_YAW,
      MAX_AVATAR_YAW
    ),
    pitch: clamp(
      startPitch + deltaY / Math.max(height, 1) * MAX_AVATAR_PITCH * 2,
      -MAX_AVATAR_PITCH,
      MAX_AVATAR_PITCH
    )
  };
}

export function cameraFixedGazeForRotation({ yaw = 0, pitch = 0 } = {}) {
  const horizontal = clamp(-yaw / MAX_AVATAR_YAW * MAX_HORIZONTAL_GAZE, -MAX_HORIZONTAL_GAZE, MAX_HORIZONTAL_GAZE);
  const vertical = clamp(pitch / MAX_AVATAR_PITCH * MAX_VERTICAL_GAZE, -MAX_VERTICAL_GAZE, MAX_VERTICAL_GAZE);
  const weights = Object.fromEntries(GAZE_CHANNEL_NAMES.map((name) => [name, 0]));

  weights[horizontal >= 0 ? "eyeLookInLeft" : "eyeLookOutLeft"] = Math.abs(horizontal);
  weights[horizontal >= 0 ? "eyeLookOutRight" : "eyeLookInRight"] = Math.abs(horizontal);
  weights[vertical >= 0 ? "eyeLookUpLeft" : "eyeLookDownLeft"] = Math.abs(vertical);
  weights[vertical >= 0 ? "eyeLookUpRight" : "eyeLookDownRight"] = Math.abs(vertical);
  return weights;
}

export function isAvatarPositionDefault({ yaw = 0, pitch = 0 } = {}, epsilon = 0.002) {
  return Math.abs(yaw) <= epsilon && Math.abs(pitch) <= epsilon;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}
