// Generated from contracts/ui-inspection-projector.schema.json. Do not edit.

export const UI_INSPECTION_PROJECTOR_VERSION = 1 as const;
export const UI_INSPECTION_PROJECTOR_KIND = "ui-inspection" as const;
export const UI_INSPECTION_PROJECTOR_ACCESS = "read-only" as const;
export const UI_INSPECTION_PROJECTOR_EXECUTION = "post-commit" as const;
export const UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA = "states.length" as const;
export const UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA = "viewModel.nodes.length" as const;

export interface UiInspectionProjectorDeclaration {
  projectorVersion: typeof UI_INSPECTION_PROJECTOR_VERSION;
  id: string;
  kind: typeof UI_INSPECTION_PROJECTOR_KIND;
  screen: string;
  states: string[];
  inputs: string[];
}
