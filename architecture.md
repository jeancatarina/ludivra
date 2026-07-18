# Arquitetura da Ludivra

> Engine de jogos AI-first, text-first e code-first, operável integralmente por chat.

| Campo | Valor |
|---|---|
| Versão do documento | 2.1 |
| Status | Arquitetura proposta |
| Escopo inicial | Web, Steam/desktop, Android e iOS |
| Rota futura | Hosts e renderers nativos para consoles |
| Licença pretendida | Open source; a definir antes da primeira release pública |

**Convenções do documento**

- **DEVE / NÃO DEVE** indica uma regra arquitetural obrigatória e verificável.
- **PODE** indica uma escolha permitida, não uma obrigação.
- Interfaces e payloads exibidos são contratos conceituais até serem promovidos por ADR e schema versionado.
- Números de budget apresentados como exemplo não são metas aprovadas até serem medidos em hardware de referência.
- Decisões marcadas para ADR não podem ser tratadas como resolvidas apenas por aparecerem neste documento.
- Quando um contrato executável existir em `docs/contracts/`, este documento registra somente a fronteira e aponta para ele; não duplica especificações de campos que possam divergir.

## 1. Decisão executiva

A Ludivra será uma engine na qual a unidade principal de trabalho não é uma cena aberta em um editor, mas uma mudança versionada e verificável no repositório.

O usuário descreve uma intenção pelo chat. Um agente lê o estado do projeto, modifica arquivos textuais, executa a engine, inspeciona o resultado e devolve evidências no próprio chat. IDE, terminal, inspector, editor visual e ferramentas proprietárias podem existir para mantenedores, mas não serão requisitos do fluxo normal de criação de um jogo.

A composição inicial será:

```text
C++20                 kernel portátil e simulação autoritativa
Lua embutida          gameplay e regras específicas
JSONC                 conteúdo, configuração, cenários e manifests
TypeScript            hosts, ferramentas e bridge WebAssembly
Three.js              primeiro renderer gráfico
HTML/CSS/React        primeiro renderer de UI, sem autoridade lógica
Electron              host desktop e integração Steam
Capacitor             hosts Android e iOS
CLI `game`            interface operacional para pessoas e agentes
Git                    memória durável, auditoria e continuidade
```

Esta arquitetura otimiza velocidade nas plataformas iniciais sem fingir que o mesmo renderer servirá em consoles. O investimento portátil ficará nas partes mais caras de recriar: regras, simulação, conteúdo compilado, saves, replays, testes, input lógico, modelos de UI e contratos de plataforma.

## 2. O que “operável integralmente por chat” significa

O fluxo é considerado integralmente operável por chat quando um agente consegue, sem pedir ao usuário que abra outra ferramenta:

1. descobrir o estado atual do repositório;
2. entender as capacidades disponíveis;
3. implementar uma alteração limitada;
4. validar schemas e regras arquiteturais;
5. executar testes e simulações;
6. iniciar o jogo em um host controlável;
7. navegar por ações semânticas, teclado, gamepad e touch virtual;
8. ler o estado lógico e a árvore semântica da UI;
9. produzir e inspecionar screenshots e vídeos;
10. comparar métricas, traces e imagens com baselines;
11. gerar builds reproduzíveis;
12. anexar ao chat um índice dos artefatos e uma avaliação honesta;
13. deixar o repositório compreensível para a sessão seguinte.

O usuário não precisa validar tecnicamente fora do chat. Julgamentos subjetivos — diversão, estilo, ritmo e intenção artística — continuam pertencendo ao usuário, mas devem poder ser discutidos a partir de vídeos, imagens, métricas e builds apresentados no chat.

## 3. Princípios não negociáveis

### 3.1 Texto é a fonte de verdade

Todo estado autorável deve possuir uma representação textual, revisável em diff e validável por schema. Arquivos binários serão usados para assets e artefatos gerados, nunca como única fonte de regras, cenas, navegação ou configuração.

### 3.2 A simulação é independente da apresentação

Gameplay não conhece Three.js, DOM, React, Electron, Capacitor, Steamworks nem APIs de console. Renderers consomem projeções da simulação; não armazenam estado autoritativo.

### 3.3 Toda mudança produz evidência

“Compila” não significa “pronto”. Uma alteração relevante precisa de teste, cenário ou invariante; mudanças visuais precisam de captura; alterações de desempenho precisam de benchmark; alterações de portabilidade precisam de execução cruzada.

### 3.4 O caminho fácil deve respeitar a arquitetura

A CLI, os templates e as receitas devem gerar código já colocado no pacote correto. Imports proibidos, referências físicas de assets e acesso não determinístico devem falhar automaticamente.

### 3.5 O kernel cresce por prova, não por possibilidade

Uma funcionalidade só entra no kernel quando a implementação em Lua ou TypeScript for inadequada, houver valor além de um jogo e existirem testes nativos e WebAssembly equivalentes.

### 3.6 Portabilidade é verificada continuamente

O kernel terá um runner nativo headless desde a fundação. Equivalência entre build nativa e WebAssembly será um teste recorrente, não uma atividade adiada até o primeiro port.

### 3.7 Automação não recebe autoridade implícita

Criar, testar e empacotar são operações normais. Publicar, comprar, assinar, enviar a lojas, apagar saves ou alterar infraestrutura exigem comandos separados, permissões explícitas e trilha de auditoria.

## 4. Objetivos e não objetivos

### 4.1 Objetivos iniciais

- produzir um vertical slice por meio de uma sessão remota;
- permitir que sessões novas continuem o trabalho apenas pelo repositório;
- concentrar gameplay em Lua, conteúdo em JSONC e apresentação em TypeScript;
- manter o kernel C++ pequeno, determinístico e portável;
- gerar builds para browser, desktop/Steam, Android e iOS;
- fornecer inspeção textual e visual suficiente para o agente avaliar o jogo;
- provar reuso com dois jogos materialmente diferentes;
- preservar uma rota tecnicamente testada para hosts nativos futuros.

### 4.2 Gêneros prioritários

- card games e card roguelites;
- estratégia e combate por turnos;
- dungeon crawlers e roguelites;
- jogos narrativos e de gerenciamento;
- 2D, 2.5D e 3D estilizado;
- ação single-player de complexidade moderada.

Suporte a um gênero significa que há capacidades, exemplos, cenários, perfis de desempenho e receitas que o comprovam. Não é uma afirmação genérica de compatibilidade.

### 4.3 Não objetivos iniciais

- editor visual completo;
- linguagem de programação própria;
- renderer ou engine física próprios;
- multiplayer competitivo com rollback;
- MMO, mundo aberto fotorrealista ou produção AAA;
- hot-reload de código remoto em builds comerciais;
- port automático para consoles;
- avaliação automática definitiva de diversão;
- abstrações genéricas de gênero antes de dois usos reais;
- publicação autônoma em lojas.

### 4.4 Ordem para resolver trade-offs

Quando duas qualidades entrarem em conflito, a decisão deve respeitar esta prioridade:

