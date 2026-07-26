# ADR 0055 — Reuso upstream-first e incorporação excepcional de código externo

- Status: provisório
- Data: 2026-07-26
- Revisão: antes da primeira incorporação de código externo ou criação de fork mantido pela Ludivra
- Complementa: [ADR 0003](0003-mit-license.md), [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md) e [ADR 0044](0044-approved-native-extension-process.md)
- Fases: transversal, com enforcement na Fase 11

## Contexto

A análise da Godot revelou conceitos, casos extremos e escolhas de dependências úteis. Isso não responde sozinho se a Ludivra deve copiar código, consumir a biblioteca original ou implementar algo próprio.

Copiar um subsistema de outra engine traz acoplamento aos seus contratos, editor, lifecycle e compatibilidade histórica. Implementar renderer, solver físico, navmesh, codec ou compressor próprios repete algoritmos especializados sem ser diferencial da Ludivra. Ao mesmo tempo, proibir qualquer incorporação de fonte externa impediria usar legitimamente um trecho pequeno quando não existir upstream reutilizável.

## Decisão

### Ordem obrigatória de preferência

Para cada necessidade, a avaliação segue esta ordem:

1. derivar requisitos e cenários de especificação pública, paper e comportamento observado, sem copiar implementação;
2. consumir diretamente a biblioteca upstream, fixada por versão/hash e isolada em adapter ou toolchain;
3. contribuir a mudança necessária no upstream e atualizar a versão fixada;
4. incorporar ou manter fork de código externo somente pelo processo excepcional abaixo;
5. implementar código próprio apenas quando o domínio for diferencial da Ludivra ou nenhuma opção anterior satisfizer contratos, targets, licença e budgets.

Integração direta com upstream não significa expor o vendor. Contratos, authority, schemas, adapters, diagnósticos, cooking e operação AI-first continuam pertencendo à Ludivra.

Vendoring de uma release upstream sem alterações, fixada por commit/hash, conta como dependência direta e não como incorporação excepcional. Ainda exige licença, notices, avaliação de targets e atualização controlada. “Incorporação” neste ADR significa extrair trechos para código Ludivra ou manter alterações próprias sobre um fork.

### O que a Ludivra possui

A Ludivra implementa suas fronteiras: kernel autoritativo, command buffer, schemas text-first, compiladores de conteúdo/cenas, statecharts, contratos de física e navegação, presentation protocol, adapters, Forges, diagnósticos, CLI, evidência e seleção de perfis.

Renderer, solver físico, codecs, compressão de textura/mesh e backend de navmesh não serão próprios sem benchmark e ADR que demonstrem necessidade. A escolha padrão é integrar o upstream especializado.

### Godot é referência, não fornecedor implícito

Código da Godot não é copiado por padrão. Antes de considerar um trecho, deve-se procurar a biblioteca, especificação ou paper original que a Godot integrou. SceneTree, RenderingServer, RenderingDevice, renderers, PhysicsServer, NavigationServer, importers e APIs de editor são recusados como unidades de incorporação.

Um trecho existente somente na Godot pode ser considerado quando for pequeno, autocontido, desacoplado desses subsistemas e claramente mais barato de manter que uma implementação independente. MIT torna a incorporação juridicamente possível, mas não remove as obrigações de attribution, notices e manutenção.

### Gate para fonte incorporada ou fork

Toda incorporação exige, antes do merge:

- ADR específico com problema, alternativas e justificativa de por que upstream direto não serve;
- URL canônica, caminho, commit/tag e hash do conteúdo importado;
- licença do trecho e cadeia de licenças de terceiros verificadas;
- copyright e textos exigidos em `THIRD_PARTY_NOTICES.md` e no pacote;
- owner, boundary, tamanho exato e lista dos arquivos incorporados;
- testes de comportamento escritos contra o contrato da Ludivra;
- política de atualização, comparação com upstream e remoção;
- verificação de targets, segurança, determinismo e budgets aplicáveis.

Alteração local sobre fonte incorporada é patch rastreado, nunca cópia sem histórico. Até existir registry executável e gate de CI para esses campos, identificado por `SUP-001`, nova incorporação de fonte ou fork é `NOT_AVAILABLE`; dependências normais fixadas continuam permitidas pelos ADRs existentes.

Códigos: `SOURCE_PROVENANCE_MISSING`, `SOURCE_LICENSE_UNVERIFIED`, `SOURCE_UPSTREAM_UNPINNED`, `SOURCE_FORK_POLICY_MISSING`, `SOURCE_INCORPORATION_NOT_AVAILABLE`.

## Consequências

- Jolt, Box2D, Three.js e dependências futuras são consumidos de seus upstreams, não extraídos da Godot;
- a Ludivra investe código próprio nas fronteiras AI-first/text-first e não em algoritmos comoditizados;
- estudar comportamento, testes e arquitetura de outra engine permanece permitido sem criar provenance de código;
- qualquer exceção de cópia se torna pequena, auditável, atualizável e licenciada;
- `SUP-001` precisa implementar registry e enforcement antes da primeira incorporação.

## Alternativas rejeitadas

- **Copiar livremente porque a licença é MIT:** licença resolve permissão, não acoplamento, provenance ou custo de manutenção.
- **Proibir qualquer fonte externa para sempre:** impede uma exceção legítima mesmo quando isolada e economicamente correta.
- **Criar todos os subsistemas internamente:** desvia recursos do diferencial da Ludivra e aumenta risco técnico.
- **Copiar adapters da Godot para bibliotecas upstream:** preserva abstrações da engine errada; o adapter deve implementar o contrato da Ludivra.
- **Manter fork sem comparação automatizada:** torna atualizações de segurança e correções upstream invisíveis.
