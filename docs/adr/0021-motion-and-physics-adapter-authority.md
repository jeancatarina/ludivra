# ADR 0021 — Motion sem solver e física por adapters com autoridade declarada

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de adotar qualquer solver físico concreto
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md) e [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md)
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md)
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

Este ADR decide a fronteira, não o produto. Adotar um solver 2D ou 3D concreto exige ADR próprio, porque é dependência de runtime: licença, targets, build WebAssembly, memória, estabilidade, observabilidade e resultado de benchmark precisam ser registrados.

Até existir um solver adotado, o contrato é exercitado por um adapter de referência mínimo, suficiente para cenários e testes de boundary. Character controllers, ragdolls, grabs e breakables só entram depois dos fundamentos, cada um com consumidor declarado.

Códigos: `MOTION_AUTHORITY_VIOLATION`, `MOTION_LOGICAL_TIME_REQUIRED`, `MOTION_CANCELLED_WITHOUT_CAUSE`, `PHYSICS_AUTHORITY_MISMATCH`, `PHYSICS_COLLIDER_INVALID`, `PHYSICS_DIVERGENCE`, `PHYSICS_ADAPTER_NOT_REPLAY_DETERMINISTIC`.

## Consequências

- motion visual e motion lógico deixam de ser a mesma coisa, e só um deles entra no hash;
- física com autoridade de gameplay passa a ter ponto único de quantização, que é onde a divergência pode ser localizada;
- trocar de solver não muda o contrato nem o formato de save;
- adapter sem determinismo de replay continua utilizável, com autoridade reduzida e declarada;
- cada solver concreto passa a exigir ADR com licença e benchmark;
- ragdoll, grab e breakable ficam explicitamente depois dos fundamentos;
- o cenário de divergência precisa comparar posições quantizadas, não posições do solver.

## Alternativas rejeitadas

- **Engine física própria:** recusada pelo ADR 0008 e sem justificativa de escopo.
- **Escolher o solver neste ADR:** dependência de runtime sem benchmark, build WASM verificado nem avaliação de licença.
- **Deixar o solver escrever direto no estado autoritativo:** injetaria ponto flutuante e ordem de operações de biblioteca externa no hash.
- **Prometer determinismo cross-platform de física:** não é sustentável com solvers flutuantes e criaria alegação falsa de multiplayer competitivo.
- **Motion com autoridade sobre a regra:** faz apresentação decidir gameplay e torna o defeito invisível no estado lógico.
- **Um único modo de tempo para motion:** ou proíbe animação suave, ou coloca animação no hash.
- **Autoridade implícita por tipo de corpo:** produz corpo que às vezes afeta a regra, que é a pior variante de todas.
