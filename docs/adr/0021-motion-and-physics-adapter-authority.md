# ADR 0021 — Motion sem solver e física por adapters com autoridade declarada

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-26 para fechar a cobertura mínima de física desktop
- Revisão: ao registrar o primeiro benchmark oficial de física; a escolha de solver está no [ADR 0037](0037-physics-solver-selection.md)
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md) e [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md)
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md)
- Complementa: [ADR 0051](0051-animation-graph-and-skeletal-runtime.md) e [ADR 0054](0054-navigation-regions-pathfinding-and-avoidance.md)
- Fase: 6

## Contexto

O que existe hoje de movimento são primitivas visuais não autoritativas no renderer. Não há motion formal, não há contrato de física e não há adapter.

Duas confusões precisam ser impedidas antes de qualquer implementação. A primeira é motion virar regra: um tween que decide quando o dano ocorre transforma apresentação em autoridade e destrói replay. A segunda é física entrar no estado autoritativo sem fronteira: solvers usam ponto flutuante internamente, com ordem de operações dependente de plataforma, e o ADR 0018 proíbe ponto flutuante no caminho autoritativo.

O ADR 0008 já recusou engine física própria e definiu solver como detalhe de adapter. Falta decidir a fronteira, a autoridade e o que pode ser prometido.

## Decisão

### Motion declara seu tempo

Toda operação de motion — `tween`, `spring`, `path`, `ballistic`, `snap`, `follow`, `orbit` — declara se roda em **tempo lógico** ou em **tempo de apresentação**.

- motion em tempo de apresentação nunca entra no hash, no save nem no replay, e não pode ser lido pelo gameplay;
- motion em tempo lógico é aritmética inteira com escala declarada conforme o ADR 0018 e entra no hash como qualquer outro estado;
- motion nunca decide dano, vitória, colisão relevante para regra ou transição de estado. Violação é `MOTION_AUTHORITY_VIOLATION`.

Cancelamento, conclusão e interrupção são inspecionáveis com causa. Motion silenciosamente descartado é defeito.

### Física é adapter, com autoridade por corpo

O contrato de física é semântico: corpos, colliders, contatos, triggers, joints, raycasts e constraints, com formas expressas por intenção — caixa, círculo ou esfera, cápsula, convex hull, mesh estático — conforme o adapter declarar suporte.

Cada corpo declara autoridade:

- `presentation` — o resultado nunca influencia estado autoritativo;
- `gameplay` — o resultado atravessa o boundary de commit, quantizado na escala declarada, e é o valor quantizado que entra no hash;
- `host` — o resultado pertence ao host da sessão em rede e chega aos clientes como snapshot.

Autoridade misturada em um mesmo corpo é `PHYSICS_AUTHORITY_MISMATCH`. Resultado de física que entra no estado sem quantização declarada é defeito, não aproximação.

A quantização no commit é o que torna física com autoridade `gameplay` compatível com o ADR 0018: o solver pode ser flutuante por dentro, mas o que o mundo lógico registra é inteiro e reprodutível.

### Determinismo prometido

Para autoridade `gameplay`, o adapter DEVE ser determinístico em replay no mesmo binário e na mesma plataforma, comprovado por golden vector de contatos e posições quantizadas. Adapter que não atinge isso só pode ser usado com autoridade `presentation` — `PHYSICS_ADAPTER_NOT_REPLAY_DETERMINISTIC`.

Determinismo competitivo entre plataformas continua não prometido, conforme o ADR 0018 e a arquitetura.

### Escolha de solver

Este ADR decide a fronteira, não o produto. Os solvers concretos são decididos pelo [ADR 0037](0037-physics-solver-selection.md): Jolt para 3D e Box2D v3 para 2D, ambos como vendor em adapter de borda.

Até existir um solver adotado, o contrato é exercitado por um adapter de referência mínimo, suficiente para cenários e testes de boundary. Character controllers, ragdolls, grabs e breakables só entram depois dos fundamentos, cada um com consumidor declarado.

### Cobertura mínima do adapter desktop

O adapter de produção expõe, por capability e sem vazar tipos do solver:

- layers e masks, material físico, sleep/wake e continuous collision detection;
- rigid, static, kinematic/character e trigger bodies;
- ray, shape e overlap queries com filtros estáveis;
- joints necessários pelo Physics Forge e pelo physics party brawler;
- character controller com slope, step, floor state e causa de bloqueio;
- ragdoll por corpos e joints derivados do skeleton, com transição explícita entre animação e física;
- interpolação entre ticks e debug snapshot de corpos, colliders, contatos e constraints.

Feature ausente no solver ou target é capability indisponível, não implementação vazia. Soft body, vehicle e destruction permanecem fora até consumidor e benchmark próprios.

Códigos: `MOTION_AUTHORITY_VIOLATION`, `MOTION_LOGICAL_TIME_REQUIRED`, `MOTION_CANCELLED_WITHOUT_CAUSE`, `PHYSICS_AUTHORITY_MISMATCH`, `PHYSICS_COLLIDER_INVALID`, `PHYSICS_DIVERGENCE`, `PHYSICS_ADAPTER_NOT_REPLAY_DETERMINISTIC`.

## Consequências

- motion visual e motion lógico deixam de ser a mesma coisa, e só um deles entra no hash;
- física com autoridade de gameplay passa a ter ponto único de quantização, que é onde a divergência pode ser localizada;
- trocar de solver não muda o contrato nem o formato de save;
- adapter sem determinismo de replay continua utilizável, com autoridade reduzida e declarada;
- a escolha de solver vive no ADR 0037 e pode mudar sem tocar este contrato;
- ragdoll, grab e breakable ficam explicitamente depois dos fundamentos;
- character controller, CCD, queries, layers e joints formam o gate mínimo do adapter desktop;
- o cenário de divergência precisa comparar posições quantizadas, não posições do solver.

## Alternativas rejeitadas

- **Engine física própria:** recusada pelo ADR 0008 e sem justificativa de escopo.
- **Misturar a escolha de solver com o contrato:** trocar de biblioteca passaria a mexer no contrato; a escolha vive no ADR 0037 e não muda save, replay nem autoridade.
- **Deixar o solver escrever direto no estado autoritativo:** injetaria ponto flutuante e ordem de operações de biblioteca externa no hash.
- **Prometer determinismo cross-platform de física:** não é sustentável com solvers flutuantes e criaria alegação falsa de multiplayer competitivo.
- **Motion com autoridade sobre a regra:** faz apresentação decidir gameplay e torna o defeito invisível no estado lógico.
- **Um único modo de tempo para motion:** ou proíbe animação suave, ou coloca animação no hash.
- **Autoridade implícita por tipo de corpo:** produz corpo que às vezes afeta a regra, que é a pior variante de todas.
