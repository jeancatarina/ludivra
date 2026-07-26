# ADR 0042 — Layout final do monorepo

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-26 para acomodar os contratos desktop sem reservar pacotes vazios
- Revisão: antes da primeira versão estável, ou ao adicionar uma categoria de pacote que não caiba nas existentes
- Fecha o item "layout final do monorepo" da seção 36 de [architecture.md](../../architecture.md)
- Complementa: [ADR 0001](0001-build-system.md)

## Contexto

O repositório usa hoje um layout plano: `kernel/`, `runtime-c-api/`, `runtime-wasm/`, `runtime-web/`, `presentation-protocol/`, `platform-contracts/`, `renderer-three/`, `cli/`, `hosts/`, `contracts/`, `schemas/`, `capabilities/`, `tools/`, `tests/`, `examples/`, `docs/`.

A seção 36 mantinha o layout final como decisão aberta, e a `architecture.md` chegou a esboçar uma estrutura com `packages/` e pacotes ainda inexistentes como `lua-sdk/` e `content-compiler/`. Enquanto isso permanece aberto, cada pacote novo — e os ADRs desta série pedem vários — precisa adivinhar onde mora, e a regra de imports não tem como ser verificada mecanicamente.

## Decisão

### O layout plano é o layout final

Não haverá diretório `packages/`. Cada unidade publicável ou compilável fica na raiz, com nome igual ao seu domínio, e categorias fixas:

| Categoria | Diretórios | Regra |
|---|---|---|
| Núcleo nativo | `kernel/`, `runtime-c-api/`, `runtime-wasm/` | não conhece host, jogo, vendor nem apresentação |
| Contratos | `contracts/`, `schemas/`, `platform-contracts/`, `presentation-protocol/` | fonte única de schema e tipo gerado |
| Adapters de runtime | `runtime-web/` | único adapter da C ABI para WebAssembly |
| Renderers | `renderer-three/` | único importador do vendor de render |
| Authoring | `cli/`, `tools/`, `audio-authoring/`, `visual-authoring/` | roda em authoring ou build, nunca no jogo |
| Hosts | `hosts/<host>/` | um diretório por host |
| Runtimes de apresentação | `audio-runtime-web/` | consumido pelos hosts, sem regra de jogo |
| Catálogo e evidência | `capabilities/`, `reports/`, `docs/` | derivado ou documental |
| Verificação | `tests/`, `examples/` | fixtures e jogos de exemplo |

Um pacote novo declara sua categoria. Categoria nova exige revisão deste ADR.

### Nomes descrevem domínio, não camada

`audio-authoring` e não `audio-lib`; `visual-authoring` e não `visual-utils`. Nomes genéricos — `utils`, `helpers`, `common`, `shared`, `core`, `misc` — continuam proibidos pelas regras de engenharia, e agora também como nome de diretório.

O plural `packages/` foi recusado por um motivo prático: ele não adiciona informação e faz todo caminho de import, todo filtro de pnpm e todo padrão de fitness function crescer um nível.

### Pacotes previstos pelos ADRs desta série

`audio-authoring` e `audio-runtime-web` pelo ADR 0032; `visual-authoring` pelo ADR 0033. Os nomes ficam reservados aqui para que a implementação não precise decidir localização.

`lua-sdk/` e `content-compiler/`, esboçados na arquitetura, só existirão quando os ADRs 0016 e 0017 forem implementados; até lá não são criados vazios. Compiladores de cenas, prefabs, assets, materiais, animação, VFX, statecharts e navegação começam no pacote de authoring que os consome. Só ganham pacote próprio quando houver fronteira publicável real, sempre em uma categoria desta tabela.

### Enforcement

A fitness function de workspace passa a verificar que todo diretório de pacote está declarado em uma categoria e que os imports respeitam a direção da tabela. Pacote fora de categoria é falha de validação, não convenção informal.

Códigos: `WORKSPACE_PACKAGE_UNCATEGORIZED`, `WORKSPACE_PACKAGE_NAME_GENERIC`, `WORKSPACE_IMPORT_DIRECTION_INVALID`.

## Consequências

- pacote novo tem lugar decidido antes de ser criado;
- a direção de dependências passa a ser verificável por categoria, não por revisão manual;
- nenhum diretório é criado vazio à espera de implementação;
- a `architecture.md` precisa deixar de exibir uma estrutura com `packages/` que não é a real;
- caminhos de import permanecem curtos e estáveis até a versão estável.

## Alternativas rejeitadas

- **Mover tudo para `packages/`:** custo de migração em todo import, script e fitness function, sem informação nova.
- **Agrupar por camada, como `runtime/`, `authoring/`, `hosts/`:** força escolha ambígua para pacotes que servem duas camadas e esconde o domínio no nome do grupo.
- **Manter o layout aberto até a versão estável:** cada ADR novo precisaria adivinhar onde o pacote mora.
- **Criar `lua-sdk/` e `content-compiler/` agora:** diretório vazio é código morto documental.
