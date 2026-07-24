# ADR 0023 — Persistência mundial e region storage

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de habilitar persistência mundial em qualquer jogo de prova
- Depende de: [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md)
- Complementa: [ADR 0009](0009-canonical-state-and-run-evidence.md)
- Fase: 7

## Contexto

O save lógico já existe e é pequeno e verificável: envelope com magic `LDSV`, versão de arquivo, tick, hash de estado e pares ordenados de chave e inteiro, protegidos por checksum FNV. Replays usam `LDRP` no mesmo estilo.

Esse formato não serve para mundo. Ele é um blob único reescrito por inteiro, sem regiões, sem journal e sem compactação. Um mundo com milhares de chunks reescrito a cada autosave é perda de dados esperando um crash no momento errado.

O ADR 0019 já estabeleceu que o mundo base é função pura da identidade do chunk. Isso é o que permite não duplicar terreno no save.

## Decisão

### Dois armazenamentos separados

O archive lógico permanece como está e **não** recebe dados de mundo. Persistência mundial é um armazenamento próprio, com versão de formato própria, referenciado pelo envelope do save por id de região e hash.

Alterar o archive lógico para acomodar mundo exigiria bump de versão e migração de todos os saves existentes para resolver um problema que não é dele.

### O que é salvo

Salvos: seed, `generatorId`, `generatorVersion`, deltas por chunk, entidades persistentes, resumos regionais, Construction Graphs e edições de terreno.

Não salvos: mundo base gerado, mesh, collider derivado, instância visual, partícula e qualquer cache regenerável. Duplicar o mundo base é proibido — ele é regenerado a partir da identidade.

### Escrita e recuperação

Escrita é atômica por região: arquivo temporário, sincronização, renomeação. Operação que abrange mais de uma região usa journal com intenção registrada antes da aplicação.

Após crash, a abertura reproduz o journal completo e descarta entradas incompletas, **reportando o que foi descartado**. Recuperação silenciosa é proibida: o que se perdeu é dado observável.

Cada registro carrega checksum. Divergência é `WORLD_SAVE_CHECKSUM_MISMATCH` e nunca é lida como conteúdo válido.

### Compactação e inspeção

Compactação é operação explícita, nunca efeito colateral de abrir o mundo. A CLI expõe inspeção, compactação e migração com implementação real; comando sem capability existente não é criado como stub, conforme a regra da Fase 2.

Crescimento do save é medido por cenário — viagem longa, construção intensa, edição de terreno — com budget declarado. Exceder é `WORLD_SAVE_GROWTH_BUDGET_EXCEEDED`.

Região referenciada e ausente é `WORLD_REGION_ORPHANED`; região presente e não referenciada é reportada pela inspeção, não apagada automaticamente.

### Versão e compatibilidade

O armazenamento mundial declara sua versão. Versão não suportada é `WORLD_SAVE_VERSION_UNSUPPORTED`, com migração explícita coberta por fixture de entrada e saída. `generatorVersion` incompatível exige decisão declarada entre migrar deltas ou regenerar a base, nunca reinterpretar.

Códigos: `WORLD_SAVE_JOURNAL_INCOMPLETE`, `WORLD_SAVE_CHECKSUM_MISMATCH`, `WORLD_SAVE_VERSION_UNSUPPORTED`, `WORLD_SAVE_GROWTH_BUDGET_EXCEEDED`, `WORLD_REGION_ORPHANED`, `WORLD_SAVE_WRITE_NOT_ATOMIC`.

## Consequências

- o save lógico atual continua válido e não precisa de migração para o mundo existir;
- mundo salvo cresce com a intervenção do jogador, não com a área visitada;
- crash deixa de poder corromper o mundo inteiro, no máximo perde a última transação, que é reportada;
- compactação e migração tornam-se operações auditáveis por run manifest;
- `generatorVersion` obriga decisão explícita quando o gerador evoluir;
- inspeção de região torna-se dependência do diagnóstico de mundo;
- benchmark de crescimento de save entra nos gates de performance.

## Alternativas rejeitadas

- **Colocar o mundo no archive lógico:** obrigaria migrar todo save existente e transformaria autosave em reescrita total.
- **Salvar o mundo base gerado:** desperdiça espaço proporcional à área visitada para armazenar o que a seed já determina.
- **Adotar um banco embutido agora:** dependência de runtime sem medição, e ainda exigiria as mesmas semânticas de journal e atomicidade para os blobs de região.
- **Escrita in-place sem journal:** um crash no meio da escrita corrompe a região, e não há como distinguir corrupção de conteúdo válido.
- **Recuperação silenciosa:** o jogador perde construção sem saber, e o diagnóstico perde a única pista.
- **Compactar ao abrir:** transforma abertura em operação longa e arriscada, no pior momento possível.
- **Apagar região não referenciada automaticamente:** perda de dados por inferência, sem confirmação.
