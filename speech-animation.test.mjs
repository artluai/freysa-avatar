import assert from "node:assert/strict";
import test from "node:test";
import { appendFacialAnimationBatch, normalizeFacialFrames } from "./speech-animation.mjs";

test("places Azure facial frames at their declared frame index", () => {
  const target = [];
  const count = appendFacialAnimationBatch(target, JSON.stringify({
    FrameIndex: 2,
    BlendShapes: [
      [0.1, 0.2],
      [0.3, 1.4]
    ]
  }));

  assert.equal(count, 2);
  assert.equal(target[2].length, 55);
  assert.deepEqual(target[2].slice(0, 3), [0.1, 0.2, 0]);
  assert.deepEqual(target[3].slice(0, 2), [0.3, 1]);
});

test("fills missing frames with the previous complete frame", () => {
  const frames = [];
  frames[0] = [0.123456];
  frames[2] = [0.4];

  const normalized = normalizeFacialFrames(frames);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0][0], 0.1235);
  assert.equal(normalized[1][0], 0.1235);
  assert.equal(normalized[2][0], 0.4);
});
