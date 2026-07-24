import {
  UI_VIEW_MODEL_PROTOCOL_VERSION,
  type UiNode,
  type UiViewModel
} from "./generated/ui.js";

/**
 * Base locale identifier. Labels declared in the game manifest form this table,
 * so evidence stays reproducible while real translations are still absent.
 */
export const BASE_LOCALE = "base";

export interface UiIntegerStateProjection {
  id: string;
  label: string;
  value: string;
}

export interface UiInputProjection {
  id: string;
  label: string;
  actionId: number;
}

export interface UiProjectionInput {
  screen: string;
  tick: string;
  integers: readonly UiIntegerStateProjection[];
  inputs: readonly UiInputProjection[];
  focus?: string | null;
}

export interface UiLocaleTable {
  locale: string;
  entries: Record<string, string>;
}

const STATUS_NODE_ID = "runtime.status";
const STATUS_LABEL_KEY = "runtime.status";
const placeholderPattern = /\{([a-z][a-z0-9]*)\}/g;

function stateLabelKey(id: string): string {
  return `state.${id}`;
}

function inputLabelKey(id: string): string {
  return `input.${id}`;
}

/**
 * Builds the base locale table from manifest labels. The view model carries only
 * keys and parameters, so this table is what a renderer resolves against.
 */
export function createUiLocaleTable(input: UiProjectionInput): UiLocaleTable {
  const entries: Record<string, string> = { [STATUS_LABEL_KEY]: "Tick {tick}" };
  for (const integer of input.integers) entries[stateLabelKey(integer.id)] = `${integer.label}: {value}`;
  for (const definition of input.inputs) entries[inputLabelKey(definition.id)] = definition.label;
  return { locale: BASE_LOCALE, entries };
}

/**
 * Projects logical state into semantic UI intent. Resolved text, layout and
 * pixels are deliberately absent: they belong to the rendered snapshot.
 */
export function createUiViewModel(input: UiProjectionInput): UiViewModel {
  const nodes: UiNode[] = [
    {
      id: STATUS_NODE_ID,
      role: "status",
      labelKey: STATUS_LABEL_KEY,
      labelParams: { tick: input.tick },
      state: "default",
      enabled: true,
      selected: false,
      actions: []
    }
  ];
  for (const integer of input.integers) {
    nodes.push({
      id: `state.${integer.id}`,
      role: "status",
      labelKey: stateLabelKey(integer.id),
      labelParams: { value: integer.value },
      state: "default",
      enabled: true,
      selected: false,
      actions: []
    });
  }
  for (const definition of input.inputs) {
    nodes.push({
      id: `action.${definition.id}`,
      role: "button",
      labelKey: inputLabelKey(definition.id),
      labelParams: {},
      state: "default",
      enabled: true,
      selected: false,
      actions: ["act"],
      intent: { actionId: definition.actionId, valueMilli: 1000 }
    });
  }
  const focus = input.focus ?? null;
  return { protocolVersion: UI_VIEW_MODEL_PROTOCOL_VERSION, screen: input.screen, focus, nodes };
}

/**
 * Resolves a label key against a locale table. A missing key or parameter throws
 * a stable code so the caller reports a diagnostic; falling back to the raw key
 * would hide missing content.
 */
export function resolveUiLabel(
  table: UiLocaleTable,
  key: string,
  parameters: Record<string, string>
): string {
  const template = table.entries[key];
  if (template === undefined) throw new Error(`UI_LOCALE_KEY_MISSING: ${key}`);
  return template.replaceAll(placeholderPattern, (_match, name: string) => {
    const value = parameters[name];
    if (value === undefined) throw new Error(`UI_LOCALE_PARAM_MISSING: ${key}.${name}`);
    return value;
  });
}