1. integridade de estado, saves e transações do usuário;
2. operação e diagnóstico completos pelo agente;
3. velocidade de iteração no primeiro jogo;
4. determinismo e portabilidade da lógica cara de recriar;
5. performance dentro dos budgets declarados;
6. extensibilidade genérica ainda não comprovada.

Essa ordem não torna desempenho opcional: um target que excede seu budget falha. Ela impede, porém, sacrificar segurança ou construir abstrações universais apenas para ganhar um benchmark sem relevância para os jogos suportados.

## 5. Modelo arquitetural

A Ludivra possui dois planos com responsabilidades distintas que cooperam por contratos explícitos. O plano de autoria controla ferramentas e artefatos; o plano de execução roda o jogo. Nenhum deles pode depender da memória privada de uma sessão de chat.

### 5.1 Plano de autoria e controle

```text
Intenção no chat
      │
      ▼
Especificação textual + critérios de aceitação
      │
      ▼
Agente lê estado, contratos e capacidades
      │
      ▼
Edita JSONC, Lua, TypeScript, assets e testes
      │
      ▼
CLI valida, compila, executa e coleta evidências
      │
      ▼
Relatório + screenshots + vídeos + builds no chat
      │
      ▼
Git preserva o novo estado
```

### 5.2 Plano de execução

```text
Input físico
    │ Host traduz
    ▼
Ações lógicas / intenções de UI
    │ InputPacket
    ▼
Kernel C++20 ───── Lua sandbox
    │                   │
    │       comandos validados e handlers
    ▼
Estado lógico autoritativo
    │
    ▼
Projectors read-only em Lua/C++
    │
    ├── FrameSnapshot ────────────────┐
    ├── PresentationEvents            │
    └── UiViewModel                    │
                                      ▼
                              Presentation Bridge
                                      │
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
                 Three.js renderer          UI renderer web
                        │                           │
                        └─────────────┬─────────────┘
                                      ▼
                         Browser / Electron / Capacitor
```

### 5.3 Direção obrigatória das dependências

```text
game content ─┐
game scripts ─┼─> public SDK/contracts ─> kernel
capabilities ─┘

hosts ─> platform contracts
renderers ─> presentation contracts
tools ─> public compiler/runtime APIs
```

Dependências nunca apontam do kernel para hosts, renderers, jogos ou SDKs de lojas. O pacote `renderer-three` é o único autorizado a importar Three.js. Somente adaptadores de host importam Electron, Capacitor ou SDKs de plataforma.

## 6. Fontes de verdade e artefatos gerados

| Categoria | Fonte de verdade | Gerado |
|---|---|---|
| Visão do jogo | `GAME_DESIGN.md` e `game.jsonc` | resumo de inspeção |
| Conteúdo | `content/**/*.jsonc` | content pack binário |
| Gameplay | `scripts/**/*.lua` | bytecode opcional e índice |
| Apresentação | `presentation/**` e manifests | bundles e asset packs |
| Contratos | schemas e definições de protocolo | bindings C++/TS/Lua |
| Estado verificável | commit + fontes + manifests de runs | `.ludivra/project-state.json` e relatório da sessão |
| Evidência | cenários e configuração | `reports/runs/<run-id>/` |
| Dependências | lockfiles | diretórios de cache/build |

Arquivos gerados devem conter marcador de geração e nunca ser editados manualmente. A CLI deve detectar divergência entre uma fonte e seu resultado gerado. `.ludivra/project-state.json` é um índice descartável e regenerável; ele não pode se sobrepor ao commit e aos manifests de evidência como fonte de verdade.

## 7. Kernel portátil em C++20

### 7.1 Responsabilidades

- scheduler de fixed ticks;
- mundo autoritativo, entidades e handles opacos;
- Lua VM e carregamento controlado de módulos;
- command buffer e event bus;
- timers lógicos;
- RNG determinístico com streams nomeados;
- serialização canônica;
- saves, migrations, snapshots e replays;
- validação de invariantes;
- limites de tempo, memória e instruções;
- métricas da simulação;
- infraestrutura para projectors read-only e serialização de suas saídas;
- contratos C ABI para builds nativas e WebAssembly.

O modelo interno de armazenamento — ECS, tabelas esparsas ou outro — não será parte da API pública. Jogos usam queries, comandos, eventos e handles; isso permite mudar a implementação sem migrar todos os scripts.

### 7.2 O que não pertence ao kernel

- regras de cartas, inimigos ou progressão específicas;
- câmera visual, materiais, partículas e pós-processamento;
- layout e componentes visuais de UI;
- acesso direto a filesystem, rede ou relógio civil;
- Steamworks, Game Center, Google Play ou SDKs de console;
- conceitos genéricos de gênero ainda não comprovados;
- código que existe apenas para um jogo.

### 7.3 Algoritmo de tick

Cada tick segue uma ordem pública e estável:

1. receber `InputPacket` e resultados externos agendados;
2. ordenar entradas por tick, origem e sequência;
3. avançar timers lógicos e enfileirar os que venceram;
4. disparar eventos de início de tick;
5. executar handlers Lua dentro de orçamento;
6. fechar o command buffer;
7. ordenar por chave estável e pré-validar o lote inteiro de comandos;
8. aplicar comandos em fases definidas;
9. resolver eventos derivados até o limite configurado;
10. validar invariantes do mundo;
11. calcular hash canônico quando configurado;
12. confirmar o estado autoritativo do tick;
13. executar projectors read-only;
14. publicar projeções e métricas de apresentação.

A ordem de comandos conflitantes precisa estar especificada. Empates nunca dependerão de endereço de memória, ordem de hash map ou scheduling de threads. Streams de RNG avançam somente quando consumidos; não existe um avanço implícito no fim do tick.

Cada comando recebe uma chave estável composta por fase, sequência do evento, ordem do handler e sequência local. A ordem emitida dentro de um handler é preservada. Cada tipo de comando declara sua política de conflito — rejeitar, agregar ou escolher por precedência estável — em vez de depender de um sort global implícito.

Os passos de handlers, validação e aplicação formam rodadas de resolução. Eventos derivados podem abrir uma nova rodada, sempre com novo sublote e a mesma ordenação, até a fila esvaziar ou atingir um limite declarado. Atingir o limite é falha diagnosticada, não truncamento silencioso.

### 7.4 Concorrência

A simulação autoritativa começa single-threaded. Jobs paralelos só serão aceitos quando seus resultados puderem ser combinados em ordem determinística. Renderização, asset loading, compressão e I/O podem ocorrer em paralelo fora do commit autoritativo.

### 7.5 Modelo de falhas do tick

Atomicidade não significa copiar o mundo inteiro a cada tick. Handlers apenas acumulam sublotes de comandos; nenhuma mutação ocorre durante Lua. O kernel pré-valida todos os sublotes antes da aplicação. Se um handler exceder budget ou um comando for inválido, desenvolvimento e teste descartam o buffer inteiro, não confirmam o tick e falham com diagnóstico.

Em produção, um erro previamente classificado como recuperável pode colocar em quarentena somente o sublote ofensivo e continuar segundo política explícita do jogo. Erros não classificados acionam recuperação controlada. O runtime nunca escolhe silenciosamente uma política diferente por build.

