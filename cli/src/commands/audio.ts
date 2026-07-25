import { runAudioCommand } from "../audio-forge.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export function runAudio(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  return runAudioCommand(context, arguments_);
}
