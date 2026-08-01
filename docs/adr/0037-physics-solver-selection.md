# ADR 0037 — Escolha dos solvers físicos 2D e 3D

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-08-01 para registrar o adapter de referência que antecede os vendors
- Revisão: ao registrar o primeiro benchmark oficial de física, ou se um target suportado deixar de compilar o solver
- Fecha a pendência de: [ADR 0021](0021-motion-and-physics-adapter-authority.md)
- Complementa: [ADR 0055](0055-upstream-first-and-external-source-incorporation.md)
- Fase: 6

## Contexto

O ADR 0021 decidiu a fronteira: contratos semânticos, autoridade por corpo, quantização no commit e nenhuma engine física própria. Ele deixou a escolha do solver concreto para um ADR próprio, porque é dependência de runtime.

Essa pendência bloqueia a Fase 6 inteira: sem solver escolhido não há adapter real, e sem adapter real o Physics Forge não tem onde validar estabilidade.

Os critérios que podem ser decididos sem benchmark são objetivos: licença compatível com MIT, linguagem que a toolchain já compila, build para os targets declarados incluindo WebAssembly, determinismo em replay no mesmo binário, e observabilidade suficiente para snapshot de corpos e contatos. Desempenho relativo é o que exige medição, e é justamente o que a revisão deste ADR cobre.

## Decisão

### 3D: Jolt Physics

Jolt é licenciado sob MIT, escrito em C++ moderno, compila com CMake — o sistema de build do ADR 0001 — e para WebAssembly via Emscripten, que já está fixado na toolchain. Ele expõe corpos, formas, contatos, joints, character controller e ragdoll, e documenta simulação determinística no mesmo binário, que é exatamente o nível prometido pelo ADR 0021.

### 2D: Box2D v3

Box2D v3 é MIT, escrito em C, compila com CMake e Emscripten, e cobre corpos, formas, contatos, joints e sensores para jogos 2D sem arrastar um motor 3D para um problema plano.

### Como as duas entram

Ambos entram diretamente de seus repositórios upstream como **vendor em adapter de borda**, com versão e hash fixados em `toolchain.lock` e no grafo CMake no momento da adoção, e nunca são importados por kernel, gameplay, Lua ou renderer. O contrato consumido é o do ADR 0021, inclusive layers e masks, materiais, sleep, CCD, queries, joints, triggers, character controller, ragdoll, interpolação e debug; trocar de solver não muda contrato, save nem replay.

Godot e godot-jolt podem informar cenários, diferenças de configuração e casos extremos. Seu `PhysicsServer`, adapter Jolt e código de integração não serão copiados: eles implementam contratos e compatibilidade da Godot, não a authority da Ludivra. O adapter Ludivra é escrito contra as APIs públicas upstream de Jolt e Box2D.

Autoridade `gameplay` só é liberada para um solver após golden vector de contatos e posições quantizadas, conforme o ADR 0021, e após os cenários de estabilidade do ADR 0036. Até lá, o adapter só serve autoridade `presentation`.

O adapter de referência mínimo do ADR 0021 continua existindo: ele é o que roda em CI quando o solver não estiver disponível para um target, e é o que impede que o contrato dependa de um vendor para ser testado.

`ReferencePhysics` agora cobre o boundary por boxes quantizados, layers/masks, authorities, triggers, contatos e golden vector. A implementação é deliberadamente pequena e não deve crescer para substituir os vendors: Jolt e Box2D seguem necessários para os recursos de produção declarados pelo ADR 0021.

### Integração inicial auditável

Jolt `5.3.0` (`0373ec0dd762e4bc2f6acdb08371ee84fa23c6db`) e Box2D `3.1.1` (`8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3`) são baixados de seus repositórios canônicos pelo CMake, com commits imutáveis registrados em `toolchain.lock`. `cmake/UpstreamPhysics.cmake` constrói ambos apenas no target nativo por padrão; no WebAssembly eles ficam declaradamente `target_disabled` e o `ReferencePhysics` continua sendo a implementação disponível.

`UpstreamPhysicsAdapter` mantém os tipos dos vendors em PIMPL, executa um step fixo de 60 Hz e converte os resultados para milímetros inteiros na borda. A autoridade `gameplay` foi promovida no target nativo: `tests/kernel/kernel_test.cpp` fixa um vetor que inclui posição, velocidade e contato (`Jolt d183a22840a5e7b5`, `Box2D a620d29606b34f10`) e também recarrega o log binário de spawns, velocidades e ticks antes de exigir o mesmo hash no step seguinte. Autoridade `host` continua recusada até a Fase 7.

`pnpm bench:physics` exercita 128 corpos por 600 steps em cada adapter e imprime uma linha JSON por solver. A medida é comparativa na mesma máquina, não um limite de CI: ela registra a primeira baseline sem confundir variação de hardware com regressão funcional.

### O que continua recusado

Determinismo competitivo entre plataformas continua não prometido. Engine física própria continua recusada pelo ADR 0008. Um terceiro solver exige revisão deste ADR, não adição silenciosa.

Códigos: `PHYSICS_SOLVER_UNAVAILABLE`, `PHYSICS_SOLVER_VERSION_UNSUPPORTED`, `PHYSICS_SOLVER_TARGET_UNSUPPORTED`, `PHYSICS_ADAPTER_NOT_REPLAY_DETERMINISTIC`.

## Consequências

- a Fase 6 deixa de estar bloqueada por decisão pendente;
- as duas bibliotecas compartilham a toolchain existente, sem introduzir Rust, .NET ou um segundo sistema de build;
- licença MIT em ambos mantém a licença do projeto simples e o `THIRD_PARTY_NOTICES.md` verificável;
- o adapter de referência permanece obrigatório, então CI não depende de vendor por target;
- benchmark oficial passa a ser condição para promover autoridade `gameplay`, não para escolher a biblioteca;
- se um target não compilar o solver, isso é `NOT_AVAILABLE` declarado, não fallback silencioso.

## Alternativas rejeitadas

- **Rapier:** exigiria adicionar a toolchain Rust ao repositório para um único adapter, ampliando bootstrap e superfície de build.
- **PhysX:** licença e tamanho desproporcionais ao escopo, e integração pesada para jogos indie estilizados.
- **Bullet:** determinismo e manutenção menos previsíveis que as alternativas escolhidas para o mesmo escopo.
- **Um único solver 3D também para 2D:** paga custo de solver tridimensional em jogos planos.
- **Implementar solver próprio:** recusado pelo ADR 0008 e fora do escopo do programa.
- **Copiar Godot Physics ou o adapter godot-jolt:** importa abstrações da Godot e cria um fork indireto em vez de integrar o upstream escolhido.
- **Escolher só na hora de implementar:** manteria a Fase 6 com dependência pendente e adiaria decisão de licença.