Depois que a aplicação começa, uma falha de invariante é defeito do kernel, não erro recuperável de conteúdo. Testes param imediatamente e preservam replay e snapshot anterior. Builds de produção entram em uma política de falha controlada definida pelo jogo — por exemplo, restaurar o último checkpoint e exibir uma tela de recuperação — sem continuar silenciosamente em estado possivelmente corrompido.

Falha de projector ou renderer não desfaz um tick confirmado. O runtime preserva o estado lógico, marca a projeção como inválida e o host reutiliza a última projeção válida ou exibe fallback de diagnóstico. Em teste, a execução falha e captura o estado que causou o problema.

## 8. Determinismo

Determinismo é um contrato observável, não apenas o uso de uma seed.

### 8.1 Regras

- fixed tick independente do frame rate;
- RNG definido pela engine, com algoritmo versionado e vetores de teste;
- streams de RNG nomeados para evitar acoplamento por ordem de chamadas;
- IDs estáveis atribuídos pelo compilador de conteúdo;
- coleções com iteração estável;
- serialização canônica e ordenada;
- datas, rede e resultados de plataforma entram como eventos externos gravados;
- matemática autoritativa usa inteiros ou fixed-point quando a igualdade cruzada importa;
- `NaN`, infinito e funções transcendentais não fazem parte da lógica autoritativa;
- física visual pode usar floats, mas não decide resultado de gameplay sem uma implementação determinística aprovada.

Handlers autoritativos não usam `pairs`, `next` nem ordenação sem comparador estável. A SDK fornece coleções e iteradores ordenados; o lint rejeita as APIs proibidas em scripts de gameplay.

### 8.2 Níveis de equivalência

| Nível | Exigência |
|---|---|
| Estado lógico | hash canônico idêntico entre native e WASM |
| Eventos | mesma sequência e payload |
| Save/replay | leitura compatível e mesmo resultado lógico |
| Apresentação | semanticamente equivalente; pixels podem variar por GPU |
| Performance | dentro do orçamento de cada perfil, não necessariamente idêntica |

## 9. Lua como linguagem de gameplay

Lua implementa efeitos, habilidades, inimigos, encontros, economia, progressão, missões, fluxo de partidas e capacidades reutilizáveis.

```lua
local card = {}

function card.on_score(ctx, event)
    local energy_cards = ctx.query:cards_with_tag("energy")
    ctx.commands:multiply_score({
        source = event.card_id,
        multiplier_milli = 1000 + (#energy_cards * 250)
    })
end

return card
```

### 9.1 API pública

```text
ctx.commands   solicita mudanças no mundo
ctx.query      lê projeções imutáveis do estado
ctx.random     usa streams determinísticos
ctx.time       lê tick e tempo lógico
ctx.input      lê ações lógicas do tick
ctx.metrics    emite métricas declaradas
```

Eventos de domínio customizados e solicitações externas também passam por `ctx.commands`, com schemas próprios. Isso preserva validação, ordenação e causalidade. `ctx.state` mutável, `ctx.events` de publicação direta e `ctx.platform` direto não existirão.

Serviços assíncronos não retornam `Promise` para handlers de simulação. O script emite um comando `request_service`; o kernel produz um `ServiceRequest`; o host devolve um `ServiceResult` em um tick posterior. O request recebe idempotency key e o resultado é registrado no replay quando influencia gameplay.

### 9.2 Sandbox

A VM não expõe por padrão:

- `io`, `os`, `debug`, carregamento nativo ou filesystem;
- rede, relógio do dispositivo ou variáveis de ambiente;
- geração aleatória fora de `ctx.random`;
- ponteiros e estruturas internas;
- APIs de renderer, host ou loja;
- download ou execução de scripts remotos.

Cada callback possui orçamento de instruções, profundidade, memória e eventos derivados. A falha gera diagnóstico estruturado com script, handler, tick, entidade e trecho da stack sanitizada.

### 9.3 Eventos em vez de polling

Handlers preferidos incluem `on_spawn`, `on_play`, `on_damage`, `on_death`, `on_round_start`, `on_timer`, `on_interact` e `on_resume`. Atualizações por tick devem ser exceção explícita e mensurada.

### 9.4 Promoção para nativo

Uma implementação pode migrar de Lua para C++ sem mudar a API pública quando benchmarks comprovarem necessidade. A promoção exige golden tests, replay de compatibilidade e implementação equivalente em native e WASM.

## 10. Conteúdo declarativo e compilador

JSONC é o formato único de autoria declarativa. JSON Schema valida estrutura; validadores semânticos verificam IDs, referências, ciclos, compatibilidade de versão, licenças e budgets.

```jsonc
{
  "$schema": "ludivra://schemas/card/v1",
  "id": "card.solar_echo",
  "cost": 2,
  "tags": ["energy", "multiplier"],
  "behavior": { "script": "cards/solar_echo.lua" },
  "presentation": {
    "artwork": "art.card.solar_echo",
    "frame": "frame.rare"
  }
}
```

### 10.1 Pipeline obrigatório

```text
JSONC de autoria
    │ parse com localização de origem
    ▼
Validação estrutural
    ▼
Defaults e normalização
    ▼
Resolução de IDs e referências
    ▼
Validação semântica e de budgets
    ▼
IDs numéricos estáveis + tabelas de símbolos
    ▼
Content pack versionado e indexado
```

Produção carrega content packs, não milhares de JSONC. O pack guarda versão de schema, hash de conteúdo e mapa opcional de origem para diagnósticos. O formato binário é detalhe do compilador; os schemas e a semântica são o contrato público.

### 10.2 Compatibilidade

Mudanças de schema são classificadas como aditivas, migráveis ou incompatíveis. Migrations são puras, versionadas, testadas e executáveis pela CLI. Conteúdo compilado nunca é migrado in-place; ele é regenerado das fontes.

## 11. Bridge native/WebAssembly

A fronteira do kernel é uma C ABI pequena e versionada. Bindings TypeScript são gerados a partir das definições de protocolo; bindings escritos manualmente são proibidos para mensagens públicas.

### 11.1 Princípios

- chamadas em lote por tick;
- buffers contíguos e reutilizáveis;
- ownership explícito;
- IDs numéricos e strings internadas;
- nenhuma serialização JSON por frame;
- nenhum objeto JavaScript por entidade;
- limites e versões validados antes de ler buffers;
- cópias permitidas somente quando simplificam segurança sem romper budgets.

API conceitual:

```ts
runtime.submitInput(inputBuffer);
runtime.submitExternalResults(resultBuffer);
runtime.step(tickCount);
const frame = runtime.readFrameSnapshot();
const events = runtime.readPresentationEvents(lastSequence);
```

## 12. Protocolo de apresentação

O protocolo descreve intenção de apresentação, não comandos de GPU.

Há duas saídas diferentes:

- `FrameSnapshot`: estado atual retido; pode substituir o snapshot anterior;
- `PresentationEvents`: ocorrências transitórias ordenadas; exigem sequência e confirmação para não tocar áudio ou efeitos duas vezes.

