import { runRasterCapture } from "../raster-capture.js";
import { runScenarioCommand } from "../scenario-harness.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runCapture(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  if (arguments_.includes("--raster")) return runRasterCapture(context, arguments_);
  return runScenarioCommand(context, arguments_, true);
}
