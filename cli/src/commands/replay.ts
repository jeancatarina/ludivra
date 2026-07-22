import { runReplayCommand } from "../scenario-harness.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runReplay(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runReplayCommand(context, arguments_);
}
