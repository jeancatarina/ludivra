import {
  UI_INSPECTION_PROJECTOR_ACCESS,
  UI_INSPECTION_PROJECTOR_EXECUTION,
  UI_INSPECTION_PROJECTOR_KIND,
  UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA,
  UI_INSPECTION_PROJECTOR_VERSION,
  UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA,
  type UiInspectionProjectorDeclaration
} from "./generated/ui-inspection-projector.js";
import {
  createUiLocaleTable,
  createUiViewModel,
  type UiInputProjection,
  type UiIntegerStateProjection,
  type UiLocaleSelection,
  type UiLocaleTable,
  type UiProjectionInput
} from "./ui-projection.js";
import type { UiViewModel } from "./generated/ui.js";

/** The only state surface available to a projector after an authoritative commit. */
export interface CommittedReadonlyState {
  readonly tick: bigint;
  integer(key: number): bigint;
}

export interface UiInspectionStateDefinition {
  id: string;
  label: string;
  key: number;
}

export interface UiInspectionInputDefinition {
  id: string;
  label: string;
  actionId: number;
}

export interface UiInspectionProjectorSource {
  states: readonly UiInspectionStateDefinition[];
  inputs: readonly UiInspectionInputDefinition[];
  locale?: UiLocaleSelection;
}

export interface UiInspectionProjectionMeasurement {
  projectorId: string;
  projectorVersion: typeof UI_INSPECTION_PROJECTOR_VERSION;
  kind: typeof UI_INSPECTION_PROJECTOR_KIND;
  access: typeof UI_INSPECTION_PROJECTOR_ACCESS;
  execution: typeof UI_INSPECTION_PROJECTOR_EXECUTION;
  stateReadsFormula: typeof UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA;
  uiNodesFormula: typeof UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA;
  stateReads: number;
  uiNodes: number;
}

export interface UiInspectionProjectorMetrics extends UiInspectionProjectionMeasurement {
  executions: number;
  totalStateReads: number;
  totalUiNodes: number;
}

export interface UiInspectionProjection {
  input: UiProjectionInput;
  localeTable: UiLocaleTable;
  viewModel: UiViewModel;
  measurement: UiInspectionProjectionMeasurement;
}

export interface UiInspectionProjector {
  readonly declaration: UiInspectionProjectorDeclaration;
  project(state: CommittedReadonlyState): UiInspectionProjection;
  metrics(): UiInspectionProjectorMetrics;
}

function selectDefinitions<T extends { id: string }>(
  projectorId: string,
  kind: "state" | "input",
  ids: readonly string[],
  definitions: readonly T[]
): T[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return ids.map((id) => {
    const definition = byId.get(id);
    if (definition === undefined) throw new Error(`UI_PROJECTOR_${kind.toUpperCase()}_UNKNOWN: ${projectorId}.${id}`);
    return definition;
  });
}

/**
 * Builds the initial declared projector. Its only dynamic dependency is the
 * committed read-only state passed to `project`; manifest definitions are
 * resolved once, before the first tick.
 */
export function createUiInspectionProjector(
  declaration: UiInspectionProjectorDeclaration,
  source: UiInspectionProjectorSource
): UiInspectionProjector {
  if (
    declaration.projectorVersion !== UI_INSPECTION_PROJECTOR_VERSION ||
    declaration.kind !== UI_INSPECTION_PROJECTOR_KIND
  ) {
    throw new Error(`UI_PROJECTOR_CONTRACT_UNSUPPORTED: ${declaration.id}`);
  }
  const states = selectDefinitions(declaration.id, "state", declaration.states, source.states);
  const inputs = selectDefinitions(declaration.id, "input", declaration.inputs, source.inputs);
  let executions = 0;
  let totalStateReads = 0;
  let totalUiNodes = 0;
  let latest: UiInspectionProjectionMeasurement = {
    projectorId: declaration.id,
    projectorVersion: UI_INSPECTION_PROJECTOR_VERSION,
    kind: UI_INSPECTION_PROJECTOR_KIND,
    access: UI_INSPECTION_PROJECTOR_ACCESS,
    execution: UI_INSPECTION_PROJECTOR_EXECUTION,
    stateReadsFormula: UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA,
    uiNodesFormula: UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA,
    stateReads: 0,
    uiNodes: 0
  };

  return {
    declaration,
    project(state: CommittedReadonlyState): UiInspectionProjection {
      const integers: UiIntegerStateProjection[] = states.map((definition) => ({
        id: definition.id,
        label: definition.label,
        value: state.integer(definition.key).toString()
      }));
      const projectedInputs: UiInputProjection[] = inputs.map(({ id, label, actionId }) => ({ id, label, actionId }));
      const input: UiProjectionInput = {
        screen: declaration.screen,
        tick: state.tick.toString(),
        integers,
        inputs: projectedInputs
      };
      const localeTable = createUiLocaleTable(input, source.locale);
      const viewModel = createUiViewModel(input);
      latest = {
        projectorId: declaration.id,
        projectorVersion: UI_INSPECTION_PROJECTOR_VERSION,
        kind: UI_INSPECTION_PROJECTOR_KIND,
        access: UI_INSPECTION_PROJECTOR_ACCESS,
        execution: UI_INSPECTION_PROJECTOR_EXECUTION,
        stateReadsFormula: UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA,
        uiNodesFormula: UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA,
        stateReads: states.length,
        uiNodes: viewModel.nodes.length
      };
      executions += 1;
      totalStateReads += latest.stateReads;
      totalUiNodes += latest.uiNodes;
      return { input, localeTable, viewModel, measurement: latest };
    },
    metrics(): UiInspectionProjectorMetrics {
      return { ...latest, executions, totalStateReads, totalUiNodes };
    }
  };
}
