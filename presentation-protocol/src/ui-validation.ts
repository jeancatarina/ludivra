import type { RenderedUiSnapshot, UiNode, UiViewModel } from "./generated/ui.js";

export interface UiRenderPolicy {
  minimumTouchTargetPx: number;
  minimumContrastRatio: number;
  breakpoint: string;
}

export type UiValidationCode =
  | "UI_NODE_NOT_RENDERED"
  | "UI_NODE_UNDECLARED"
  | "UI_NODE_CLIPPED"
  | "UI_ACCESSIBILITY_ROLE_MISMATCH"
  | "UI_FOCUS_MISMATCH"
  | "UI_NAVIGATION_UNDECLARED"
  | "UI_TOUCH_TARGET_TOO_SMALL"
  | "UI_CONTRAST_UNMEASURED"
  | "UI_CONTRAST_BELOW_MINIMUM"
  | "UI_BREAKPOINT_MISMATCH";

export interface UiValidationIssue {
  code: UiValidationCode;
  message: string;
  nodeId?: string;
}

function issue(
  issues: UiValidationIssue[],
  code: UiValidationCode,
  message: string,
  nodeId?: string
): void {
  issues.push({ code, message, ...(nodeId === undefined ? {} : { nodeId }) });
}

function expectedRole(node: UiNode): string | null {
  if (node.role === "button" || node.role === "status") return node.role;
  return null;
}

/**
 * Cross-checks semantic intent against a measured renderer result. It has no DOM
 * dependency, so the same policy proves the headless adapter's composition and
 * the BrowserHost's actual pixels without letting either invent the other.
 */
export function validateRenderedUi(
  viewModel: UiViewModel,
  snapshot: RenderedUiSnapshot,
  policy: UiRenderPolicy
): UiValidationIssue[] {
  const issues: UiValidationIssue[] = [];
  if (snapshot.breakpoint !== policy.breakpoint) {
    issue(
      issues,
      "UI_BREAKPOINT_MISMATCH",
      `Snapshot breakpoint ${snapshot.breakpoint} does not match declared ${policy.breakpoint}`
    );
  }
  const expectedById = new Map(viewModel.nodes.map((node) => [node.id, node]));
  const renderedById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  for (const rendered of snapshot.nodes) {
    if (!expectedById.has(rendered.id)) {
      issue(issues, "UI_NODE_UNDECLARED", `Renderer emitted undeclared node ${rendered.id}`, rendered.id);
    }
  }

  const actionIds = new Set(viewModel.nodes.filter(({ role }) => role === "button").map(({ id }) => id));
  for (const node of viewModel.nodes) {
    const rendered = renderedById.get(node.id);
    if (rendered === undefined || !rendered.visible) {
      issue(issues, "UI_NODE_NOT_RENDERED", `Semantic node ${node.id} is not visibly rendered`, node.id);
      continue;
    }
    if (rendered.clipped) {
      issue(issues, "UI_NODE_CLIPPED", `Semantic node ${node.id} is clipped`, node.id);
    }
    const role = expectedRole(node);
    if (role !== null && rendered.accessibleRole !== role) {
      issue(
        issues,
        "UI_ACCESSIBILITY_ROLE_MISMATCH",
        `Node ${node.id} must expose accessibility role ${role}, got ${rendered.accessibleRole}`,
        node.id
      );
    }
    if (node.role === "button") {
      if (node.navigation === undefined || !actionIds.has(node.navigation.previous ?? "") || !actionIds.has(node.navigation.next ?? "")) {
        issue(issues, "UI_NAVIGATION_UNDECLARED", `Action node ${node.id} has incomplete declared navigation`, node.id);
      }
      if (
        rendered.bounds.width < policy.minimumTouchTargetPx ||
        rendered.bounds.height < policy.minimumTouchTargetPx
      ) {
        issue(
          issues,
          "UI_TOUCH_TARGET_TOO_SMALL",
          `Action node ${node.id} is ${rendered.bounds.width}x${rendered.bounds.height}; minimum is ${policy.minimumTouchTargetPx}px`,
          node.id
        );
      }
    }
    if (snapshot.renderer === "browser-dom-v1") {
      if (rendered.contrastRatio === undefined) {
        issue(issues, "UI_CONTRAST_UNMEASURED", `Node ${node.id} has no measured contrast`, node.id);
      } else if (rendered.contrastRatio < policy.minimumContrastRatio) {
        issue(
          issues,
          "UI_CONTRAST_BELOW_MINIMUM",
          `Node ${node.id} contrast ${rendered.contrastRatio} is below ${policy.minimumContrastRatio}`,
          node.id
        );
      }
    }
  }

  for (const rendered of snapshot.nodes) {
    const expectedFocused = viewModel.focus === rendered.id;
    if (rendered.focused !== expectedFocused) {
      issue(issues, "UI_FOCUS_MISMATCH", `Node ${rendered.id} focus does not match the view model`, rendered.id);
    }
  }
  return issues;
}
