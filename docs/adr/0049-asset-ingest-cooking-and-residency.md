# ADR 0049 — Ingestão, cooking e residência de assets

- Status: provisório
- Data: 2026-07-26
- Revisão: antes de fixar o primeiro encoder de textura ou formato binário de mesh
- Complementa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md), [ADR 0033](0033-visual-forge-procedural-characters-and-generated-surfaces.md), [ADR 0048](0048-textual-scene-prefab-and-resource-graph.md) e [ADR 0055](0055-upstream-first-and-external-source-incorporation.md)
- Fases: 8 e 10

## Contexto

A arquitetura descreve validação, normalização, cooker e pack, mas não decide formatos de entrada, separação entre asset importado e gerado, variantes por target ou política de residência. O Visual Forge gera glTF e PNG, porém isso não substitui um pipeline geral para cenários, props, texturas, fontes e assets licenciados.

Sem cooker, o renderer carrega formatos de autoria diretamente, recompila decisões em runtime e não consegue atribuir memória, stutter ou falha de decode a um asset.

## Corte implementado

O `game asset cook` v1 aceita somente declarações `model` glTF 2.0/GLB no manifest. Ele exige origem, licença, targets, classe de residência, budgets CPU/GPU e as convenções `meters`/`right-handed-y-up`; valida header e JSON do container, recusa URIs remotas ou que escapem do projeto, registra dependências externas e copia o payload inalterado para um cache identificado pelo conteúdo e pelas opções de importação. O índice `.ludivra/assets-index.json` e o manifest por asset dão ao build uma fronteira observável de proveniência, métricas e decisão de cache.

Esse corte não declara normalização, otimização, compressão, variante por target, loader de cena ou streaming: o manifest registra explicitamente `normalized: false` e `compression: none` até a adoção de um encoder upstream licenciado e de evidência de runtime.

## Decisão

### Produtores diferentes, contrato único

Asset pode vir de Forge, código procedural, arquivo de projeto ou importação aprovada. Cada produtor entrega ao mesmo manifest versionado com ID, tipo, origem, licença, autoria, hash da fonte, configuração de importação, targets e outputs derivados.

O ADR 0033 continua proibindo input externo **dentro do Visual Forge v2**. Essa proibição não se aplica ao pipeline geral de assets.

### Formatos canônicos iniciais

glTF 2.0/GLB é o formato de intercâmbio 3D inicial para mesh, hierarchy, skin, morph targets, materiais PBR e clips. PNG continua aceito como fonte lossless; JPEG pode ser aceito para fotografia sem alpha; WAV e fontes seguem seus pipelines próprios. Formato proprietário de DCC não entra no runtime.

O cooker normaliza coordenadas, unidades, pivôs, tangentes, bounds, materiais, skeletons e nomes de clips. Cada decisão é registrada no manifest; correção silenciosa que muda forma ou animação é proibida.

### Variantes por target

O build produz texturas GPU-compressed com fallback declarado, meshes indexadas e otimizadas, níveis de LOD quando exigidos, atlases, metadata de animação e pacotes content-addressed. O formato exato do encoder e do mesh pack será fixado com versão e licença na revisão que introduzir a dependência; até lá não se cria stub.

Loaders, encoders e optimizers são avaliados em seus upstreams canônicos. O pipeline pode estudar a cobertura e os casos de importação da Godot, mas não copiar seus importers, resources ou hooks de editor. Transformações específicas da Ludivra permanecem no cooker sobre contratos próprios.

### Residência e streaming

Cada asset declara classe `boot`, `scene`, `streamed` ou `transient`, prioridade, budget e política de descarte. O runtime contabiliza memória CPU/GPU, uploads, cache hits, evictions e tempo de decode por asset ID. Asset requerido não pode desaparecer por degradação; asset opcional pode reduzir LOD segundo o perfil.

Códigos: `ASSET_SOURCE_UNDECLARED`, `ASSET_LICENSE_UNDECLARED`, `ASSET_FORMAT_UNSUPPORTED`, `ASSET_IMPORT_NORMALIZATION_FAILED`, `ASSET_TARGET_VARIANT_MISSING`, `ASSET_RESIDENCY_BUDGET_EXCEEDED`, `ASSET_GPU_UPLOAD_FAILED`.

## Consequências

- Forges e importadores deixam de ser pipelines concorrentes;
- jogos podem combinar geração AI-first com assets convencionais auditáveis;
- runtime recebe artefatos preparados, não formatos de autoria arbitrários;
- memória e stutter passam a ser atribuíveis por asset;
- glTF/GLB vira fronteira de intercâmbio, não objeto autoritativo de gameplay.

## Alternativas rejeitadas

- **Proibir todo asset externo:** limita qualidade, ambientes e colaboração sem melhorar a arquitetura do runtime.
- **Carregar arquivos de autoria diretamente:** move normalização e falhas para o frame do jogador.
- **Aceitar qualquer formato de DCC:** amplia dependências e comportamento não reproduzível.
- **Uma variante para todos os targets:** ignora compressão, memória e feature sets diferentes.
- **Asset sem provenance porque foi gerado:** geração também precisa de receita, versão e hash.
