import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(toolDirectory, "../..");

const sourcePath = resolve(repositoryRoot, "docs/program-status.json");
const schemaPath = resolve(repositoryRoot, "contracts/program-status.schema.json");
const adrDirectory = resolve(repositoryRoot, "docs/adr");

const phaseStatusLabels = {
  completed: "CONCLUÍDA",
  active: "EM ANDAMENTO",
  partial: "PARCIAL",
  planned: "PLANEJADA"
};
const taskStatusLabels = {
  in_progress: "em andamento",
  planned: "planejado",
  blocked: "bloqueado"
};
const priorityLabels = { high: "alta", medium: "média", low: "baixa" };
const targetStatusLabels = {
  experimental: "experimental",
  not_run: "NOT_RUN",
  not_available: "NOT_AVAILABLE",
  future: "rota futura"
};
const proofStatusLabels = {
  fixture: "fixture antecipada",
  planned: "planejado",
  completed: "concluído"
};

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function linkEvidence(path) {
  return `[${path}](${path})`;
}

function adrLink(id, adrs) {
  const adr = adrs.get(id);
  if (adr === undefined) throw new Error(`PROGRAM_ADR_MISSING:${id}`);
  return `[ADR ${id}](${adr.path})`;
}

export async function readAdrs(root = repositoryRoot) {
  const directory = resolve(root, "docs/adr");
  const files = (await readdir(directory))
    .filter((file) => /^\d{4}-.+\.md$/.test(file))
    .sort();
  const adrs = new Map();

  for (const file of files) {
    const content = await readFile(resolve(directory, file), "utf8");
    const heading = content.match(/^# ADR (\d{4}) — (.+)$/m);
    const status = content.match(/^- Status: (aceito|provisório)$/m);
    const date = content.match(/^- Data: (\d{4}-\d{2}-\d{2})$/m);
    if (heading === null || status === null || date === null) {
      throw new Error(`ADR_METADATA_INVALID:${file}`);
    }
    const id = heading[1];
    if (id === undefined || id !== file.slice(0, 4)) {
      throw new Error(`ADR_ID_FILENAME_MISMATCH:${file}`);
    }
    if (adrs.has(id)) throw new Error(`ADR_ID_DUPLICATE:${id}`);
    adrs.set(id, {
      id,
      title: heading[2],
      status: status[1],
      date: date[1],
      path: `docs/adr/${file}`
    });
  }

  const ordered = [...adrs.keys()];
  for (let index = 0; index < ordered.length; index += 1) {
    const expected = String(index + 1).padStart(4, "0");
    if (ordered[index] !== expected) {
      throw new Error(`ADR_SEQUENCE_GAP:expected=${expected}:actual=${ordered[index] ?? "missing"}`);
    }
  }
  return adrs;
}

export async function readProgram(root = repositoryRoot) {
  const [source, schema] = await Promise.all([
    readFile(resolve(root, relative(repositoryRoot, sourcePath)), "utf8").then(JSON.parse),
    readFile(resolve(root, relative(repositoryRoot, schemaPath)), "utf8").then(JSON.parse)
  ]);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(source)) {
    const details = validate.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
    throw new Error(`PROGRAM_STATUS_INVALID:${details}`);
  }
  return source;
}

export async function readCapabilities(root = repositoryRoot) {
  const directory = resolve(root, "capabilities");
  const entries = await readdir(directory, { withFileTypes: true });
  const capabilities = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = JSON.parse(await readFile(resolve(directory, entry.name, "capability.json"), "utf8"));
    if (capabilities.has(manifest.id)) throw new Error(`PROGRAM_CAPABILITY_DUPLICATE:${manifest.id}`);
    capabilities.set(manifest.id, manifest);
  }
  return capabilities;
}