```ts
interface FrameSnapshot {
  protocolVersion: number;
  tick: bigint;
  transforms: TransformBuffer;
  visuals: VisualStateBuffer;
  animations: AnimationStateBuffer;
  camera: CameraIntent;
  ui: UiViewModel;
}

interface PresentationEventBatch {
  firstSequence: bigint;
  lastSequence: bigint;
  effects: EffectEventBuffer;
  audio: AudioEventBuffer;
  haptics: HapticEventBuffer;
  announcements: AnnouncementBuffer;
}
```

Operações semânticas incluem criar/remover visual, escolher visual state, atualizar transform, solicitar animação, efeito, áudio, câmera, texto e tela. Materiais e efeitos usam IDs e parâmetros compatíveis com perfis, não instâncias de Three.js.

Projectors de jogo podem ser escritos em Lua ou C++, mas rodam depois do commit do tick em contexto read-only. Eles não consomem RNG, não emitem comandos e não fazem parte de save nem do hash autoritativo. O custo de projeção é medido separadamente e sua saída usa IDs e strings internadas para não transformar a bridge em gargalo.

## 13. Renderer Three.js

`renderer-three` é a primeira implementação do protocolo de apresentação.

Responsabilidades:

- cenas, câmera, sprites, modelos, luzes e materiais;
- animação e interpolação entre ticks;
- partículas, pós-processamento e efeitos;
- cache e streaming de assets;
- recuperação após perda de contexto;
- adaptação aos perfis de hardware;
- pontos explícitos de sincronização para captura e inspeção visual.

O renderer pode escolher WebGPU ou WebGL conforme suporte e perfil. Nenhuma regra de gameplay depende dessa escolha. Funcionalidades sem fallback devem declarar restrição de plataforma no manifest e falhar na validação de targets incompatíveis.

Captura visual não promete pixels idênticos entre GPUs. Um cenário espera tick, carregamento de assets, fontes e animações relevantes estabilizarem; então compara contra baseline do mesmo backend e perfil. O estado lógico associado à captura permanece determinístico.

## 14. UI text-first e substituível

React/HTML/CSS será o renderer inicial para telas e acessibilidade; Three.js poderá renderizar HUD ou elementos ancorados no mundo. Canvas arbitrário não é o caminho padrão para UI interativa porque enfraquece semântica e acessibilidade. Nenhum renderer controla estado lógico.

```text
Kernel/Lua
   │ UiViewModel
   ▼
UI renderer
   │ UiIntent
   ▼
Kernel no próximo tick
```

`UiViewModel` é produzido por um projector read-only e contém tela, nós, roles, chaves de localização com parâmetros, estado, foco, seleção, ações permitidas, navegação e transições. Todo elemento interativo possui ID estável e nome semântico. Localização resolve texto no host, mas testes podem fixar locale para obter evidência reproduzível.

Além dos pixels, a engine expõe uma árvore de inspeção textual:

```json
{
  "screen": "shop",
  "focus": "offer.card.solar_echo",
  "nodes": [
    {
      "id": "offer.card.solar_echo",
      "role": "button",
      "label": "Comprar Eco Solar por 120 moedas",
      "enabled": true,
      "actions": ["confirm", "inspect"]
    }
  ]
}
```

O `UiViewModel` descreve a intenção semântica. Depois do layout, o renderer produz separadamente um `RenderedUiSnapshot` com bounds, visibilidade, clipping, foco efetivo, texto resolvido e propriedades de acessibilidade. Essa distinção impede que o agente confunda “o botão deveria existir” com “o botão realmente apareceu e pode ser acionado”.

As duas representações permitem que agentes naveguem, testem acessibilidade e entendam a interface sem depender apenas de visão computacional. Screenshot continua obrigatório para revisar composição, legibilidade e estética.

Layouts devem cobrir desktop, telefone em retrato e paisagem, tablet, safe areas, escala de texto, touch targets e navegação completa por controle. Breakpoints são dados validados, não condicionais espalhadas por componentes.

## 15. Input

Hosts traduzem dispositivos físicos para ações lógicas. Gameplay nunca lê keycodes, coordenadas brutas ou botões de fabricante.

```text
teclado / mouse / gamepad / touch / gesto
                    │
                    ▼
             Input mapper do host
                    │
                    ▼
      confirm / cancel / move / inspect / drag
                    │
                    ▼
                InputPacket
```

Bindings são JSONC e suportam remapeamento, dead zones, chording e perfis de acessibilidade. Input contém tick-alvo, device class, action, phase, valor lógico normalizado e sequência. Ações de UI e de mundo usam o mesmo mecanismo registrável em replay.

Pointer, touch e ray casting são resolvidos na apresentação para um alvo semântico estável ou para valores lógicos normalizados antes de entrar no kernel. Jogos de ação podem receber vetores como `move(x, y)` e `aim(x, y)`; nunca dependem diretamente de pixels, DPI ou coordenadas DOM.

## 16. Áudio e hápticos

Gameplay emite intenções semânticas como `audio.card.score` ou `haptic.impact.medium`. O host escolhe backend, codec, dispositivo e política de interrupção.

O protocolo oferece buses, prioridade, loop intent, spatial intent e deduplication key. Música e ambiência persistentes pertencem ao snapshot; efeitos one-shot pertencem ao stream de eventos.

## 17. Hosts e serviços de plataforma

Um host possui um núcleo obrigatório pequeno e anuncia serviços opcionais por capability. Isso evita implementações vazias de comércio, cloud ou hápticos em plataformas que não os suportam.

```ts
interface GameHost {
  lifecycle: LifecycleService;
  storage: StorageService;
  input: InputService;
  audio: AudioService;
  display: DisplayService;
  services: ServiceRegistry;
  capabilities: HostCapabilities;
}
```

`ServiceRegistry` resolve contratos tipados como haptics, achievements, identity, cloud save, commerce e telemetry. Ausência é um resultado explícito, nunca `null` inesperado. `game validate --target` falha antes do build quando o jogo declara um serviço obrigatório que o host não oferece; serviços opcionais precisam de fallback descrito no manifest.

Implementações iniciais:

- `BrowserHost`;
- `ElectronHost`;
- `CapacitorAndroidHost`;
- `CapacitorIosHost`;
- `NativeHeadlessHost` para testes desde a fase 1;
- `NativeDiagnosticHost` visual em fase posterior.

Hosts futuros de PlayStation, Xbox e Nintendo implementam os mesmos contratos em repositórios privados quando exigido por NDA.

### 17.1 Serviços externos

Chamadas de plataforma seguem este fluxo:

```text
simulação emite ServiceRequest com idempotency key
       │
       ▼
host valida permissão e executa
       │
       ▼
ServiceResult é entregue em boundary de tick
       │
       ▼
resultado relevante é gravado no replay
```

O manifest classifica cada request:

- `notification`: efeito idempotente que não retorna à simulação, como telemetria;
- `operation`: produz `ServiceResult` explícito, como consultar entitlement;
- `transaction`: operação durável com reconciliação, como compra ou cloud write.

