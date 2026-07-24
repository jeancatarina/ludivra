# ADR 0028 — Diagnose, Repair, Verify e classes de reparo

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de habilitar `fix --apply` para qualquer classe nova de operação
- Complementa: [ADR 0009](0009-canonical-state-and-run-evidence.md) e [ADR 0010](0010-local-control-protocol-and-scenario-harness.md)
- Fase: 11

## Contexto

Diagnósticos estruturados, artifact manifests, replay e cenários já existem. O que falta é o ciclo completo de reparo e a fronteira do que uma sessão pode alterar sozinha.

Existe também uma duplicação concreta e crescente: códigos de diagnóstico são literais de string espalhados pelo código da CLI. Já são dezenas — de `AUDIO_SOURCE_MISSING` a `CONTROL_WAIT_TIMEOUT` — sem registro único, sem severidade declarada, sem causa e sem próxima ação associada. `game explain <code>` não pode existir sobre literais espalhados, e cada ADR desta série adicionou códigos novos, o que agrava o problema.

O risco maior da Fase 11 não é técnico. É uma sessão que "corrige" algo aplicando patch plausível sem reproduzir o defeito, sem cenário de regressão e sem comparar evidência — e reporta sucesso.

## Decisão

### Registro único de códigos de diagnóstico

Todo código de diagnóstico passa a viver em um registro versionado, com id, severidade, template de mensagem, causa provável, próximas ações e classe de reparo. Bindings são gerados pelo mecanismo de contratos existente.

Literal de código inline passa a ser proibido: código não registrado é `DIAGNOSTIC_CODE_UNREGISTERED` e falha a validação. `game explain <code>` lê esse registro, e é ele que torna a saída resumida da CLI utilizável sob demanda.

### O ciclo é obrigatório e ordenado

```text
detectar → reproduzir → minimizar → rastrear → hipótese
        → dry-run → aplicar → regressão → comparar evidências
```

Cada etapa produz artefato no bundle do run. Pular uma etapa não é atalho: é recusa. Um defeito que não reproduz é `DIAGNOSE_NOT_REPRODUCIBLE` e não recebe reparo aplicado — investigação continua, mas não há patch sobre hipótese.

### Classes de reparo

A classe é propriedade **do tipo de operação**, declarada no registro, e não uma avaliação caso a caso:

| Classe | Significado |
|---|---|
| `automatic-safe` | mecânico, reversível e verificável — por exemplo regenerar artefato derivado, reordenar chaves, corrigir formatação |
| `automatic-with-review` | patch aplicado com diff obrigatório na resposta e cenário de regressão |
| `suggestion-only` | a sessão descreve a correção; não escreve |
| `human-required` | exige decisão de pessoa |

Nunca `automatic-*`, em nenhuma circunstância: decisão artística, segredo, assinatura, publicação, exclusão de dados, decisão comercial, licença, adição de dependência e alteração de guardrail. Tentativa é `REPAIR_CLASS_FORBIDDEN`.

### Condições de `fix --apply`

`--apply` exige, cumulativamente: artefato de `--dry-run` da mesma revisão, cenário de regressão que falhava antes, classe que permita aplicação e comparação de evidências antes e depois. Faltando qualquer um, a operação é recusada — `REPAIR_DRY_RUN_REQUIRED` ou `REPAIR_REGRESSION_MISSING`.

Reparo aplicado sem cenário que falhasse antes é rejeição automática pelas regras de engenharia, não exceção do fluxo de reparo.

### Comandos

`game diagnose`, `explain`, `fix --dry-run`, `fix --apply` e `verify` existem apenas com operações reais e schemas fechados. Nenhum deles é criado como stub, e nenhum aceita operação livre em texto: o conjunto de operações de reparo é fechado e versionado.

`verify` compara evidências equivalentes. Comparar artefatos de contratos, versões ou perfis diferentes é `VERIFY_EVIDENCE_INCOMPARABLE`, nunca aproximação.

Códigos: `DIAGNOSTIC_CODE_UNREGISTERED`, `DIAGNOSE_NOT_REPRODUCIBLE`, `REPAIR_CLASS_FORBIDDEN`, `REPAIR_DRY_RUN_REQUIRED`, `REPAIR_REGRESSION_MISSING`, `REPAIR_OPERATION_UNKNOWN`, `VERIFY_EVIDENCE_INCOMPARABLE`.

## Consequências

- os códigos espalhados hoje precisam migrar para o registro, o que é pré-requisito de `explain`;
- cada ADR que introduz código passa a alimentar um registro único em vez de literais novos;
- reparo automático fica restrito a operações declaradas, não ao julgamento da sessão;
- "corrigido" passa a exigir cenário que falhava antes e comparação de evidência;
- decisões de licença, publicação, segredo e guardrail ficam fora do alcance de patch automático;
- o conjunto fechado de operações de reparo impede execução de comando arbitrário sob nome de reparo;
- `verify` só compara o que é comparável, o que elimina falso verde entre perfis.

## Alternativas rejeitadas

- **Manter códigos como literais no código:** impede `explain`, severidade declarada e classe de reparo, e duplica conhecimento a cada ADR.
- **Classificar reparo caso a caso pela sessão:** a classificação passaria a depender de quem julga, exatamente onde o risco está.
- **Permitir `--apply` sem dry-run:** remove o único ponto onde o efeito é revisável antes de existir.
- **Aceitar reparo sem cenário de regressão:** produz correção não verificável e reincidência silenciosa.
- **Operações de reparo abertas por texto:** vira execução arbitrária com nome amigável.
- **Aplicar patch sobre defeito não reproduzível:** troca correção por coincidência.
- **Comparar evidências de perfis diferentes com tolerância:** transforma incompatibilidade em falso verde.
