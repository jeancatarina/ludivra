import assert from "node:assert/strict";
import test from "node:test";
import {
  readAdrs,
  readCapabilities,
  readProgram,
  renderBacklog,
  renderDecisions,
  renderRoadmap,
  repositoryRoot,
  validateProgram
} from "./generate.mjs";

test("ADRs are continuous and drive the decision index", async () => {
  const adrs = await readAdrs();
  assert.equal(adrs.size, 55);
  assert.equal(adrs.get("0046").status, "aceito");
  assert.equal(adrs.get("0055").status, "provisório");
  assert.match(renderDecisions(adrs), /\[0046\].+Estado do programa estruturado/);
  assert.match(renderDecisions(adrs), /\[0055\].+Reuso upstream-first/);
});

test("program source validates and renders every public index", async () => {
  const [program, adrs, capabilities] = await Promise.all([readProgram(), readAdrs(), readCapabilities()]);
  await validateProgram(program, adrs, capabilities, repositoryRoot);
  assert.match(renderRoadmap(program, adrs), /\| 10 \| Procedural Forges \| `PARCIAL` \|/);
  assert.match(renderRoadmap(program, adrs), /Capabilities: `authoring\.audio-forge`/);
  const backlog = renderBacklog(program, adrs);
  assert.doesNotMatch(backlog, /OBS-001/);
  assert.doesNotMatch(backlog, /OBS-002/);
  assert.match(renderRoadmap(program, adrs), /\| Foco atual \| Fase 7/);
  assert.match(renderRoadmap(program, adrs), /Capabilities: `spatial\.regional-world`/);
  assert.match(renderRoadmap(program, adrs), /Capabilities: `physics\.upstream-adapters`/);
});

test("completed phases cannot retain work and task IDs cannot collide", async () => {
  const [program, adrs, capabilities] = await Promise.all([readProgram(), readAdrs(), readCapabilities()]);
  const invalidPhase = structuredClone(program);
  invalidPhase.phases[0].remaining.push("stale");
  await assert.rejects(
    validateProgram(invalidPhase, adrs, capabilities, repositoryRoot),
    /PROGRAM_COMPLETED_PHASE_HAS_REMAINING/
  );

  const duplicateTask = structuredClone(program);
  duplicateTask.tasks.push(structuredClone(duplicateTask.tasks[0]));
  await assert.rejects(
    validateProgram(duplicateTask, adrs, capabilities, repositoryRoot),
    /PROGRAM_TASK_DUPLICATE/
  );
});