Conquistas, telemetria e overlay não alteram gameplay. Compras, identidade e cloud save podem influenciar estado e por isso exigem resultados explícitos, idempotência, timeout, cancelamento, reconciliação após crash e cenários de falha. O host nunca inventa sucesso offline para uma transação.

### 17.2 Lifecycle mobile

Os hosts mobile tratam pause, resume, background, foreground, pressão de memória, interrupção de áudio, orientação, safe area e perda de contexto. Antes de suspensão:

1. interromper novos ticks;
2. parar no próximo boundary de tick confirmado;
3. gerar checkpoint rápido desse estado confirmado;
4. solicitar persistência ao host;
5. silenciar áudio;
6. liberar caches descartáveis.

Se a plataforma encerrar o processo antes do próximo boundary, o host preserva o último checkpoint confirmado; ele não interrompe a aplicação de um lote pela metade. Scripts Lua distribuídos em builds comerciais são empacotados e assinados com o aplicativo. Download de código capaz de mudar o comportamento do produto não faz parte da arquitetura inicial.

## 18. Saves, checkpoints e cloud save

O kernel serializa apenas estado lógico. O host persiste bytes; renderers nunca entram no save.

Um save contém:

- versão do envelope;
- versão do jogo e da engine;
- versão dos schemas;
- hash do content pack;
- seed e estado dos RNG streams;
- estado autoritativo;
- metadados mínimos;
- checksum e, quando aplicável, autenticação;
- cadeia de migrations suportada.

Escrita local deve ser atômica, manter último backup válido e suportar recuperação após interrupção. Migrations são puras e testadas contra fixtures históricas.

Cloud save não tenta mesclar mundos arbitrariamente. O contrato detecta conflito e aplica uma política declarada pelo jogo — por exemplo, escolher checkpoint mais avançado com confirmação do usuário — preservando ambas as cópias até a resolução.

## 19. Replays

Um replay registra:

- versão do formato;
- hash do executável lógico e do conteúdo;
- seed e configuração inicial;
- ações lógicas ordenadas;
- resultados externos que afetaram a simulação;
- checkpoints opcionais;
- hashes canônicos em intervalos conhecidos.

O runner deve localizar o primeiro tick divergente e produzir diff semântico do estado, eventos recentes e RNG streams consumidos. Replays de regressão importantes tornam-se fixtures versionadas.

Compatibilidade de replay é declarada por janela de versões. Quando não for possível preservar reprodução exata, a CLI deve falhar com explicação e nunca reproduzir silenciosamente sob regras diferentes.

## 20. Assets, materiais e pipeline

Conteúdo referencia IDs semânticos:

```jsonc
{
  "model": "character.skeleton.archer",
  "material": "material.skeleton.toon",
  "audio": "audio.skeleton.attack"
}
```

Todo asset possui manifest com origem, autoria/licença, hash, status, targets e configurações de importação.

```jsonc
{
  "id": "art.card.solar_echo",
  "type": "texture",
  "source": "generated",
  "license": "project_owned",
  "status": "production",
  "targets": ["web", "desktop", "mobile"]
}
```

Pipeline:

```text
fonte ─> validação ─> normalização ─> cooker por target ─> pack ─> manifest com hashes
```

Materiais usam modelos semânticos limitados no início: unlit, PBR simples, toon, transparente, partículas e UI. Shader customizado deve declarar portabilidade e fallback. Asset sem origem ou licença aceitável bloqueia build de release.

## 21. Perfis de capacidade e budgets

Perfis controlam resolução interna, tamanho de textura, sombras, partículas, pós-processamento, LOD, draw distance, caches, vozes de áudio e limites de memória.

Cada perfil possui budgets verificáveis, não apenas opções:

```jsonc
{
  "id": "mobile-low",
  "render": {
    "scale": 0.7,
    "maxTextureSize": 1024,
    "maxParticles": 300,
    "shadows": "off"
  },
  "budgets": {
    "frameP95Ms": 33.3,
    "startupP95Ms": 4000,
    "memoryPeakMiB": 512,
    "downloadMiB": 150
  }
}
```

Os valores acima são ilustrativos. Budgets aprovados precisam indicar dispositivo de referência, margem e data de revisão.

O benchmark registra hardware, OS, backend gráfico, versão, cenário e variância. Resultados de máquinas não comparáveis não substituem baselines controladas.

## 22. Capacidades reutilizáveis

Uma capacidade é um pacote versionado que pode conter Lua, schemas, conteúdo, projeções, componentes de apresentação, testes, cenários, métricas e receitas para agentes.

Exemplos: `cards.deck`, `inventory.core`, `dialogue.branching`, `combat.turn_based`, `movement.action`.

### 22.1 Regra de extração

```text
primeiro uso real ─> permanece no jogo
segundo uso diferente ─> diferenças são observadas
API mínima comum ─> capacidade extraída
terceiro uso ─> API é estabilizada ou revisada
```

Cada capacidade declara versão, maturidade, dependências, plataformas, budgets, extensões e exemplos em seu próprio manifest. `CAPABILITIES.json` é um índice gerado desses manifests, nunca uma segunda fonte editada manualmente. A IA consulta o índice antes de criar um sistema concorrente.

Capacidades não podem furar o sandbox nem importar um renderer por conveniência. Extensão nativa é rara, revisada separadamente e precisa fornecer fallback ou declarar targets incompatíveis.

## 23. Experiência AI-first no repositório

### 23.1 Ordem de leitura

`AGENTS.md` deve mandar uma sessão nova ler, nesta ordem:

1. `AGENTS.md`, antes de executar qualquer comando;
2. `game doctor --format json`;
3. `.ludivra/project-state.json`;
4. `game.jsonc` e a parte relevante de `GAME_DESIGN.md`;
5. `DECISIONS.md` e `BACKLOG.md` filtrados para a tarefa;
6. `CAPABILITIES.json`;
7. contratos e receitas diretamente relacionados;
8. `architecture.md` quando a tarefa tocar uma fronteira, contrato público ou decisão de engine.

O agente não precisa carregar toda a documentação para cada alteração. A documentação deve ter índice, links estáveis e receitas curtas orientadas a tarefas.

### 23.2 Memória durável

- Git é o histórico canônico de código e conteúdo;
- `.ludivra/project-state.json` é um resumo gerado e validado, não um diário manual;
- `DECISIONS.md` indexa ADRs arquiteturais;
- `BACKLOG.md` contém trabalho futuro priorizado;
- manifests de `reports/runs/` indexam evidências imutáveis por execução;
- `SESSION_REPORT.md` aponta para a última execução e pode ser regenerado.

Um estado gerado nunca afirma “passing” sem referenciar `runId`, commit, comando e artefato que comprovem isso.

### 23.3 Especificação da intenção

Pedidos relevantes são convertidos em critérios observáveis antes da implementação. Cada cenário pode referenciar um `requirementId`, permitindo rastrear intenção → mudança → teste → evidência.

## 24. CLI AI-first

A CLI `game` é a API operacional estável da engine. APIs internas de scripts de build não são interface para agentes.

