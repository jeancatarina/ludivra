import type { TextureRequest, VisualStyleBible } from "./spec.js";
export interface CompiledTextureMap {
    bytes: Uint8Array;
    sha256: string;
}
export interface CompiledTexture {
    width: number;
    height: number;
    edgeDelta: number;
    issues: Array<{
        code: "VISUAL_TEXTURE_NOT_TILEABLE";
        message: string;
    }>;
    maps: {
        albedo: CompiledTextureMap;
        normal: CompiledTextureMap;
        roughness: CompiledTextureMap;
        detailMask: CompiledTextureMap;
    };
}
export declare function compileTexture(input: Uint8Array, request: TextureRequest, style: VisualStyleBible): CompiledTexture;
