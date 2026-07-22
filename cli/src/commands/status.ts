import { resolveProjectDirectory } from "../project.js";
import { writeProjectState } from "../project-state.js";
import type { CommandOutcome } from "../result.js";

export async function runStatus(arguments_: string[]): Promise<CommandOutcome> {
  const project = await resolveProjectDirectory(arguments_);
  const { state, artifact } = await writeProjectState(project);
  return {
    diagnostics: [],
    artifacts: [artifact],
    data: { project, state },
    nextActions: state.nextActions
  };
}