### 24.1 Comandos essenciais

```text
game doctor       verifica ambiente, locks e ferramentas
game new          cria jogo a partir de template versionado
game inspect      descreve projeto, cena, estado ou capacidade
game validate     valida conteúdo, arquitetura e assets
game test         executa suites e contratos
game simulate     executa cenários headless em lote
game run          inicia host gerenciado
game capture      navega cenário e captura imagem/vídeo
game replay       grava, reproduz e compara replays
game benchmark    mede budgets por perfil
game build        produz build reproduzível
game package      cria pacote local por target
game report       agrega evidências de um run
game explain      explica diagnóstico por código estável
```

`publish`, assinatura e envio a lojas não fazem parte do conjunto essencial e, quando existirem, serão comandos separados com confirmação e política de permissões.

### 24.2 Envelope de saída estruturada

Com `--format json`, stdout contém somente um documento JSON; logs humanos vão para stderr.

```json
{
  "schemaVersion": 1,
  "runId": "run_01J...",
  "operation": "validate",
  "status": "failed",
  "exitCode": 2,
  "durationMs": 842,
  "diagnostics": [
    {
      "code": "CONTENT_REFERENCE_NOT_FOUND",
      "severity": "error",
      "file": "content/cards/solar_echo.jsonc",
      "line": 14,
      "column": 16,
      "path": "presentation.artwork",
      "message": "Asset ID inexistente: art.card.solar_ecco",
      "suggestions": ["art.card.solar_echo"],
      "automaticFix": { "available": true, "safe": true }
    }
  ],
  "artifacts": [],
  "nextActions": ["Corrigir a referência e executar game validate novamente"]
}
```

Diagnósticos possuem código estável, severidade, origem, causa, impacto, sugestões e classificação de correção. Exit codes são documentados e consistentes em todos os comandos.

### 24.3 Segurança operacional

- comandos mutáveis oferecem `--dry-run` quando útil;
- correções automáticas mostram diff e só aplicam alterações classificadas como seguras;
- processos iniciados por `game run` têm lifecycle gerenciado e encerramento garantido;
- operações destrutivas usam alvos explícitos, nunca globs amplos;
- artefatos são escritos apenas em diretórios declarados;
- cada operação registra versões de ferramentas e configuração efetiva.

## 25. Harness de execução e evidências

O harness é uma parte de primeira classe da engine. Um cenário pode:

1. carregar seed, save ou estado inicial;
2. escolher host e perfil;
3. enviar ações lógicas por tick;
4. esperar condição lógica ou nó semântico de UI;
5. afirmar invariantes;
6. capturar estado, screenshot, vídeo e trace;
7. medir performance;
8. encerrar com resultado estruturado.

Exemplo conceitual:

```jsonc
{
  "id": "shop.buy-solar-echo",
  "requirements": ["SHOP-004"],
  "given": { "seed": 42, "fixture": "run.before-shop" },
  "steps": [
    { "waitFor": { "screen": "shop" } },
    { "action": "select", "target": "offer.card.solar_echo" },
    { "capture": "shop-selected" },
    { "action": "confirm" }
  ],
  "assert": [
    {
      "query": {
        "id": "inventory.contains",
        "args": { "itemId": "card.solar_echo" }
      },
      "equals": true
    },
    { "metric": "currency.spent", "equals": 120 }
  ]
}
```

Steps, queries e assertions pertencem a um vocabulário versionado por schema. Strings com expressões executáveis não são permitidas; isso evita criar acidentalmente uma segunda linguagem de scripting dentro de JSONC.

### 25.1 Protocolo de controle do host

O harness precisa controlar o jogo por uma interface explícita. `game run --control` inicia um endpoint local de desenvolvimento e negocia versão de protocolo, host, target, perfil e content hash. O vocabulário mínimo inclui:

```text
health / load_scenario / act / wait_for / inspect
capture / start_video / stop_video / metrics / shutdown
```

O transporte pode ser stdio, socket local ou WebSocket de loopback e é detalhe de adapter. O contrato e os payloads são os mesmos. A CLI é dona do processo, aguarda readiness, aplica timeouts e sempre tenta encerramento limpo.

Esse endpoint:

- só existe em builds de desenvolvimento e teste;
- usa token aleatório de uma execução e bind local;
- não oferece `eval`, shell, leitura arbitrária de arquivo ou proxy de rede;
- expõe `UiViewModel`, `RenderedUiSnapshot`, estado de inspeção sanitizado e ações semânticas;
- registra cada comando no artifact manifest;
- é removido de builds de produção por teste de composição do pacote.

### 25.2 Artifact bundle

Cada execução material gera:

```text
reports/runs/<run-id>/
├── manifest.json
├── summary.md
├── commands.json
├── diagnostics.json
├── metrics.json
├── traces/
├── replays/
├── screenshots/
├── videos/
└── builds/
```

`manifest.json` contém commit, dirty-state, versões, target, perfil, hashes e relações entre requisitos e evidências.

Runs são imutáveis, mas builds, vídeos e traces grandes não devem inflar o Git. O repositório versiona manifests, summaries, baselines aprovadas e replays escolhidos como fixtures. Artefatos pesados ficam no workspace efêmero ou em armazenamento de CI, referenciados por URI content-addressed e hash. A resposta no chat deve deixar claro quais artefatos continuam disponíveis após a sessão.

### 25.3 Avaliação visual

A validação combina:

- assertions semânticas de UI;
- screenshot em tamanhos canônicos;
- comparação visual com tolerâncias e máscaras;
- detecção de overflow, texto cortado, contraste e touch targets;
- inspeção multimodal do agente;
- vídeo para animação, timing e transições.

Avaliação por IA gera parecer e achados, mas não atualiza baseline automaticamente. Mudanças de baseline são diffs versionados e intencionais.

## 26. Observabilidade

Logs são estruturados e correlacionados por `runId`, tick, entidade, cenário e host. Métricas usam nomes declarados em registry para evitar grafias concorrentes.

O modo de diagnóstico oferece:

- timeline de input → comandos → eventos → projeções;
- inspeção de entidade por handle sem expor ponteiros;
- hashes e diffs de estado;
- contadores de Lua, bridge, renderer e assets;
- flame/tracing hooks por camada;
- export sanitizado anexável ao relatório.

Telemetria de produção é opt-in, minimizada e separada da telemetria local de desenvolvimento.

## 27. Testes e fitness functions arquiteturais

### 27.1 Correção

- unit tests de kernel e SDK;
- testes de conteúdo e referências;
- cenários de gameplay;
- saves e migrations históricas;
- replay e primeiro tick divergente;
- invariantes e property-based tests para sistemas críticos.

### 27.2 Portabilidade

- golden vectors do RNG;
- native/WASM state-hash equivalence;
- leitura cruzada de save e replay;
- conformidade de host e serviços;
- compatibilidade de protocolo N/N-1 quando declarada.

### 27.3 Mobile

- pause/resume e background/foreground;
- save durante suspensão interrompida;
- rotação e safe areas;
- navegação touch;
- pressão de memória;
- perda e restauração de contexto gráfico;
- interrupção de áudio.

