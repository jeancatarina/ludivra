import { runContentCommand } from "../content-forge.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runContent(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runContentCommand(context, arguments_);
}
