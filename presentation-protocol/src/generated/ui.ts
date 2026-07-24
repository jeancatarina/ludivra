// Generated from contracts/ui-view-model.schema.json and contracts/rendered-ui-snapshot.schema.json. Do not edit.

export const UI_VIEW_MODEL_PROTOCOL_VERSION = 1 as const;
export const RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION = 1 as const;

export type UiRole = "status" | "label" | "button" | "group";
export type UiPresentationState = "default" | "highlighted" | "critical";
export type UiAction = "act" | "inspect" | "confirm" | "cancel";
export type UiRendererId = "headless-semantic-v1" | "browser-dom-v1";

export interface UiIntent {
  actionId: number;
  valueMilli: number;
}

export interface UiNavigation {
  previous?: string;
  next?: string;
}

export interface UiNode {
  id: string;
  role: UiRole;
  labelKey: string;
  labelParams: Record<string, string>;
  state: UiPresentationState;
  enabled: boolean;
  selected: boolean;
  actions: UiAction[];
  intent?: UiIntent;
  navigation?: UiNavigation;
}

export interface UiViewModel {
  protocolVersion: typeof UI_VIEW_MODEL_PROTOCOL_VERSION;
  screen: string;
  focus: string | null;
  nodes: UiNode[];
}

export interface UiBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedUiNode {
  id: string;
  bounds: UiBounds;
  visible: boolean;
  clipped: boolean;
  focused: boolean;
  text: string;
  accessibleRole: string;
  contrastRatio?: number;
}

export interface RenderedUiSnapshot {
  protocolVersion: typeof RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION;
  renderer: UiRendererId;
  viewport: { width: number; height: number };
  textScale: number;
  locale: string;
  nodes: RenderedUiNode[];
}
