import {
  BASE_LOCALE,
  RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION,
  resolveUiLabel,
  type RenderedUiNode,
  type RenderedUiSnapshot,
  type UiIntent,
  type UiLocaleTable,
  type UiNode,
  type UiViewModel
} from "@ludivra/presentation-protocol";

export interface DomUiRendererOptions {
  status: HTMLElement;
  actions: HTMLElement;
  onIntent: (intent: UiIntent) => void;
}

export interface DomUiRenderer {
  render(viewModel: UiViewModel, locale: UiLocaleTable): void;
  snapshot(): RenderedUiSnapshot;
  destroy(): void;
}

interface TrackedNode {
  element: HTMLElement;
  node: UiNode;
}

function channel(value: string): number {
  const component = Number(value) / 255;
  return component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

function parseColor(value: string): { red: string; green: string; blue: string; alpha: number } | null {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/.exec(value);
  if (match === null) return null;
  const [, red, green, blue, alpha] = match;
  if (red === undefined || green === undefined || blue === undefined) return null;
  return { red, green, blue, alpha: alpha === undefined ? 1 : Number(alpha) };
}

function luminance(color: { red: string; green: string; blue: string }): number {
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

/** First ancestor background that actually paints; a transparent stack resolves to the page background. */
function resolvedBackground(element: HTMLElement): { red: string; green: string; blue: string } | null {
  let current: HTMLElement | null = element;
  while (current !== null) {
    const parsed = parseColor(getComputedStyle(current).backgroundColor);
    if (parsed !== null && parsed.alpha > 0) return parsed;
    current = current.parentElement;
  }
  return null;
}

function contrastRatio(element: HTMLElement): number | null {
  const foreground = parseColor(getComputedStyle(element).color);
  const background = resolvedBackground(element);
  if (foreground === null || background === null) return null;
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/** True when the element is cut by the viewport or by a clipping ancestor. */
function isClipped(element: HTMLElement, bounds: DOMRect): boolean {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  if (bounds.left < 0 || bounds.top < 0 || bounds.right > viewportWidth || bounds.bottom > viewportHeight) {
    return true;
  }
  let current = element.parentElement;
  while (current !== null) {
    const style = getComputedStyle(current);
    if (style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible") {
      const container = current.getBoundingClientRect();
      if (
        bounds.left < container.left ||
        bounds.top < container.top ||
        bounds.right > container.right ||
        bounds.bottom > container.bottom
      ) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function isVisible(element: HTMLElement, bounds: DOMRect): boolean {
  const style = getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0 &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function accessibleRole(element: HTMLElement): string {
  const declared = element.getAttribute("role");
  if (declared !== null && declared.length > 0) return declared;
  return element.tagName.toLowerCase();
}

/**
 * Renders a `UiViewModel` into accessible DOM and measures the result back as a
 * `RenderedUiSnapshot`. It never decides node existence, permitted actions or
 * source text: those belong to the projector that produced the view model.
 */
export function createDomUiRenderer(options: DomUiRendererOptions): DomUiRenderer {
  const tracked = new Map<string, TrackedNode>();
  let currentViewModel: UiViewModel | null = null;

  function create(node: UiNode): HTMLElement {
    if (node.role === "button") {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.uiNode = node.id;
      button.addEventListener("click", () => {
        const intent = tracked.get(node.id)?.node.intent;
        if (intent !== undefined) options.onIntent(intent);
      });
      options.actions.append(button);
      return button;
    }
    if (node.role === "status" || node.role === "label") {
      const item = document.createElement("li");
      item.dataset.uiNode = node.id;
      if (node.role === "status") item.setAttribute("role", "status");
      options.status.append(item);
      return item;
    }
    throw new Error(`UI_ROLE_NOT_RENDERABLE: ${node.role}`);
  }

  return {
    render(viewModel, locale) {
      const present = new Set<string>();
      for (const node of viewModel.nodes) {
        present.add(node.id);
        const existing = tracked.get(node.id);
        const element = existing?.element ?? create(node);
        const text = resolveUiLabel(locale, node.labelKey, node.labelParams);
        if (element.textContent !== text) element.textContent = text;
        if (element instanceof HTMLButtonElement) element.disabled = !node.enabled;
        element.setAttribute("aria-disabled", node.enabled ? "false" : "true");
        element.dataset.uiState = node.state;
        if (node.selected) element.setAttribute("aria-selected", "true");
        else element.removeAttribute("aria-selected");
        tracked.set(node.id, { element, node });
      }
      for (const [id, entry] of tracked) {
        if (!present.has(id)) {
          entry.element.remove();
          tracked.delete(id);
        }
      }
      currentViewModel = viewModel;
    },
    snapshot() {
      const viewModel = currentViewModel;
      if (viewModel === null) throw new Error("UI_SNAPSHOT_BEFORE_RENDER");
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const nodes: RenderedUiNode[] = [];
      for (const node of viewModel.nodes) {
        const entry = tracked.get(node.id);
        if (entry === undefined) continue;
        const bounds = entry.element.getBoundingClientRect();
        const contrast = contrastRatio(entry.element);
        const measured: RenderedUiNode = {
          id: node.id,
          bounds: {
            x: Number(bounds.x.toFixed(2)),
            y: Number(bounds.y.toFixed(2)),
            width: Number(bounds.width.toFixed(2)),
            height: Number(bounds.height.toFixed(2))
          },
          visible: isVisible(entry.element, bounds),
          clipped: isClipped(entry.element, bounds),
          focused: document.activeElement === entry.element,
          text: (entry.element.textContent ?? "").trim(),
          accessibleRole: accessibleRole(entry.element)
        };
        nodes.push(contrast === null ? measured : { ...measured, contrastRatio: contrast });
      }
      return {
        protocolVersion: RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION,
        renderer: "browser-dom-v1",
        viewport: {
          width: Math.round(document.documentElement.clientWidth),
          height: Math.round(document.documentElement.clientHeight)
        },
        textScale: Number((rootFontSize / 16).toFixed(3)),
        locale: BASE_LOCALE,
        nodes
      };
    },
    destroy() {
      for (const entry of tracked.values()) entry.element.remove();
      tracked.clear();
      currentViewModel = null;
    }
  };
}
