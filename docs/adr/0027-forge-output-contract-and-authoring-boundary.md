# ADR 0027 — Contrato de saída dos Forges e fronteira de authoring

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de aceitar o primeiro Forge que dependa de serviço externo
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md) e [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)
- Fase: 10

## Contexto

Cinco famílias de Forge são obrigatórias pelo ADR 0008: Visual, World, Construction, Physics e Audio. O roadmap já registra que receitas locais isoladas não formam Forges.

O risco de uma família de ferramentas de geração é conhecido e específico: produzir arquivo opaco. Um asset sem receita, sem seed, sem parâmetros e sem proveniência não pode ser regenerado, revisado, corrigido nem licenciado com segurança — ele só pode ser aceito por fé. Uma vez que dezenas desses arquivos existam no repositório, a propriedade se perde de forma irreversível.

A decisão comum precisa vir antes das cinco implementações, para que as cinco não inventem cinco formatos de manifest.

## Decisão

### Contrato comum de saída

Todo Forge recebe spec textual e produz, no mínimo:

- receita e seed quando houver geração aleatória;
- arquivos em formatos convencionais;
- manifest com hashes, toolchain, versões e parâmetros efetivos;
- origem e licença de cada insumo;
- preview inspecionável;
- métricas, diagnósticos e validation report;
- instrução de regeneração quando a regeneração for possível.

Artefato sem manifest não entra no repositório. Regeneração impossível é declarada como limitação explícita no manifest, nunca omitida.

### Determinismo e regeneração

Mesma spec, mesma seed, mesma toolchain e mesma versão produzem o mesmo artefato. Divergência é defeito do Forge.

Quando um insumo não permitir regeneração — arte importada, gravação externa — o manifest declara isso, e o artefato é tratado como insumo licenciado, não como saída de Forge.

### Authoring, não runtime

Forges rodam em authoring ou build time. Nenhum Forge é dependência de execução do jogo, e nenhum jogo publicado exige um Forge instalado para rodar.

Serviço externo pode ser adapter de authoring, sempre opcional, com chave de acesso fora do repositório e com caminho local equivalente declarado. Um Forge que só funcione com serviço remoto é aceitável apenas como adapter opcional, nunca como única implementação de uma família obrigatória — e é este ponto que motiva a revisão deste ADR.

### Validação por família

Cada família declara o que valida, e validação é dado, não opinião:

| Forge | Valida, no mínimo |
|---|---|
| Visual | escala, pivô, contagem de triângulos, UV, LOD, collider derivado |
| World | seams, continuidade de rio, estrutura flutuante, recurso inacessível, densidade, budget |
| Construction | fechamento de parede, telhado resolvido, escada praticável, união de estilos |
| Physics | massa, centro de massa, estabilidade em cenário, limite de joint |
| Audio | duração, BPM, tonalidade estimada, LUFS, pico, clipping, continuidade de loop |

Relatório de validação com falha bloqueia a promoção do artefato para fixture ou jogo.

### Licença e proveniência

Insumo sem licença declarada é rejeitado. Modelo generativo usado em authoring é registrado com nome, versão e termos, porque isso afeta a licença do artefato produzido — decisão de licenciamento e publicação continua sendo do usuário, conforme os guardrails.

Códigos: `FORGE_MANIFEST_MISSING`, `FORGE_ARTIFACT_OPAQUE`, `FORGE_NONDETERMINISTIC`, `FORGE_LICENSE_UNDECLARED`, `FORGE_VALIDATION_FAILED`, `FORGE_EXTERNAL_SERVICE_REQUIRED`, `FORGE_REGENERATION_UNAVAILABLE`.

## Consequências

- as cinco famílias compartilham um manifest e um relatório, em vez de cinco convenções;
- qualquer artefato gerado pode ser auditado, regenerado ou explicitamente marcado como não regenerável;
- o jogo publicado nunca depende de ferramenta de geração instalada;
- serviço externo permanece possível e opcional, com equivalente local declarado;
- validação por família torna-se pré-requisito de promoção a fixture;
- licença de insumo e de modelo generativo entra no manifest, o que torna o release auditável;
- Forge que não consiga regenerar precisa admitir isso em dado.

## Alternativas rejeitadas

- **Aceitar arquivo opaco:** impede revisão, correção e auditoria de licença, e é irreversível quando o volume cresce.
- **Um manifest por família:** cinco formatos para o mesmo problema, com cinco validadores divergentes.
- **Forge como dependência de runtime:** transformaria ferramenta de authoring em requisito de execução do jogo.
- **Exigir serviço externo em uma família obrigatória:** cria dependência comercial em um compromisso do ADR 0008.
- **Validação por inspeção humana apenas:** não é reproduzível nem verificável em CI.
- **Omitir a impossibilidade de regeneração:** transforma limitação conhecida em surpresa futura.
- **Registrar licença apenas no release:** insumo entra no repositório antes disso e o rastro é perdido.
