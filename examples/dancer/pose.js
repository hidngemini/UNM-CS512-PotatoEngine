/**
 * Turn MediaPipe world landmarks into joint rotations on the dancer.
 */
import { mat4Identity, multiplyMat4 } from "../../src/util/transformations";

/**
 * SceneObjects take Euler angles (applied as Rz * Ry * Rx) rather than a
 * rotation matrix, so convert at the point where a joint gets set.
 *
 * @param {Float32Array} m column major pure rotation mat4
 * @returns {number[]} [x, y, z] in radians
 */
export function toEuler(m) {
  const sy = -m[2];
  if (Math.abs(sy) > 0.999999) {
    // gimbal lock, only x -/+ z is defined so put it all on x
    return [Math.atan2(sy * m[4], m[5]), Math.sign(sy) * (Math.PI / 2), 0];
  }
  return [
    Math.atan2(m[6], m[10]),
    Math.atan2(sy, Math.hypot(m[0], m[1])),
    Math.atan2(m[1], m[0]),
  ];
}

// vector functions
function vectorSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorAverage(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-8 ? [0, -1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

// build a rotation matrix from three orthonormal basis vectors.
function basisMatrix(x, y, z) {
  return new Float32Array([...x, 0, ...y, 0, ...z, 0, 0, 0, 0, 1]);
}

// find a vector's absolute position relative to a local rotated position
export function rotInv(m, d) {
  return [
    m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
    m[4] * d[0] + m[5] * d[1] + m[6] * d[2],
    m[8] * d[0] + m[9] * d[1] + m[10] * d[2]
  ];
}

// find the shortest rotation from direction a to direction b (rodrigues rotation formula)
function shortestArc(a, b) {
  const c = dot(a, b);
  if (c < -0.9999) { // it doesn't matter; rotate 180 degrees
    const u = normalize(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    const [x, y, z] = u;
    return new Float32Array([
      2 * x * x - 1, 2 * x * y, 2 * x * z, 0,
      2 * x * y, 2 * y * y - 1, 2 * y * z, 0,
      2 * x * z, 2 * y * z, 2 * z * z - 1, 0,
      0, 0, 0, 1]);
  }
  const [x, y, z] = cross(a, b);
  const k = 1 / (1 + c);
  return new Float32Array([
    1 - k * (y * y + z * z), z + k * x * y, -y + k * x * z, 0,
    -z + k * x * y, 1 - k * (x * x + z * z), x + k * y * z, 0,
    y + k * x * z, -x + k * y * z, 1 - k * (x * x + y * y), 0,
    0, 0, 0, 1]);
}

/*
MediaPipe node indices that we actually care about
7/8   - ears
11/12 - shoulders
13/14 - elbows
15/16 - wrists
23/24 - hips
25/26 - knees
27/28 - ankles
*/
const TRACKED_NODES = [7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
// smoothed positions
let smooth = {};

/** forget the smoothing history, ie when a new video is loaded */
export function resetPose() {
  smooth = {};
}

export function getNodeInfo(world, { smoothing, mirror, invertDepth }) {
  // get info from controls
  const alpha = 1 - smoothing;
  const xMirror = mirror ? -1 : 1;
  const zMirror = invertDepth ? 1 : -1;

  // iterate through tracked nodes
  for (const i of TRACKED_NODES) {
    // swap which nodes are left and which are right based on mirrored
    const src = mirror ? (i % 2 ? i + 1 : i - 1) : i;
    const worldPos = world[src];

    // prevent jitter from uncertainty (0.4 threshold)
    if (!worldPos || (worldPos.visibility !== undefined && worldPos.visibility < 0.4)) continue; 

    // compute movement via exponential moving average dictated by smoothing slider
    const currentPos = [xMirror * worldPos.x, -worldPos.y, zMirror * worldPos.z];
    const previousPos = smooth[i];
    smooth[i] = previousPos
      ? [previousPos[0] + (currentPos[0] - previousPos[0]) * alpha, previousPos[1] + (currentPos[1] - previousPos[1]) * alpha, previousPos[2] + (currentPos[2] - previousPos[2]) * alpha]
      : currentPos;
  }
}

// define direction constants
const DOWN = [0, -1, 0];
const UP = [0, 1, 0];

// figure out how much the joint needs to move from its default direction
function aim(jointNode, parentRot, worldDir, restDir) {
  const local = rotInv(parentRot, worldDir);
  const rotation = shortestArc(restDir, local);
  jointNode.rotation = toEuler(rotation);
  return multiplyMat4(parentRot, rotation);
}

// apply pose to the model
export function applyPose(dancer, { rotateTorso }) {
  const { torso, neck, leftArm, rightArm, leftLeg, rightLeg } = dancer;

  // check if the smooth array contains all necessary information
  function has(...ids) {
    return ids.every(i => smooth[i]);
  }

  // compute torso rotation from shoulder and hip positions
  let torsoRot = mat4Identity();
  if (rotateTorso && has(11, 12, 23, 24)) {
    // direction of average hip position to average shoulder position (spine pointing up)
    let up = normalize(vectorSubtract(vectorAverage(smooth[11], smooth[12]), vectorAverage(smooth[23], smooth[24])));

    // get the side to side axis from the vector from the right to the left shoulder
    let left = normalize(vectorSubtract(smooth[11], smooth[12]));
    
    // get the forward facing axis from the cross product of the up and side to side vectors
    let forward = normalize(cross(left, up));

    // recompute left with up and forward to guarantee orthagonal basis
    left = cross(up, forward);

    // generate change of basis matrix according to those directions
    torsoRot = basisMatrix(left, up, forward);
  }

  // rotate the torso according to that change of basis matrix
  torso.rotation = toEuler(torsoRot);

  // shIdx = Shoulder / Hip
  // ekIdx = Elbow    / Knee
  // wfIdx = Wrist    / Foot
  const limb = (shIdx, ekIdx, wfIdx, joint1, joint2) => {
    if (!has(shIdx, ekIdx)) {
      return;
    }
    const r1 = aim(
      joint1,                                                       // aim joint 1 (either the shoulder or the hip)
      torsoRot,                                                     // with the torso's rotation as its reference point
      normalize(vectorSubtract(smooth[ekIdx], smooth[shIdx])),      // toward the direction from the shoulder (or hip) to the elbow (or knee)
      DOWN                                                          // with down as its resting position
    );
    if (has(wfIdx)) {
      aim(
        joint2,                                                     // aim joint 2 (either the elbow or knee)
        r1,                                                         // with r1 as its parent rotation (the bicep aim direction)
        normalize(vectorSubtract(smooth[wfIdx], smooth[ekIdx])),    // to the direction from the elbow (or knee) to the wrist (or foot)
        DOWN                                                        // with down as its resting position
      );
    }
  };
  
  // rotate all our limbs according to the positions from mediapipe
  limb(11, 13, 15, leftArm.shoulder, leftArm.elbow);
  limb(12, 14, 16, rightArm.shoulder, rightArm.elbow);
  limb(23, 25, 27, leftLeg.hip, leftLeg.knee);
  limb(24, 26, 28, rightLeg.hip, rightLeg.knee);

  // aim head only if head points exist.
  if (has(7, 8, 11, 12)) {
    aim(
      neck,                                                         // aim neck joint
      torsoRot,                                                     // with the torso's rotation as its reference point
      normalize(vectorSubtract(vectorAverage(smooth[7], smooth[8]), 
      vectorAverage(smooth[11], smooth[12]))),                      // toward the direction from the average shoulder point to the average ear point 
      UP                                                            // with up as its resting position
    );
  }
}
