import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";

export const STATECHART_SCHEMA_ID = "https://ludivra.dev/schemas/statechart/v1";
export const STATECHARTS_DOCUMENT_ID = "ludivra.statecharts";
export const STATECHARTS_VERSION = 1;

export interface StatechartSource { id: string; file: string; value: unknown; }
export interface CompiledStatecharts { charts: { graphVersion: number; charts: Statechart[] }; bytes: Uint8Array; sha256: string; }
export interface StatechartState { id: string; parent?: string; entryActions: string[]; exitActions: string[]; history: boolean; }
export interface StatechartTransition { id: string; from: string; to: string; event?: string; afterTicks?: number; priority: number; kind: "external" | "internal"; guard?: string; actions: string[]; }
export interface Statechart { id: string; initial: string; events: string[]; states: StatechartState[]; transitions: StatechartTransition[]; }
type ObjectValue = Record<string, unknown>;
const idPattern = /^[a-z][a-z0-9.-]*$/;

function fail(code: string, message: string): never { throw new Error(`${code}: ${message}`); }
function object(value: unknown, code: string, message: string): ObjectValue { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code, message); return value as ObjectValue; }
function array(value: unknown, code: string, message: string): unknown[] { if (!Array.isArray(value)) fail(code, message); return value; }
function id(value: unknown, code: string, message: string): string { if (typeof value !== "string" || !idPattern.test(value)) fail(code, message); return value; }
function actions(value: unknown, chart: string, known: ReadonlySet<string>): string[] {
  const result = array(value, "STATECHART_SCHEMA_INVALID", `${chart} actions must be an array`).map((item) => id(item, "STATECHART_ACTION_UNREGISTERED", `${chart} action id is invalid`));
  if (new Set(result).size !== result.length || result.some((item) => !known.has(item))) fail("STATECHART_ACTION_UNREGISTERED", `${chart} references an unregistered action`);
  return [...result].sort();
}
function byId<T extends { id: string }>(left: T, right: T): number { return left.id.localeCompare(right.id); }

