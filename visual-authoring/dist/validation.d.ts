import type { CharacterGeometry, Vector3 } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export interface VisualValidationCheck {
    id: string;
    status: "passed" | "failed";
    code?: string;
    message: string;
    value?: number;
    limit?: number;
}
export interface VisualValidationReport {
    schemaVersion: 1;
    status: "passed" | "failed";
    checks: VisualValidationCheck[];
    metrics: {
        triangles: number;
        vertices: number;
        bones: number;
        weightedVertices: number;
        maxInfluences: number;
        degenerateTriangles: number;
        invalidNormals: number;
        invalidWeights: number;
        feetGroundErrorM: number;
        equipmentReachErrorM: number;
        intersectionRatio: number;
        bounds: {
            min: Vector3;
            max: Vector3;
        };
    };
}
export declare function validateCharacter(spec: CharacterSpec, style: VisualStyleBible, geometry: CharacterGeometry): VisualValidationReport;
