# Gates de mudança

Nenhuma mudança pode ser concluída sem passar por estes gates. Evidência é obrigatória.

## Gate 1 — Antes de implementar

| Verificação | Evidência mínima |
|---|---|
| Contexto mínimo | buscas e arquivos relevantes listados |
| Busca por reuso | símbolos, módulos e capacidades encontrados |
| Proprietário definido | módulo que deve receber a mudança |
| Boundary preservado | dependências novas e direção declaradas |
| Escopo limitado | critério de aceitação observável |
| ADR avaliado | `não necessário` com motivo ou ADR criado |

Falhar neste gate proíbe iniciar a implementação.

## Gate 2 — Durante a implementação

- não existe segunda implementação da mesma regra;
- não existe nova fonte de verdade concorrente;
- não existe deep import, ciclo ou acesso lateral;
- API pública só cresceu quando um consumidor atual exigiu;
- dependências, fallbacks e erros permanecem explícitos;
- mudança e testes continuam no menor escopo coeso.

Ao descobrir violação, pare, corrija a estrutura e só então continue.

## Gate 3 — Antes de concluir

| Verificação | Resultado exigido |
|---|---|
| Formatação e análise estática | `PASS` |
| Schemas e conteúdo | `PASS` |
| Testes afetados | `PASS` |
| Teste de regressão, se bug | `PASS` |
| Regras de imports e ciclos | `PASS` |
| Busca final por duplicação | `PASS` |
| Determinismo/native-WASM, se afetado | `PASS` |
| Save/replay/migration, se afetado | `PASS` |
| Cenário e captura, se visual | `PASS` |
| Documentação/contrato, se público | `PASS` |
| Artefatos e limitações reportados | `PASS` |
| Economia de contexto aplicada | `PASS` |

Quando a CLI existir, use seus comandos estruturados. Durante o bootstrap, execute as ferramentas equivalentes do repositório e registre comandos exatos. Ferramenta ainda inexistente recebe `NOT_AVAILABLE`, nunca `PASS`.

## Gate 4 — Relatório

O relatório final deve conter somente:

1. resultado entregue;
2. módulo proprietário;
3. contratos públicos alterados;
4. evidências e comandos executados;
5. itens `NOT_RUN` ou `NOT_AVAILABLE`, com risco;
6. limitações reais;
7. próxima prioridade única, se houver.

## Rejeição automática

A mudança é rejeitada se contiver:

- código copiado ou regra duplicada;
- módulo genérico sem domínio proprietário;
- import proibido, ciclo ou acoplamento a vendor fora de adapter;
- teste desabilitado, erro ignorado ou fallback silencioso;
- dependência não justificada ou sem versão fixa;
- mudança pública sem contrato e teste;
- estado “passing” sem evidência reproduzível;
- artefato gerado editado manualmente;
- TODO sem rastreamento;
- alteração oportunista fora do escopo.

## Exceções

Exceção exige registro aprovado antes do merge com:

- regra afetada;
- escopo exato;
- motivo e alternativas rejeitadas;
- risco aceito;
- responsável;
- prazo;
- issue e teste que comprovam a remoção.

Não admitem exceção: segredo no repositório, risco conhecido de perda de dados, falsificação de teste/evidência, schema ou protocolo duplicado, dependência direta de vendor no kernel/gameplay e publicação sem autorização.

Guardrails não podem ser alterados no mesmo change set para legitimar uma exceção.
