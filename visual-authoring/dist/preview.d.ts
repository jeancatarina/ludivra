import type { CharacterGeometry } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
import type { VisualValidationReport } from "./validation.js";
export declare function renderCharacterPreview(spec: CharacterSpec, style: VisualStyleBible, geometry: CharacterGeometry, report: VisualValidationReport): string;
