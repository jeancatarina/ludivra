# ADR 0027 — Forges AI-first: receita textual como fonte de verdade

- Status: provisório
- Data: 2026-07-24
- Revisão: ao concluir o primeiro Forge de cada família, ou antes de tornar um serviço externo obrigatório no build
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md) e [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)
- Especializado por: [ADR 0032](0032-audio-forge-recipes-and-deterministic-renderer.md), [ADR 0033](0033-visual-forge-procedural-characters-and-generated-surfaces.md), [ADR 0034](0034-world-forge-textual-world-recipes.md), [ADR 0035](0035-construction-forge-style-grammars.md) e [ADR 0036](0036-physics-forge-collider-and-stability-recipes.md)
- Fase: 10

## Contexto

Cinco famílias de Forge são obrigatórias pelo ADR 0008: Visual, World, Construction, Physics e Audio. O roadmap já registra que receitas locais isoladas não formam Forges.

Uma ferramenta de geração pode ser construída de duas formas, e a escolha decide se a engine continua operável por uma IA. Na primeira, a ferramenta é uma interface onde alguém aperta botões e o resultado é um arquivo. Na segunda, a ferramenta é um compilador determinístico cuja entrada é um documento textual versionado. Só a segunda é utilizável por um agente que trabalha por arquivos e comandos, e só a segunda produz diff revisável.

O risco concreto da primeira forma é o artefato opaco: um asset sem receita, sem seed, sem parâmetros e sem proveniência não pode ser regenerado, corrigido, auditado nem licenciado com segurança. Ele só pode ser aceito por fé. Quando dezenas desses arquivos existem no repositório, a propriedade se perde de forma irreversível.

## Decisão

### A receita textual é a fonte de verdade

Todo Forge é um **compilador**: recebe um documento textual versionado, valida-o por schema e produz artefatos derivados. A receita é a fonte editável. Cada ADR de família define se existem insumos técnicos adicionais. O Visual Forge v2 é estritamente local e não aceita conteúdo visual binário como entrada; imagem, modelo, material e animação são artefatos gerados.

```text
intenção em linguagem natural
        ↓
agente escreve ou edita a receita JSONC
        ↓
game <familia> render
        ↓
compilador determinístico
        ↓
artefato canônico + manifest + preview + análise
        ↓
agente inspeciona a evidência e ajusta a receita
```

O agente não edita manualmente amostras, vértices, pixels ou bytes de asset. Ele escreve parâmetros semânticos e o gerador de authoring produz os artefatos.

Editar o artefato derivado é proibido. Reconstruir a receita a partir do artefato é proibido.

Um binário sem receita continua proibido. Quando uma família autorizar insumo técnico adicional, seu ADR deve separar esse insumo do artefato derivado e definir auditoria. Essa autorização não se aplica ao Visual Forge v2.

### Contrato comum de saída

Todo Forge produz, no mínimo:

- a receita e a seed usadas;
- arquivos em formatos convencionais;
- manifest com hashes, toolchain, versão do gerador e parâmetros efetivos;
- identificação e hash de cada insumo permitido pelo ADR da família;
- preview inspecionável por um agente — imagem, waveform, turntable ou relatório, conforme a família;
- métricas, diagnósticos e validation report;
- instrução de regeneração.

Artefato sem manifest não entra no repositório. Regeneração impossível é declarada como limitação explícita no manifest, nunca omitida.

### Determinismo do compilador e identidade da fonte

Mesma receita, mesmos hashes de insumos técnicos autorizados, mesma versão do compilador e mesmo perfil de render produzem bytes idênticos. Divergência na compilação local é defeito do Forge, verificada por fixture. A identidade do Visual Forge v2 é `hash(receita) + hash(Style Bible) + versão do compilador`.

### Evidência que um agente consegue ler

Preview e relatório existem para que a próxima iteração seja informada. Cada família declara o que valida, e a validação é dado, não opinião:

| Forge | Valida, no mínimo |
|---|---|
| Visual | escala, pivô, contagem de triângulos, pesos de skin, silhueta, LOD, collider derivado |
| World | seams, continuidade de rio, estrutura flutuante, recurso inacessível, densidade, budget |
| Construction | fechamento de parede, telhado resolvido, escada praticável, união de estilos |
| Physics | massa, centro de massa, estabilidade em cenário, limite de joint |
| Audio | duração, BPM, tonalidade estimada, LUFS, pico, clipping, continuidade de loop |

Relatório de validação com falha bloqueia a promoção do artefato para fixture ou jogo.

### Authoring, nunca runtime

Forges rodam em authoring ou build time. Nenhum Forge é dependência de execução do jogo, e nenhum jogo publicado exige um Forge instalado para rodar.

Serviço externo não pode ser requisito de uma família obrigatória. O Visual Forge v2 não possui adapter remoto.

### Uma família, um ADR

Cada família declara seu schema de receita, seus nós ou geradores, sua validação e seu cache em ADR próprio. Este ADR governa apenas o que é comum. Um Forge sem ADR de família não existe.

Códigos: `FORGE_MANIFEST_MISSING`, `FORGE_ARTIFACT_OPAQUE`, `FORGE_RECIPE_INVALID`, `FORGE_NONDETERMINISTIC`, `FORGE_LICENSE_UNDECLARED`, `FORGE_VALIDATION_FAILED`, `FORGE_EXTERNAL_SERVICE_REQUIRED`, `FORGE_REGENERATION_UNAVAILABLE`, `FORGE_DERIVED_ARTIFACT_EDITED`.

## Consequências

- geração passa a ser dirigível por prompt sem edição manual de bytes pelo agente;
- todo artefato tem receita revisável e uma cadeia de geração explícita;
- as cinco famílias compartilham manifest, cache e relatório em vez de cinco convenções;
- o jogo publicado nunca depende de ferramenta de geração instalada;
- serviço externo permanece proibido como requisito e pode ser vedado inteiramente pelo ADR da família;
- o repositório prioriza receitas pequenas e artefatos regeneráveis;
- cada família precisa do seu ADR antes de existir código.

## Alternativas rejeitadas

- **Ferramenta interativa como caminho principal:** exclui o agente, não produz diff e transforma o asset em artefato opaco.
- **Aceitar arquivo opaco:** impede revisão, correção e auditoria de licença, e é irreversível quando o volume cresce.
- **Tratar uma saída remota como determinística por seed:** cria uma promessa falsa e não satisfaz uma família local obrigatória.
- **Usar fonte raster ou 3D autorada no Visual Forge v2:** transfere a criação para fora do Forge e viola o ADR 0033.
- **Um manifest por família:** cinco formatos para o mesmo problema, com cinco validadores divergentes.
- **Forge como dependência de runtime:** transformaria ferramenta de authoring em requisito de execução do jogo.
- **Exigir serviço externo em uma família obrigatória:** cria dependência comercial em um compromisso do ADR 0008.
- **Versionar o artefato e descartar a receita:** perderia a capacidade de regenerar, variar e corrigir.