### 27.4 Regras verificadas automaticamente

- kernel não importa renderer, DOM, Electron ou Capacitor;
- gameplay não importa renderer nem SDK de plataforma;
- somente adapters autorizados importam SDKs externos;
- Lua não acessa APIs proibidas;
- input físico não aparece em gameplay;
- RNG não autorizado falha no lint;
- estado autoritativo não usa tipos não determinísticos proibidos;
- conteúdo usa IDs semânticos, não caminhos físicos;
- saves não contêm tipos de apresentação;
- assets possuem origem, licença e hash;
- dependências respeitam o grafo permitido;
- arquivos gerados estão sincronizados;
- mudanças públicas atualizam schema, testes e documentação.

Essas regras são “fitness functions”: rodam no CI e impedem degradação silenciosa da arquitetura.

### 27.5 Gates proporcionais ao risco

Nem toda edição executa a matriz inteira. O conjunto é determinado pelo grafo de impacto e registrado no report:

- loop local: validação, testes afetados e ao menos um cenário representativo;
- integração: suites completas das camadas alteradas, arquitetura e equivalência native/WASM quando aplicável;
- nightly: corpus amplo de replays, fuzz/property tests, benchmarks e matriz de hosts disponível;
- release: todos os targets declarados, dispositivos reais exigidos, licenças, SBOM, pacote e smoke test instalado.

Um agente pode executar testes adicionais. Ele não pode omitir um gate obrigatório sem registrar status `not_run`, motivo e risco; `not_run` nunca equivale a `passing`.

## 28. Versionamento e compatibilidade

A engine versiona separadamente:

- distribuição da engine;
- C ABI do runtime;
- presentation protocol;
- schemas de conteúdo;
- formato de save;
- formato de replay;
- API Lua;
- capacidades.

Na primeira versão, esses contratos viajam na mesma release da engine para evitar vários release trains prematuros. As versões separadas identificam compatibilidade de dados e protocolo; só se tornam pacotes publicados independentemente quando um consumidor real exigir evolução desacoplada.

`engine.lock` fixa versões e hashes resolvidos. Uma matriz declara quais versões podem coexistir. Mudança incompatível exige migration, mensagem acionável e nota no changelog; “tentar e ver se funciona” não é uma política de compatibilidade.

O jogo deve poder atualizar engine em branch isolada, executar migrations e comparar um corpus de replays antes de aceitar o novo lock.

## 29. Segurança, supply chain e licenciamento

- dependências e toolchains são fixadas por lock e verificadas por hash;
- builds registram provenance e produzem SBOM para release;
- segredos, certificados e chaves ficam fora do repositório e do runtime normal do agente;
- logs e relatórios removem tokens e dados pessoais;
- Lua permanece sandboxed e conteúdo remoto não executa código;
- plugins e capacidades declaram permissões;
- assets sem licença comprovada bloqueiam release;
- builds locais são inequivocamente diferentes de releases assinadas;
- publicação comercial requer autorização humana explícita;
- SDKs sob NDA ficam em repositórios e runners privados;
- o CLI oferece política de rede por comando e builds reproduzíveis podem rodar sem rede após o fetch aprovado.

## 30. Empacotamento por plataforma

### 30.1 Browser

WASM + TypeScript + renderer + content/asset packs. Deve suportar carregamento progressivo, cache versionado e fallback claro para capacidade gráfica ausente.

### 30.2 Desktop e Steam

Electron fornece janela, lifecycle, filesystem controlado, crash reporting e integração nativa. Steamworks vive no adapter do host; gameplay usa contratos genéricos de achievement, cloud, user e overlay.

### 30.3 Android e iOS

Capacitor embute o mesmo runtime web e fornece adapters nativos para lifecycle, storage, haptics, compras, identidade, permissões e serviços das lojas. Cada plugin nativo precisa de mock, teste de contrato e tratamento para indisponibilidade.

### 30.4 Consoles

Não há promessa de executar Three.js, Electron, Capacitor ou DOM. São preservados kernel, Lua, conteúdo compilado, saves, replays, input lógico, view models, protocolos e testes. São substituídos renderer, renderer de UI, áudio, host, shaders específicos, parte do cooker e adapters de plataforma.

O `NativeHeadlessHost` prova cedo a portabilidade lógica. Um `NativeDiagnosticHost` posterior desenha primitivas, recebe input e reproduz áudio básico. O port de console só começa com acesso oficial, justificativa comercial e testes de conformidade do kernel já verdes.

## 31. Estrutura de repositórios

### 31.1 Engine

```text
ludivra/
├── kernel/
├── runtime-c-api/
├── lua-sdk/
├── schemas/
├── content-compiler/
├── asset-cooker/
├── presentation-protocol/
├── control-protocol/
├── renderer-three/
├── ui-renderers/
├── hosts/
│   ├── browser/
│   ├── electron/
│   ├── capacitor-android/
│   ├── capacitor-ios/
│   ├── native-headless/
│   └── native-diagnostic/
├── platform-contracts/
├── platform-adapters/
├── capabilities/
├── harness/
├── cli/
├── templates/
├── examples/
├── docs/
│   ├── contracts/
│   ├── guardrails/
│   ├── recipes/
│   └── adr/
├── AGENTS.md
├── architecture.md
├── CAPABILITIES.json
└── toolchain.lock
```

### 31.2 Jogo

```text
my-game/
├── game.jsonc
├── engine.lock
├── AGENTS.md
├── GAME_DESIGN.md
├── BACKLOG.md
├── DECISIONS.md
├── SESSION_REPORT.md
├── .ludivra/
│   ├── project-state.json
│   └── permissions.jsonc
├── content/
├── scripts/
├── presentation/
├── assets/
├── scenarios/
├── tests/
└── reports/
```

A engine publica CLI, runtime native/WASM, SDK Lua, schemas, pacotes TypeScript, templates e exemplos. Jogos consomem releases fixadas; Git submodule não é o fluxo padrão.

## 32. Fluxo de uma sessão remota

1. ler `AGENTS.md` e suas regras antes de executar comandos;
2. executar `game doctor --format json`;
3. inspecionar estado e último run comprovado;
4. consultar capacidades existentes;
5. converter o pedido em critérios observáveis;
6. escolher uma mudança limitada ou um vertical slice;
7. implementar primeiro no jogo;
8. alterar a engine apenas diante de lacuna reutilizável comprovada;
9. executar validação e testes rápidos durante o desenvolvimento;
10. rodar cenários e simulações relevantes;
11. executar o jogo pelo harness;
12. navegar e inspecionar árvore semântica;
13. gerar e analisar screenshots/vídeo;
14. rodar replays, benchmarks e targets proporcionais ao risco;
15. produzir build quando fizer parte do critério;
16. gerar artifact bundle e atualizar estado derivado;
17. registrar ADR apenas para decisão arquitetural durável;
18. responder no chat com resultado, evidências, limitações e uma próxima prioridade.

## 33. Critérios de conclusão

### 33.1 Funcionalidade

Uma funcionalidade está concluída quando:

