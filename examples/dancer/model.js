/**
 * The jointed dancer, built from Potato Engine SceneObjects.
 *
 * Each joint is an invisible, unscaled pivot that carries position + rotation.
 * The visible cube / sphere hangs off the pivot as a child with its own scale,
 * so a body part's size is never inherited by the joints further down the chain.
 */
import { generateCube, generateSphere } from "../../src/objects/primitives";
import { rgb } from "../../src/util/color";

const grey = rgb(230, 230, 230);

const shapes = {
  cube: () => generateCube(),
  sphere: () => generateSphere(24, 1),
};

let partCount = 0;

/** make a SceneObject for one of the shapes, labels must be unique in a scene */
function makePart(shape, options) {
  const prim = shapes[shape]();
  prim.generateColors(grey);
  return prim.toSceneObject(`dancer-${partCount++}`, undefined, options);
}

/**
 * make a joint
 * @param {SceneObject} parent
 * @param {number[]} location offset from the parent joint
 * @param {...Array} bodies [shape, scale, position] tuples drawn at this joint
 */
function node(parent, location, ...bodies) {
  const pivot = makePart("cube", { position: location, shouldDraw: false });
  for (const [shape, scale, position = [0, 0, 0]] of bodies) {
    pivot.addChild(makePart(shape, { scale, position }));
  }
  parent?.addChild(pivot);
  return pivot;
}

function buildArm(torso, side) { // 1 = left, -1 = right
  const shoulder = node(torso, [1.05 * side, 1.3, 0], ["sphere", [0.4, 0.4, 0.4]]);
  const bicep = node(shoulder, [0, -0.8, 0], ["cube", [0.33, 0.6, 0.33]]);
  const elbow = node(bicep, [0, -0.6, 0], ["sphere", [0.4, 0.4, 0.4]]);
  node(elbow, [0, -0.8, 0], ["cube", [0.28, 0.7, 0.28]]); // forearm

  // shoulder and elbow are the only rotating pieces
  return { shoulder, elbow };
}

function buildLeg(torso, side) { // 1 = left, -1 = right
  const hip = node(torso, [0.45 * side, -0.9, 0], ["sphere", [0.45, 0.45, 0.45]]);
  const thigh = node(hip, [0, -0.85, 0], ["cube", [0.4, 0.7, 0.4]]);
  const knee = node(thigh, [0, -0.85, 0], ["sphere", [0.4, 0.4, 0.4]]);
  node(knee, [0, -0.85, 0], ["cube", [0.35, 0.8, 0.35]]); // shin

  // hip and knee are the only rotating pieces
  return { hip, knee };
}

/** @returns root SceneObject (torso) and every joint that gets posed */
export function buildDancer() {
  const torso = node(
    null,
    [0, 0, 0],
    ["cube", [0.7, 1, 0.35]],
    ["cube", [0.85, 0.6, 0.4], [0, 1, 0]],
  );

  const leftArm = buildArm(torso, 1);
  const rightArm = buildArm(torso, -1);
  const leftLeg = buildLeg(torso, 1);
  const rightLeg = buildLeg(torso, -1);

  const neck = node(torso, [0, 1.5, 0], ["cube", [0.25, 0.25, 0.25]]);
  node(neck, [0, 1, 0], ["sphere", [0.8, 0.8, 0.8]]); // head

  return { torso, neck, leftArm, rightArm, leftLeg, rightLeg };
}