/** Validates and normalizes the data-only, one-region statechart contract. */
export function compileStatecharts(input: { charts: readonly StatechartSource[]; guards: readonly string[]; actions: readonly string[] }): CompiledStatecharts {
  const knownGuards = new Set(input.guards);
  const knownActions = new Set(input.actions);
  if (knownGuards.size !== input.guards.length || knownActions.size !== input.actions.length) fail("STATECHART_SCHEMA_INVALID", "registered guard/action ids must be unique");
  const charts: Statechart[] = input.charts.map((source) => {
    const value = object(source.value, "STATECHART_SCHEMA_INVALID", `${source.file} root must be an object`);
    if (value.$schema !== STATECHART_SCHEMA_ID || value.schemaVersion !== 1) fail("STATECHART_SCHEMA_INVALID", `${source.file} schema is unsupported`);
    const chartId = id(value.id, "STATECHART_SCHEMA_INVALID", `${source.file} has no valid id`);
    if (chartId !== source.id) fail("STATECHART_SCHEMA_INVALID", `${source.file} id does not match game.jsonc`);
    const events = array(value.events, "STATECHART_SCHEMA_INVALID", `${chartId} events must be an array`).map((item) => id(item, "STATECHART_SCHEMA_INVALID", `${chartId} event id is invalid`));
    if (new Set(events).size !== events.length) fail("STATECHART_SCHEMA_INVALID", `${chartId} repeats an event id`);
    const states = array(value.states, "STATECHART_SCHEMA_INVALID", `${chartId} states must be an array`).map((raw) => {
      const state = object(raw, "STATECHART_SCHEMA_INVALID", `${chartId} state must be an object`);
      const result: StatechartState = { id: id(state.id, "STATECHART_SCHEMA_INVALID", `${chartId} state id is invalid`), entryActions: actions(state.entryActions, chartId, knownActions), exitActions: actions(state.exitActions, chartId, knownActions), history: state.history === true };
      if (state.parent !== undefined) result.parent = id(state.parent, "STATECHART_SCHEMA_INVALID", `${chartId} parent id is invalid`);
      return result;
    });
    const statesById = new Map(states.map((state) => [state.id, state]));
    if (statesById.size !== states.length) fail("STATECHART_SCHEMA_INVALID", `${chartId} repeats a state id`);
    const initial = id(value.initial, "STATECHART_INITIAL_STATE_MISSING", `${chartId} initial state is invalid`);
    if (!statesById.has(initial)) fail("STATECHART_INITIAL_STATE_MISSING", `${chartId} initial state ${initial} is absent`);
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (stateId: string): void => { if (visited.has(stateId)) return; if (visiting.has(stateId)) fail("STATECHART_SCHEMA_INVALID", `${chartId} state hierarchy has a cycle`); visiting.add(stateId); const parent = statesById.get(stateId)?.parent; if (parent !== undefined) { if (!statesById.has(parent)) fail("STATECHART_SCHEMA_INVALID", `${chartId} parent ${parent} is absent`); visit(parent); } visiting.delete(stateId); visited.add(stateId); };
    for (const state of states) visit(state.id);
    const transitions = array(value.transitions, "STATECHART_SCHEMA_INVALID", `${chartId} transitions must be an array`).map((raw) => {
      const transition = object(raw, "STATECHART_SCHEMA_INVALID", `${chartId} transition must be an object`);
      const from = id(transition.from, "STATECHART_SCHEMA_INVALID", `${chartId} transition source is invalid`); const to = id(transition.to, "STATECHART_SCHEMA_INVALID", `${chartId} transition target is invalid`);
      if (!statesById.has(from) || !statesById.has(to)) fail("STATECHART_SCHEMA_INVALID", `${chartId} transition references an absent state`);
      const result: StatechartTransition = { id: id(transition.id, "STATECHART_SCHEMA_INVALID", `${chartId} transition id is invalid`), from, to, priority: Number.isInteger(transition.priority) && (transition.priority as number) >= 0 ? transition.priority as number : fail("STATECHART_SCHEMA_INVALID", `${chartId} transition priority is invalid`), kind: transition.kind === "external" || transition.kind === "internal" ? transition.kind : fail("STATECHART_SCHEMA_INVALID", `${chartId} transition kind is invalid`), actions: actions(transition.actions, chartId, knownActions) };
      if (transition.event !== undefined) { result.event = id(transition.event, "STATECHART_SCHEMA_INVALID", `${chartId} transition event is invalid`); if (!events.includes(result.event)) fail("STATECHART_SCHEMA_INVALID", `${chartId} transition event ${result.event} is not declared`); }
      if (transition.afterTicks !== undefined) { if (!Number.isInteger(transition.afterTicks) || (transition.afterTicks as number) < 1) fail("STATECHART_LOGICAL_TIME_REQUIRED", `${chartId} transition requires positive logical ticks`); result.afterTicks = transition.afterTicks as number; }
      if ((result.event === undefined) === (result.afterTicks === undefined)) fail("STATECHART_LOGICAL_TIME_REQUIRED", `${chartId} transition needs exactly one event or afterTicks trigger`);
      if (transition.guard !== undefined) { result.guard = id(transition.guard, "STATECHART_GUARD_UNREGISTERED", `${chartId} guard id is invalid`); if (!knownGuards.has(result.guard)) fail("STATECHART_GUARD_UNREGISTERED", `${chartId} guard ${result.guard} is not registered`); }
      return result;
    });
    if (new Set(transitions.map((transition) => transition.id)).size !== transitions.length) fail("STATECHART_SCHEMA_INVALID", `${chartId} repeats a transition id`);
    const precedence = new Set<string>();
    for (const transition of transitions) { const key = `${transition.from}\0${transition.event ?? `after:${transition.afterTicks}`}\0${transition.priority}`; if (precedence.has(key)) fail("STATECHART_TRANSITION_AMBIGUOUS", `${chartId} has no precedence for transitions from ${transition.from}`); precedence.add(key); }
    return { id: chartId, initial, events: [...events].sort(), states: states.sort(byId), transitions: transitions.sort(byId) };
  });
  if (new Set(charts.map((chart) => chart.id)).size !== charts.length) fail("STATECHART_SCHEMA_INVALID", "statechart document ids must be unique");
  const value = { graphVersion: STATECHARTS_VERSION, charts: charts.sort(byId) };
  const bytes = new TextEncoder().encode(canonicalJson(value));
  return { charts: value, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