- atende critérios observáveis vinculados ao pedido;
- valida e compila;
- possui teste, cenário ou invariante proporcional ao risco;
- funciona em execução real;
- respeita fronteiras arquiteturais;
- produz evidência visual quando aplicável;
- atualiza schemas, receitas e contratos afetados;
- não introduz regressão relevante de budget;
- deixa diagnóstico suficiente para a próxima sessão.

### 33.2 Vertical slice

Um vertical slice inclui começo, loop, fim, vitória/conclusão, derrota/falha, controles, feedback audiovisual, UI navegável, persistência quando necessária, pelo menos um perfil desktop e um mobile quando esses targets estiverem no escopo, build reproduzível e relatório de limitações.

### 33.3 Engine comprovada

A Ludivra só será considerada uma engine reutilizável quando:

1. dois jogos materialmente diferentes forem construídos sem copiar a implementação interna do primeiro;
2. ambos consumirem a mesma release da engine e capacidades compartilhadas justificáveis;
3. sessões novas conseguirem modificá-los apenas pelo estado do repositório;
4. o harness produzir evidência técnica e visual integralmente apresentável no chat;
5. native e WASM reproduzirem o mesmo corpus lógico de replays.

## 34. Roadmap orientado a riscos

### Fase 0 — Contratos executáveis

- monorepo, toolchain lock e CI;
- licença open source, política de contribuição e segurança;
- schemas iniciais e envelope da CLI;
- C ABI mínima;
- scenario format e artifact manifest;
- testes de fronteira de dependências.

### Fase 1 — Simulação portátil mínima

- kernel C++ e runner native headless;
- build WebAssembly;
- Lua sandbox;
- fixed tick, comandos, eventos, RNG e hash de estado;
- save, replay e equivalência native/WASM;
- CLI `doctor`, `validate`, `test`, `simulate` e `inspect`.

### Fase 2 — Loop visual e primeiro vertical slice

- presentation protocol;
- bridge em buffers;
- renderer Three.js e BrowserHost;
- UI view model e árvore semântica;
- input abstrato e áudio;
- harness de captura;
- primeiro card roguelite, ainda sem extrair kit genérico.

### Fase 3 — Desktop comercial

- ElectronHost;
- empacotamento e atualização;
- Steam adapters;
- crash reports, cloud save e achievements;
- budgets e processo de release reproduzível.

### Fase 4 — Mobile

- hosts Capacitor Android/iOS;
- touch, layout adaptativo e safe areas;
- lifecycle, checkpoints e perda de contexto;
- serviços de loja e perfis de hardware;
- suites reais em dispositivos.

### Fase 5 — Reuso comprovado

- segundo jogo de gênero ou dinâmica diferente;
- extração das capacidades usadas por ambos;
- revisão das APIs a partir das diferenças reais.

### Fase 6 — Diagnóstico nativo visual

- renderer mínimo nativo de primitivas;
- input e áudio básicos;
- UI de diagnóstico;
- replay visual e profiling fora do stack web.

### Fase 7 — Console, somente com justificativa

- acesso oficial e infraestrutura privada;
- renderer/UI/audio/host nativos;
- cooker por plataforma;
- testes de conformidade, memória, suspend/resume e certificação.

## 35. Riscos principais e mitigação

| Risco | Mitigação arquitetural |
|---|---|
| Bridge C++/WASM/TS complexa | C ABI pequena, bindings gerados, buffers versionados, ownership explícito |
| Falso determinismo | fixed-point/integer, ordem estável, RNG versionado, hashes e corpus native/WASM |
| Lua dinâmica demais | sandbox, budgets, lint, schemas, comandos validados e promoção mensurada |
| UI acoplada ao DOM | `UiViewModel`, `UiIntent`, árvore semântica e renderer substituível |
| Three.js vazar para gameplay | pacote exclusivo, grafo de imports e fitness functions no CI |
| Agente “validar” apenas por compilação | harness obrigatório, cenários, capturas, vídeo, trace e artifact bundle |
| Documentação ficar desatualizada | estado derivado, contratos executáveis, receitas testadas e links por diagnóstico |
| Abstração prematura | extrair após dois usos diferentes; estabilizar após o terceiro |
| Portabilidade apenas teórica | runner native desde a fase 1 e equivalência contínua |
| Serviços externos quebrarem determinismo | requests/results por tick, idempotência e replay de resultados |
| Perda de save mobile/cloud | commit atômico, backup, checkpoints e política explícita de conflito |
| Automação causar dano ou publicar | permissões, dry-run, comandos separados e autorização humana |
| Console exigir retrabalho maior | assumir substituição de apresentação/host e preservar contratos caros |

## 36. Decisões que exigem ADR antes da implementação

Este documento define a direção, mas as escolhas abaixo precisam de protótipo e ADR com benchmark:

- algoritmo e representação de fixed-point;
- PRNG e estratégia de streams;
- formato binário de content pack e presentation buffers;
- mecanismo de bindings da C ABI;
- versão e configuração exatas de Lua;
- estratégia de memória compartilhada/cópia no WASM;
- renderer de UI inicial;
- backend de áudio por host;
- ferramenta de build C++ e layout final do monorepo;
- política de compatibilidade N/N-1 por protocolo;
- backend do `NativeDiagnosticHost`;
- estratégia de assinatura e distribuição por plataforma.

Um ADR deve registrar contexto, decisão, consequências, alternativas rejeitadas, evidência e condição de revisão. Não se cria ADR para detalhes locais reversíveis.

## 37. Regras resumidas

```text
Usuário expressa intenção no chat.
Agente entende o projeto pelos arquivos e pelo estado derivado.
JSONC descreve dados e cenários.
Lua expressa gameplay por comandos e eventos.
C++ mantém a simulação autoritativa, portátil e determinística.
Protocolos projetam apresentação, UI e efeitos externos.
Three.js entrega rapidamente o primeiro renderer.
Electron atende desktop/Steam; Capacitor atende Android/iOS.
Hosts nativos futuros substituem apresentação e integrações, não as regras.
A CLI executa todo o fluxo e produz evidências estruturadas.
Git e artifact bundles tornam cada sessão auditável e continuável.
```

## 38. Conclusão

A Ludivra é factível se for construída como um sistema de contratos executáveis e ciclos de evidência, não como uma coleção crescente de helpers gráficos.

Seu diferencial não será usar IA para escrever código. Será permitir que um agente descubra contexto, implemente, execute, observe, diagnostique e entregue um jogo pelo mesmo canal conversacional, com fronteiras fortes e resultados reproduzíveis.

O teste definitivo é simples de formular e difícil de falsificar:

```text
abrir uma sessão nova
        ↓
descrever ou alterar um jogo
        ↓
o agente implementa um slice limitado
        ↓
executa e inspeciona lógica, UI e imagem
        ↓
entrega evidências e build no chat
        ↓
outra sessão continua apenas pelo Git
```

Quando esse fluxo funcionar de ponta a ponta para dois jogos diferentes, com equivalência lógica native/WASM e sem operação manual obrigatória fora do chat, a arquitetura terá cumprido seu propósito.
