export const SOURCE_TEXTURE = 0;
export const SOURCE_FUNCTION = 1;

export const BLEND_IGNORE = 0;
export const BLEND_NORMAL = 1;
export const BLEND_MULTIPLY = 2;
export const BLEND_ADD = 3;
export const BLEND_MAX = 4;
export const BLEND_LIGHTEN = 5;
export const BLEND_DARKEN = 6;

export const TEXTURE_ALBEDO = 0;
export const TEXTURE_NORMAL = 1;
export const TEXTURE_BUMP = 2;

/**
 * just an abstraction to make packing texture ints easier
 */
export default class RayTextureDescriptor {
  /**
   * Create a new ray texture descriptor wrapper
   * @param {number} sourceType SOURCE_TEXTURE|SOURCE_FUNCTION
   * @param {number} blendMode BLEND_IGNORE | BLEND_NORMAL | BLEND_MULTIPLY | BLEND_ADD | BLEND_MAX | BLEND_LIGHTEN | BLEND_DARKEN
   * @param {number} textureType TEXTURE_ALBEDO | TEXTURE_NORMAL | TEXTURE_BUMP
   * @param {number} textureIndex [0-255]
   */
  constructor(sourceType, blendMode, textureType, textureIndex) {
    this.sourceType = sourceType;
    this.blendMode = blendMode;
    this.textureType = textureType;
    this.textureIndex = textureIndex;
  }

  /**
   * Pack the texture information into an int
   * glsl counterpart:
   * <pre>
   * uint packTexDescriptor(
   *   uint sourceType,
   *   uint blendMode,
   *   uint textureType,
   *   uint textureIndex
   * ) {
   *   return (sourceType & 1u) |
   *     ((blendMode & 7u) << 1u) |
   *     ((textureType & 15u) << 4u) |
   *     ((textureIndex & 255u) << 8u);
   * }
   * </pre>
   */
  pack() {
    return (
      (this.sourceType & 1) |
      ((this.blendMode & 7) << 1) |
      ((this.textureType & 15) << 4) |
      ((this.textureIndex & 255) << 8)
    );
  }
}