import { runScenarioCommand } from "../scenario-harness.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runSimulate(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runScenarioCommand(context, arguments_, false);
}