export async function validateProgram(program, adrs, capabilities, root = repositoryRoot) {
  const phaseIds = program.phases.map(({ id }) => id);
  for (let index = 0; index < phaseIds.length; index += 1) {
    if (phaseIds[index] !== index + 1) {
      throw new Error(`PROGRAM_PHASE_SEQUENCE_INVALID:expected=${index + 1}:actual=${phaseIds[index]}`);
    }
  }
  const phases = new Map(program.phases.map((phase) => [phase.id, phase]));
  const active = program.phases.filter(({ status }) => status === "active");
  if (active.length !== 1 || active[0].id !== program.currentFocus.phase) {
    throw new Error("PROGRAM_CURRENT_FOCUS_INVALID");
  }

  for (const phase of program.phases) {
    if (phase.status === "completed" && phase.remaining.length > 0) {
      throw new Error(`PROGRAM_COMPLETED_PHASE_HAS_REMAINING:${phase.id}`);
    }
    if (phase.status === "planned" && phase.delivered.length > 0) {
      throw new Error(`PROGRAM_PLANNED_PHASE_HAS_DELIVERED:${phase.id}`);
    }
    for (const dependency of phase.dependencies) {
      if (!phases.has(dependency) || dependency >= phase.id) {
        throw new Error(`PROGRAM_PHASE_DEPENDENCY_INVALID:${phase.id}:${dependency}`);
      }
    }
    for (const id of phase.adrs) {
      if (!adrs.has(id)) throw new Error(`PROGRAM_ADR_MISSING:${id}`);
    }
    for (const delivery of phase.delivered) {
      for (const id of delivery.capabilities ?? []) {
        const capability = capabilities.get(id);
        if (capability === undefined) throw new Error(`PROGRAM_CAPABILITY_MISSING:phase=${phase.id}:${id}`);
        if (["planned", "unavailable"].includes(capability.status)) {
          throw new Error(`PROGRAM_DELIVERY_CAPABILITY_NOT_MATERIAL:phase=${phase.id}:${id}:${capability.status}`);
        }
      }
      for (const evidence of delivery.evidence) {
        await access(resolve(root, evidence)).catch(() => {
          throw new Error(`PROGRAM_EVIDENCE_MISSING:phase=${phase.id}:${evidence}`);
        });
      }
    }
  }

  const taskIds = new Set();
  for (const task of program.tasks) {
    if (taskIds.has(task.id)) throw new Error(`PROGRAM_TASK_DUPLICATE:${task.id}`);
    taskIds.add(task.id);
    if (!phases.has(task.phase)) throw new Error(`PROGRAM_TASK_PHASE_MISSING:${task.id}:${task.phase}`);
    if (phases.get(task.phase).status === "completed") {
      throw new Error(`PROGRAM_TASK_IN_COMPLETED_PHASE:${task.id}:${task.phase}`);
    }
    for (const id of task.adrs) {
      if (!adrs.has(id)) throw new Error(`PROGRAM_ADR_MISSING:${id}`);
    }
  }
}

