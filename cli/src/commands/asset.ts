import { runAssetCommand } from "../asset-forge.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runAsset(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runAssetCommand(context, arguments_);
}
