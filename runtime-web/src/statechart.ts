import type {
  StatechartActionBinding,
  StatechartInstallOptions,
  StatechartState,
  StatechartTransition
} from "./index.js";

export interface StatechartManifestDeclaration {
  charts: Array<{ id: string; source: string }>;
  events: Array<{ id: string; actionId: number }>;
  guards: Array<{ id: string }>;
  actions: Array<{ id: string }>;
}

export interface CompiledStatechartDocument {
  charts?: Array<{
    id: string;
    initial: string;
    states: Array<{ id: string; parent?: string; history: boolean; entryActions: string[]; exitActions: string[] }>;
    transitions: Array<{
      id: string;
      from: string;
      to: string;
      event?: string;
      afterTicks?: number;
      priority: number;
      kind: "external" | "internal";
      guard?: string;
      actions: string[];
    }>;
  }>;
}

export interface StatechartRuntimeInstaller {
  installStatechart(
    states: readonly StatechartState[],
    transitions: readonly StatechartTransition[],
    initialState: number,
    options?: StatechartInstallOptions
  ): void;
}

export interface InstalledStatechartNames {
  chart: string;
  states: Map<number, string>;
  transitions: Map<number, string>;
  guards: Map<number, string>;
  actions: Map<number, string>;
}

/**
 * Converts the canonical compiled statechart graph once at the host boundary.
 * Numeric IDs stay a compact ABI detail; manifests and traces keep semantic IDs.
 */
export function installCompiledStatechart(
  target: StatechartRuntimeInstaller,
  declaration: StatechartManifestDeclaration | undefined,
  graph: CompiledStatechartDocument | undefined
): InstalledStatechartNames | undefined {
  if (declaration === undefined) return undefined;
  const chart = graph?.charts?.[0];
  if (graph?.charts?.length !== 1 || chart === undefined || declaration.charts.length !== 1 || declaration.charts[0]?.id !== chart.id) {
    throw new Error("STATECHART_SCHEMA_INVALID");
  }
  const stateIds = new Map(chart.states.map(({ id }, index) => [id, index + 1]));
  const eventIds = new Map(declaration.events.map(({ id, actionId }) => [id, actionId]));
  const guardIds = new Map([...declaration.guards].sort((left, right) => left.id.localeCompare(right.id)).map(({ id }, index) => [id, index + 1]));
  const actionIds = new Map([...declaration.actions].sort((left, right) => left.id.localeCompare(right.id)).map(({ id }, index) => [id, index + 1]));
  const bindings = [
    ...chart.states.flatMap((state) => state.entryActions.map((action) => ({ ownerId: stateIds.get(state.id)!, actionId: actionIds.get(action), phase: "entry" as const }))),
    ...chart.states.flatMap((state) => state.exitActions.map((action) => ({ ownerId: stateIds.get(state.id)!, actionId: actionIds.get(action), phase: "exit" as const }))),
    ...chart.transitions.flatMap((transition, index) => transition.actions.map((action) => ({ ownerId: index + 1, actionId: actionIds.get(action), phase: "transition" as const })))
  ];
  if (bindings.some(({ actionId }) => actionId === undefined)) throw new Error("STATECHART_ACTION_UNREGISTERED");
  const transitions: StatechartTransition[] = chart.transitions.map((transition, index) => {
    const eventActionId = transition.event === undefined ? undefined : eventIds.get(transition.event);
    const guardId = transition.guard === undefined ? undefined : guardIds.get(transition.guard);
    if ((eventActionId === undefined) === (transition.afterTicks === undefined) ||
        (transition.guard !== undefined && guardId === undefined) ||
        stateIds.get(transition.from) === undefined || stateIds.get(transition.to) === undefined) {
      throw new Error("STATECHART_SCHEMA_INVALID");
    }
    return {
      id: index + 1,
      fromState: stateIds.get(transition.from)!,
      ...(eventActionId === undefined ? {} : { eventActionId }),
      ...(transition.afterTicks === undefined ? {} : { afterTicks: transition.afterTicks }),
      toState: stateIds.get(transition.to)!,
      priority: transition.priority,
      kind: transition.kind,
      ...(guardId === undefined ? {} : { guardId })
    };
  });
  const initialState = stateIds.get(chart.initial);
  if (initialState === undefined) throw new Error("STATECHART_SCHEMA_INVALID");
  target.installStatechart(
    chart.states.map((state) => state.parent === undefined
      ? { id: stateIds.get(state.id)!, shallowHistory: state.history }
      : { id: stateIds.get(state.id)!, parentId: stateIds.get(state.parent)!, shallowHistory: state.history }),
    transitions,
    initialState,
    {
      guards: [...guardIds.entries()].map(([name, id]) => ({ id, name })),
      actions: [...actionIds.entries()].map(([name, id]) => ({ id, name })),
      bindings: bindings as StatechartActionBinding[]
    }
  );
  return {
    chart: chart.id,
    states: new Map([...stateIds.entries()].map(([name, id]) => [id, name])),
    transitions: new Map(chart.transitions.map(({ id }, index) => [index + 1, id])),
    guards: new Map([...guardIds.entries()].map(([name, id]) => [id, name])),
    actions: new Map([...actionIds.entries()].map(([name, id]) => [id, name]))
  };
}
