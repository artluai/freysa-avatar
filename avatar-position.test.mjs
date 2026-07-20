import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AVATAR_PITCH,
  MAX_AVATAR_YAW,
  avatarPositionFromDrag,
  cameraFixedGazeForRotation,
  isAvatarPositionDefault
} from "./src/avatar-position.js";

test("drag rotation is proportional and restrained to natural limits", () => {
  const position = avatarPositionFromDrag({ deltaX: 1000, deltaY: -1000, width: 500, height: 500 });
  assert.equal(position.yaw, MAX_AVATAR_YAW);
  assert.equal(position.pitch, -MAX_AVATAR_PITCH);
});

test("eye gaze counter-rotates to remain fixed on the camera", () => {
  const gaze = cameraFixedGazeForRotation({ yaw: MAX_AVATAR_YAW, pitch: MAX_AVATAR_PITCH });
  assert.ok(gaze.eyeLookOutLeft > 0);
  assert.ok(gaze.eyeLookInRight > 0);
  assert.ok(gaze.eyeLookUpLeft > 0);
  assert.ok(gaze.eyeLookUpRight > 0);
  assert.equal(gaze.eyeLookInLeft, 0);
  assert.equal(gaze.eyeLookOutRight, 0);
});

test("reset position is treated as the centered default", () => {
  assert.equal(isAvatarPositionDefault({ yaw: 0, pitch: 0 }), true);
  assert.equal(isAvatarPositionDefault({ yaw: 0.1, pitch: 0 }), false);
});
