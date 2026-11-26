import Scene from "../../src/Scene";
import PhongShaderProgram from "../../src/shaders/PhongShaderProgram";
import { common } from "../../src/materials";
import Light, { LIGHT_DIRECTIONAL } from "../../src/lights/Light";
import { rgb } from "../../src/util/color";
import { setupMouseControls } from "../../src/controls/basic";
import { buildDancer } from "./model";
import { rotInv } from "./pose";
import { setupTracking } from "./tracking";

const VERT = "phongTextured.vert";
const FRAG = "phongTextured.frag";

const scene = new Scene("glcanvas");
scene.background = rgb(255, 255, 255);
scene.camera.z = -15;

// directions pointing toward each light, relative to the viewer
const lightRig = [
  { label: "keyLight", toward: [0, 1, 0], intensity: 1 },
  { label: "fillLight", toward: [-1, -1, 1], intensity: 0.25 / 0.55 },
];

function addLights() {
  for (const { label, intensity } of lightRig) {
    scene.addLight(
      new Light(label, [0, 0, 0], { type: LIGHT_DIRECTIONAL, intensity }),
    );
  }
}

/**
 * Dragging rotates the whole scene, lights included. Counter rotate the light
 * directions so they stay put relative to the viewer.
 */
function updateLights() {
  const { sceneTransform } = scene._calculateMatrices();
  for (const { label, toward } of lightRig) {
    // a Light's direction is the way it travels, so negate
    scene.getLight(label).direction = rotInv(
      sceneTransform,
      toward.map((v) => -v),
    );
  }
}

/** arrow keys pan, w/s zoom. Ignored while typing or using the video */
function setupKeyboardControls() {
  const step = 0.2;
  const moves = {
    ArrowUp: [0, -step, 0],
    ArrowDown: [0, step, 0],
    ArrowLeft: [step, 0, 0],
    ArrowRight: [-step, 0, 0],
    w: [0, 0, step],
    s: [0, 0, -step],
  };

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "VIDEO") return;
    if (moves[e.key]) scene.camera.move(...moves[e.key]);
  });
}

/**
 * Show the engine's shader sources in the text areas and relink on every key
 * release. A shader that fails to compile leaves the last good program running.
 */
function setupShaderEditors() {
  const editors = [
    [document.getElementById("vertEditor"), scene.getShader(VERT)],
    [document.getElementById("fragEditor"), scene.getShader(FRAG)],
  ];

  const rebuild = () => {
    const gl = scene.gl;
    const program = scene.getProgram("phong");
    const previous = editors.map(([, shader]) => [shader.source, shader.shader]);
    const oldProgram = program.program;
    const oldLightBuffer = program.lightBuffer;

    try {
      for (const [editor, shader] of editors) {
        shader.source = editor.value;
        shader.init(gl);
      }
      program.load(gl, scene);
    } catch (e) {
      console.error(e);
      editors.forEach(([, shader], i) => {
        [shader.source, shader.shader] = previous[i];
      });
      program.program = oldProgram;
      return;
    }

    gl.deleteProgram(oldProgram);
    gl.deleteBuffer(oldLightBuffer);

    // every location belonged to the old program
    scene.objects.forEach((obj) => obj.setUniforms(scene));
    scene.loadMaterials();
    // otherwise the next frame "cleans up" the material on the deleted program
    scene.activeMaterial = undefined;
  };

  for (const [editor, shader] of editors) {
    editor.value = shader.source;
    editor.addEventListener("keyup", () => {
      if (editor.value !== shader.source) rebuild();
    });
  }
}

async function main() {
  scene.createProgram(
    "phong",
    `../../src/shaders/vertex/${VERT}`,
    `../../src/shaders/fragment/${FRAG}`,
    PhongShaderProgram,
  );

  scene.addMaterial(
    common.generateMaterial("dancer", {
      ka: [0.2, 0.2, 0.2],
      kd: [0.55, 0.55, 0.55],
      ks: [0.35, 0.35, 0.35],
      specularExp: 3,
    }),
    "phong",
  );

  addLights();
  scene.setUpdateCB(updateLights);

  await scene.load();

  const dancer = buildDancer();
  scene.addObject(dancer.torso, "phong", "dancer", { addChildren: true });

  setupMouseControls(scene);
  setupKeyboardControls();
  setupShaderEditors();
  setupTracking(dancer);

  const renderLoop = () => {
    scene.render();
    requestAnimationFrame(renderLoop);
  };
  renderLoop();
}

main();
