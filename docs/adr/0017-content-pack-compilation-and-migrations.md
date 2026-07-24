# ADR 0017 — Content pack compilado, mapa de símbolos e migrations

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de codificar qualquer seção em binário ou de aceitar um segundo formato autoritativo de conteúdo
- Complementa: [ADR 0011](0011-card-roguelite-content-and-authority.md) e [ADR 0016](0016-public-lua-sdk-layers-and-escape-hatches.md)
- Fecha em parte: item "formato binário de content pack" da seção 36 de [architecture.md](../../architecture.md)
- Fase: 4

## Contexto

O ADR 0011 tornou o JSONC a autoridade textual do conteúdo e criou uma ponte experimental: `createGameplayManifestDocument` deriva o binding `ludivra.game` e `composeGameplaySource` serializa binding e conteúdo, com chaves ordenadas, em uma tabela `CONTENT` anexada ao mesmo chunk Lua do gameplay. A `architecture.md` autoriza essa ponte explicitamente como implementação experimental text-first e afirma que ela não substitui o pipeline de content pack.

A ponte tem dois limites conhecidos. Ela mistura dado e código no mesmo chunk, o que impede rastrear um valor em execução até a linha que o autorou. E ela não possui versão de formato, portanto não há como migrar conteúdo antigo nem recusar conteúdo futuro sem comparar texto.

A seção 36 pede um formato binário. Não existe benchmark que demonstre que o custo de parse do conteúdo importa: o volume atual é de poucos documentos pequenos, e as regras de engenharia proíbem otimizar sem medição. O que já é comprovadamente necessário é versão, determinismo de bytes, mapa de símbolos e origem para diagnóstico.

## Decisão

### O pack é derivado, nunca autorado

O content pack é artefato de build produzido a partir dos documentos JSONC validados. O JSONC permanece a única fonte editável. Editar um pack, versioná-lo como fonte ou reconstruir os documentos a partir dele é proibido.

O pack pertence à família `content` do cache definido pelo ADR 0013 e seu hash entra no manifest de execução do ADR 0009.

### Container versionado, encoding por seção

O formato é um container com `packFormatVersion`, cabeçalho, índice de seções e hash por seção. As seções são, no mínimo: símbolos, documentos de conteúdo, mapa de origem e strings de localização.

Cada seção declara seu encoding. O encoding inicial de todas é JSON canônico — ordem de chaves determinada, sem espaço redundante, sem número em ponto flutuante quando o valor é lógico, sem timestamp, sem caminho absoluto e sem dependência de locale. Uma seção pode migrar para encoding binário quando um benchmark demonstrar que seu custo de parse importa, sem trocar o container e sem quebrar as demais.

É por isso que o item da seção 36 é fechado apenas em parte: o container, a versão, o índice e o mapa de símbolos ficam decididos aqui; a codificação binária de uma seção continua condicionada a benchmark, com este ADR como ponto de revisão. Buffers de apresentação são problema separado e não compartilham este formato.

### Determinismo de bytes

Entradas iguais produzem bytes idênticos, em qualquer máquina e sistema suportado. Isso é verificado por fixture: compilar duas vezes, comparar hash; compilar em native e em WASM, comparar hash. Divergência é `CONTENT_PACK_NONDETERMINISTIC` e falha a compilação.

### Mapa de símbolos e origem

Cada símbolo compilado registra id semântico, tipo, seção, e origem com arquivo, JSON pointer e posição. É esse mapa que permite responder "de qual linha veio este valor" durante diagnóstico, e é ele que o SDK usa para resolver símbolos no carregamento, conforme o ADR 0016.

Símbolo ausente é `CONTENT_SYMBOL_UNKNOWN` no carregamento, nunca `nil` silencioso em execução.

### Carregamento pelos hosts

Quando o pack existir, BrowserHost, ElectronHost e worker de controle carregam o **mesmo** pack, identificado por hash, e o gameplay Lua deixa de receber dados por tabela anexada ao seu chunk. A regra do ADR 0011 é preservada em forma mais forte: hosts não podem preparar conteúdo diferente, agora verificável por hash em vez de por inspeção de texto.

A ponte `composeGameplaySource` permanece válida somente até o pack carregar em todos os hosts, e então é removida no mesmo change set que ativa o pack. Compatibilidade paralela entre os dois caminhos é proibida por prazo indeterminado: ela criaria duas autoridades de conteúdo, exatamente o que o ADR 0011 recusou.

### Versão e migrations

`packFormatVersion` versiona o container; cada documento mantém a versão do seu schema. Migrations são explícitas, ordenadas, idempotentes e cobertas por fixture de entrada e saída. Um pack de versão não suportada é `CONTENT_PACK_FORMAT_UNSUPPORTED`; um pack válido mas defasado em relação às fontes é `CONTENT_PACK_STALE`.

Migração silenciosa no carregamento é proibida: o pack é regenerado pela ferramenta, com diagnóstico, e nunca reinterpretado por tentativa.

### Fora do escopo

Este ADR não decide formato de asset produzido pelos Forges, buffers de apresentação, streaming de conteúdo por região nem compressão. Localização resolve texto no host, conforme o ADR 0014; o pack transporta apenas chaves e parâmetros.

Códigos: `CONTENT_PACK_STALE`, `CONTENT_PACK_FORMAT_UNSUPPORTED`, `CONTENT_PACK_HASH_MISMATCH`, `CONTENT_PACK_NONDETERMINISTIC`, `CONTENT_SYMBOL_UNKNOWN`, `CONTENT_MIGRATION_REQUIRED`.

## Consequências

- um valor em execução passa a ser rastreável até arquivo, pointer e posição de origem;
- dado e código deixam de compartilhar o mesmo chunk Lua;
- a igualdade de conteúdo entre hosts passa a ser verificada por hash;
- o pack ganha versão, o que torna possível recusar conteúdo futuro e migrar conteúdo antigo;
- a ponte do ADR 0011 passa a ter condição objetiva de remoção;
- binário permanece possível por seção, sem novo container e sem migração de formato;
- saves e replays passam a poder registrar o hash do pack como parte da compatibilidade.

## Alternativas rejeitadas

- **Manter a tabela anexada ao chunk Lua:** impede origem por símbolo, mistura dado com código e não possui versão de formato.
- **Definir agora um encoding binário completo:** otimização sem benchmark, e congelaria layout antes de existir volume real de conteúdo.
- **Tornar o pack editável:** criaria segunda fonte de verdade e diffs impossíveis de revisar.
- **Manter os dois caminhos de carregamento indefinidamente:** duas autoridades de conteúdo, com risco de divergência entre host visual e headless.
- **Migrar silenciosamente no carregamento:** transforma incompatibilidade em comportamento adivinhado e destrói reprodutibilidade de replay.
- **Reconstruir JSONC a partir do pack:** trataria artefato derivado como fonte e perderia comentários, ordem e intenção do autor.
- **Reaproveitar o formato para buffers de apresentação:** requisitos opostos — conteúdo é pequeno, versionado e raro; buffer é grande, por frame e descartável.
