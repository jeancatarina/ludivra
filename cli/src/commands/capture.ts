import { runScenarioCommand } from "../scenario-harness.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runCapture(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runScenarioCommand(context, arguments_, true);
}
