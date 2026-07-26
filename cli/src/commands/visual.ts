import { runVisualCommand } from "../visual-forge.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runVisual(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runVisualCommand(context, arguments_);
}
