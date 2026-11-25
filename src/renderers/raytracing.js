/**
 * @module renderers
 */

import { Scene } from "..";
import { RayMaterial } from "../materials";
import { ShaderProgram } from "../shaders";
import RayShaderProgram from "../shaders/RayShaderProgram";
import RayRenderPass from "./RayRenderPass";

// TODO a lot of this can probably just
// be moved into the ray render pass...

export const RENDER_PASS_RAY = "ray";

/**
 * Add a basic ray tracing render pass
 * which primarily uses RayObjects in its scene.
 * @param {Scene} scene
 * @param {string} programLabel the label of the ray tracing program
 */
export function addRayTracingRenderPass(scene, programLabel = RENDER_PASS_RAY) {
  const rayPass = new RayRenderPass(RENDER_PASS_RAY, {
    clearMask: scene.gl
      ? scene.gl.COLOR_BUFFER_BIT | scene.gl.DEPTH_BUFFER_BIT
      : 0,
    setup,
    updateUniforms,
    cleanup,
    objIndependent: true,
    programLabel,
  });

  scene.addRenderPass(rayPass);
}

/**
 * Attach the render pass to the scene
 * @param {WebGL2RenderingContext} gl
 * @param {Scene} scene
 */
function setup(gl, scene) {
  // no setup rn
}

/**
 * Update the uniforms relevant to the pass
 * which are linked to the scene directly
 * - in our case here probably the camera uniforms count
 * @param {WebGL2RenderingContext} gl
 * @param {ShaderProgram} shaderProgram
 * @param {Scene} scene
 */
function updateUniforms(gl, shaderProgram, scene) {
  if (!(shaderProgram instanceof RayShaderProgram)) {
    return;
  }

  shaderProgram.uniforms.u_target = new Float32Array([
    -scene.camera.x,
    -scene.camera.y,
    -scene.camera.z,
  ]);

  shaderProgram.uniforms.u_cameraOrbit = new Float32Array([
    scene.camera.pitch,
    scene.camera.yaw,
  ]);

  shaderProgram.uniforms.u_fov = -scene.camera.fov;

  const seenTextures = new Set();
  for (const mat of this.materials) {
    const tl = mat.textureMapLabel;

    if (tl && !seenTextures.has(tl)) {
      seenTextures.add(tl);
      const tex = scene.getTexture(tl);
      tex.bind(seenTextures.size - 1, scene.gl);
      gl.uniform1ui(
        shaderProgram.locs[`u_textureLayerCount${seenTextures.size - 1}`],
        tex.layerCount,
      );
    }
  }

  gl.uniform1i(shaderProgram.locs.u_objectData, 2);
  gl.uniform1i(
    shaderProgram.locs.u_objectDataWidth,
    shaderProgram.objectDataTexture.width,
  );

  gl.uniform1i(shaderProgram.locs.u_lightData, 3);
  gl.uniform1i(
    shaderProgram.locs.u_lightDataWidth,
    shaderProgram.lightDataTexture.width,
  );

  shaderProgram.objectDataTexture.uploadObjects(
    gl,
    [...this.objects],
    this.materialMap,
    seenTextures.size,
    shaderProgram.locs.u_objectData,
    shaderProgram.locs.u_objectCount,
  );

  shaderProgram.lightDataTexture.uploadObjects(
    gl,
    [...this.lights],
    this.materialMap,
    seenTextures.size + 1,
    shaderProgram.locs.u_lightData,
    shaderProgram.locs.u_lightCount,
  );

  // TODO maybe shift all the loc handling into upload objects too, this is nice
  shaderProgram.materialDataTexture.uploadMaterials(
    gl,
    this.materials,
    seenTextures.size + 2,
    shaderProgram.locs.u_materialData,
    shaderProgram.locs.u_materialCount,
    shaderProgram.locs.u_materialDataWidth,
  );

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * Detach the render pass from the scene
 * @param {WebGL2RenderingContext} gl
 * @param {Scene} scene
 */
function cleanup(gl, scene) {}

/**
 * Pack materials into the material buffer
 */
function packMaterials(gl, materials, shaderProgram) {
  const bytes = new ArrayBuffer(
    RayMaterial.MATERIAL_BYTE_SIZE * shaderProgram.maxMaterials,
  );
  const view = new DataView(bytes);

  for (let i = 0; i < materials.length; i++) {
    const offset = i * RayMaterial.MATERIAL_BYTE_SIZE;
    materials[i].materialIndex = i;
    materials[i].packData(view, offset);
  }

  // throw the data into the buffer
  gl.bindBuffer(gl.UNIFORM_BUFFER, shaderProgram.materialBuffer);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Uint8Array(bytes));
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);

  shaderProgram.uniforms.u_materialCount = materials.length;
}