export function renderDecisions(adrs) {
  const lines = [
    "# Decisões",
    "",
    "> Gerado de `docs/adr/*.md` por `tools/program-status/generate.mjs`. Não edite manualmente.",
    "",
    "| ADR | Status | Assunto | Data |",
    "|---|---|---|---|"
  ];
  for (const adr of adrs.values()) {
    lines.push(`| [${adr.id}](${adr.path}) | ${adr.status} | ${escapeTable(adr.title)} | ${adr.date} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderBacklog(program, adrs) {
  const statusOrder = { in_progress: 0, planned: 1, blocked: 2 };
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const tasks = [...program.tasks].sort((left, right) =>
    statusOrder[left.status] - statusOrder[right.status] ||
    priorityOrder[left.priority] - priorityOrder[right.priority] ||
    left.phase - right.phase ||
    left.id.localeCompare(right.id));
  const lines = [
    "# Backlog técnico da Ludivra",
    "",
    "> Gerado de `docs/program-status.json` por `tools/program-status/generate.mjs`. Não edite manualmente.",
    "",
    `Foco atual: **Fase ${program.currentFocus.phase} — ${program.currentFocus.summary}**`,
    "",
    "| ID | Prioridade | Estado | Fase | Trabalho | ADRs |",
    "|---|---|---|---:|---|---|"
  ];
  for (const task of tasks) {
    lines.push(
      `| ${task.id} | ${priorityLabels[task.priority]} | ${taskStatusLabels[task.status]} | ${task.phase} | ` +
      `${escapeTable(task.work)} | ${task.adrs.map((id) => adrLink(id, adrs)).join(", ") || "—"} |`
    );
  }
  lines.push(
    "",
    "Itens concluídos não permanecem no backlog. O estado entregue de cada fase está no [ROADMAP.md](ROADMAP.md), com evidência versionada; o histórico detalhado está no Git e nos manifests de `reports/runs/`.",
    ""
  );
  return lines.join("\n");
}

export function renderRoadmap(program, adrs) {
  const lines = [
    "# Roadmap técnico da Ludivra",
    "",
    "> Gerado de `docs/program-status.json` e dos metadados dos ADRs por `tools/program-status/generate.mjs`. Não edite manualmente.",
    "",
    "| Campo | Valor |",
    "|---|---|",
    `| Release atual | ${program.release} |`,
    `| Foco atual | Fase ${program.currentFocus.phase} — ${escapeTable(program.currentFocus.summary)} |`,
    `| Próxima entrega | ${escapeTable(program.currentFocus.next)} |`,
    `| Fonte editável de progresso | [docs/program-status.json](docs/program-status.json) |`,
    `| Decisão do modelo documental | ${adrLink("0046", adrs)} |`,
    "",
    "## Fontes de verdade",
    "",
    "- `architecture.md`: boundaries, princípios e objetivos do programa;",
    "- `docs/adr/*.md`: decisões duráveis e seus status;",
    "- `capabilities/*/capability.json`: estado e limitações de cada capability;",
    "- `docs/program-status.json`: progresso, backlog, targets e jogos de prova;",
    "- `reports/runs/*/run-manifest.json`: evidência imutável de execução;",
    "- `ROADMAP.md`, `BACKLOG.md`, `DECISIONS.md` e `CAPABILITIES.json`: índices derivados.",
    "",
    "## Visão geral",
    "",
    "| Fase | Fundação técnica | Estado | Principal lacuna |",
    "|---:|---|---|---|"
  ];
  for (const phase of program.phases) {
    lines.push(
      `| ${phase.id} | ${escapeTable(phase.title)} | \`${phaseStatusLabels[phase.status]}\` | ` +
      `${escapeTable(phase.remaining[0] ?? "nenhuma no gate atual")} |`
    );
  }

  lines.push(
    "",
    "## Caminho crítico",
    "",
    "```text",
    "Estado e operabilidade (1–4)",
    "          ↓",
    "Escala, física, persistência e apresentação (5–8)",
    "          ↓",
    "Construção, Forges e autonomia (9–11)",
    "          ↓",
    "Cinco jogos de prova e sessões frias (12)",
    "```",
    ""
  );

  for (const phase of program.phases) {
    lines.push(
      `## Fase ${phase.id} — ${phase.title}`,
      "",
      "| Campo | Valor |",
      "|---|---|",
      `| Estado | \`${phaseStatusLabels[phase.status]}\` |`,
      `| Owners | ${escapeTable(phase.owners.join(", "))} |`,
      `| Dependências | ${phase.dependencies.length === 0 ? "nenhuma" : phase.dependencies.map((id) => `Fase ${id}`).join(", ")} |`,
      `| ADRs | ${phase.adrs.map((id) => adrLink(id, adrs)).join(", ") || "nenhum"} |`,
      "",
      phase.objective,
      ""
    );
    if (phase.delivered.length > 0) {
      lines.push("### Entregue", "");
      for (const delivery of phase.delivered) {
        const capabilities = delivery.capabilities?.length > 0
          ? ` Capabilities: ${delivery.capabilities.map((id) => `\`${id}\``).join(", ")}.`
          : "";
        lines.push(`- ${delivery.summary}${capabilities} Evidência: ${delivery.evidence.map(linkEvidence).join(", ")}.`);
      }
      lines.push("");
    }
    if (phase.remaining.length > 0) {
      lines.push("### Falta", "", ...phase.remaining.map((item) => `- ${item}`), "");
    }
    lines.push("### Gate de saída", "", phase.gate, "");
  }

  lines.push(
    "## Target matrix",
    "",
    "| Target | Estado atual | Situação | Para alegar suporte |",
    "|---|---|---|---|"
  );
  for (const target of program.targets) {
    lines.push(
      `| ${escapeTable(target.label)} | \`${targetStatusLabels[target.status]}\` | ` +
      `${escapeTable(target.current)} | ${escapeTable(target.required)} |`
    );
  }

  lines.push(
    "",
    "## Jogos de prova",
    "",
    "| Jogo | Estado | Comprova |",
    "|---|---|---|"
  );
  for (const game of program.proofGames) {
    lines.push(`| ${escapeTable(game.label)} | ${proofStatusLabels[game.status]} | ${escapeTable(game.proves)} |`);
  }

  lines.push(
    "",
    "## Definition of Done de uma capability",
    "",
    "Uma capability só deixa de ser experimental quando os itens aplicáveis respondem `PASS`:",
    "",
    "```text",
    "Discover → Author → Execute → Observe → Diagnose → Repair → Verify → Continue",
    "```",
    "",
    "`NOT_RUN`, `NOT_AVAILABLE` e `INCONCLUSIVE` nunca equivalem a `PASS`.",
    "",
    "## Regra de atualização",
    "",
    "No mesmo change set que altera progresso:",
    "",
    "1. edite `docs/program-status.json` e o manifest da capability afetada;",
    "2. aponte toda entrega declarada para evidência versionada;",
    "3. execute `pnpm run docs` para regenerar os índices;",
    "4. execute `pnpm run docs:check` ou `game validate` para provar ausência de divergência.",
    "",
    "Detalhes técnicos pertencem aos ADRs e à arquitetura. O roadmap registra ordem, estado, evidência, lacunas e gates; não duplica protocolos ou decisões.",
    ""
  );
  return lines.join("\n");
}

async function writeOrCheck(path, output, check) {
  if (check) {
    const current = await readFile(path, "utf8").catch(() => "");
    if (current !== output) {
      throw new Error(`PROGRAM_DOCUMENT_STALE:${relative(repositoryRoot, path)}:run pnpm run docs`);
    }
    return;
  }
  await writeFile(path, output, "utf8");
}

export async function generate({ check = false, root = repositoryRoot } = {}) {
  const [program, adrs, capabilities] = await Promise.all([
    readProgram(root),
    readAdrs(root),
    readCapabilities(root)
  ]);
  await validateProgram(program, adrs, capabilities, root);
  await Promise.all([
    writeOrCheck(resolve(root, "ROADMAP.md"), renderRoadmap(program, adrs), check),
    writeOrCheck(resolve(root, "BACKLOG.md"), renderBacklog(program, adrs), check),
    writeOrCheck(resolve(root, "DECISIONS.md"), renderDecisions(adrs), check)
  ]);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await generate({ check: process.argv.includes("--check") });
}
