# ADR 0053 — Statecharts determinísticos de gameplay

- Status: aceito
- Data: 2026-07-26
- Revisão: após dois consumidores materialmente diferentes ou antes de adicionar paralelismo de regiões
- Complementa: [ADR 0016](0016-public-lua-sdk-layers-and-escape-hatches.md) e [ADR 0051](0051-animation-graph-and-skeletal-runtime.md)
- Fase: 4

## Contexto

Lua pode implementar estados com condicionais, mas não existe forma pública de inspecionar transição, timeout, estado anterior ou causa. Para personagens, AI, interação e fluxo de partida, implementações ad hoc repetiriam prioridade e lifecycle e seriam difíceis de continuar em outra sessão.

Uma state machine de animação não resolve esse problema: ela escolhe pose e roda fora da autoridade lógica.

## Decisão

### Statechart como dado, handlers como Lua

`statecharts/*.statechart.jsonc` declara estados hierárquicos, estado inicial, eventos aceitos, transições, guards registrados, actions registradas e timers lógicos. O documento não contém expressão nem código.

Guards são queries read-only da camada pública do SDK. Actions emitem comandos pelo mesmo command buffer de qualquer handler Lua. Statechart não recebe acesso mutável especial.

O módulo Lua declara os hooks opcionais `on_statechart_guard(ctx, event)` e
`on_statechart_action(ctx, event)`. O guard retorna estritamente um booleano e
recebe `event.id`, `transition_id`, `from_state` e `to_state`; qualquer tentativa
de escrever por `ctx.commands` ou `ctx.timers` falha com
`STATECHART_GUARD_MUTATION_FORBIDDEN`. A action recebe seu id, fase (`exit`,
`transition` ou `entry`), transição e estados anterior/ativo, e usa o mesmo
command buffer atômico de `on_input`.

### Ordem determinística

Transições são avaliadas por profundidade do estado ativo, prioridade explícita e ID estável. Empate sem precedência é erro de validação. No máximo uma transição por região ocorre em uma rodada; eventos derivados entram na rodada seguinte segundo a ordem pública do tick.

Timers usam ticks ou duração fixed-point lógica. Tempo de parede e frame de apresentação são proibidos. Estado ativo, histórico permitido e timers entram em save, hash e replay.

### Escopo inicial

A primeira versão suporta uma região ativa, hierarquia, entry/exit actions, transições internas/externas e history shallow. Regiões paralelas, behavior tree e planner não entram até dois consumidores demonstrarem necessidade.

`afterTicks` é contado no commit lógico e aceita de 1 a 4.294.967.295 ticks na
fronteira pública. O contador do estado ativo, o histórico shallow e o estado
ativo viajam juntos no save e no replay. Ao sair por transição externa, actions
rodam em ordem `exit → transition → entry`; a entrada de um alvo com history
shallow restaura seu filho lembrado quando houver um.

### Inspeção

Trace registra chart, instância, estado anterior, evento, guards avaliadas, transição escolhida, actions emitidas e estado resultante. A CLI inspeciona o trace causal do cenário; o grafo visual nunca vira fonte de verdade.

Códigos: `STATECHART_SCHEMA_INVALID`, `STATECHART_INITIAL_STATE_MISSING`, `STATECHART_TRANSITION_AMBIGUOUS`, `STATECHART_GUARD_UNREGISTERED`, `STATECHART_ACTION_UNREGISTERED`, `STATECHART_LOGICAL_TIME_REQUIRED`, `STATECHART_EVENT_UNHANDLED`, `STATECHART_GUARD_HANDLER_MISSING`, `STATECHART_GUARD_RESULT_INVALID`, `STATECHART_GUARD_MUTATION_FORBIDDEN` e `STATECHART_ACTION_HANDLER_MISSING`.

## Consequências

- estados importantes tornam-se legíveis, migráveis e inspecionáveis;
- Lua continua dona das regras e comandos, sem engine de comportamento paralela;
- replay consegue explicar por que uma transição ocorreu;
- Animation Graph consome estado lógico sem controlá-lo;
- behavior trees e regiões paralelas permanecem fora até haver prova.

## Alternativas rejeitadas

- **Cada jogo implementar FSM própria:** duplica prioridade, timers e diagnóstico.
- **State machine de animação como gameplay:** renderer passaria a decidir regra.
- **Expressões em strings JSONC:** cria linguagem sem parser, tipos ou sandbox adequados.
- **Actions mutarem estado diretamente:** furam command buffer e atomicidade do tick.
- **Behavior tree universal agora:** abstração maior sem dois usos comprovados.
