# Contrato de engenharia

Este documento é normativo. **DEVE** e **NÃO DEVE** são requisitos verificáveis.

## 1. DRY sem abstração prematura

DRY significa uma única fonte autoritativa para cada regra, contrato, schema, constante, algoritmo e decisão. Não significa criar abstrações para semelhanças acidentais.

1. Código existente DEVE ser pesquisado antes de código novo.
2. Copiar e adaptar uma implementação existente é proibido.
3. A segunda implementação da mesma regra NÃO DEVE ser criada: o conceito comum DEVE ser extraído antes da conclusão.
4. A primeira implementação NÃO DEVE ser generalizada para usos hipotéticos.
5. Schema, protocolo e modelo público DEVEM gerar bindings e validadores; definições manuais paralelas são proibidas.
6. Constantes, defaults, mensagens normativas e feature flags DEVEM possuir um único proprietário.
7. Variações DEVEM usar composição, parâmetros ou adapters; nunca forks `v2`, `new`, `legacy`, `copy` ou equivalentes sem plano de migração aprovado.
8. Módulos genéricos chamados `utils`, `helpers`, `common`, `shared` ou `misc` são proibidos. Todo módulo DEVE nomear o domínio que possui.
9. A definição detalhada de uma regra normativa DEVE existir em um único documento canônico. Checklists podem referenciá-la por nome, sem redefini-la.

Repetição puramente sintática pode permanecer quando extrair aumentaria acoplamento. Ela não pode duplicar conhecimento nem comportamento e DEVE ser demonstravelmente independente.

## 2. Propriedade e módulos

1. Cada responsabilidade DEVE ter exatamente um módulo proprietário.
2. Cada módulo DEVE possuir uma razão principal para mudar.
3. Tudo é privado por padrão. Somente contratos necessários são exportados.
4. Consumidores DEVEM importar pelo entry point público; deep imports em internals são proibidos.
5. Dependências circulares são proibidas.
6. Estado mutável global é proibido.
7. Ownership, lifetime e direção de dados DEVEM ser explícitos.
8. Um módulo NÃO DEVE conhecer detalhes de quem o consome.
9. Comunicação entre módulos usa contratos tipados; acesso lateral a internals é proibido.
10. Uma feature NÃO DEVE misturar refactor não relacionado no mesmo change set.

## 3. Níveis de agnosticidade

“Agnóstico” significa depender apenas dos conceitos permitidos para a camada, não tornar tudo abstrato.

| Camada | Pode conhecer | Não pode conhecer |
|---|---|---|
| Kernel | simulação, comandos, eventos, handles, tempo lógico | jogo, gênero, renderer, host, vendor, plataforma |
| SDK Lua | contratos públicos do kernel | internals C++, renderer, filesystem, rede, plataforma |
| Engine compartilhada | contratos e capacidades comprovadas | nomes ou regras de um jogo específico |
| Capacidade | seu domínio reutilizável | jogo consumidor, vendor e implementação de host |
| Jogo | seu domínio e SDKs públicos | internals da engine, dispositivo físico, vendor direto |
| Renderer | presentation protocol e assets | regras ou mutação do estado autoritativo |
| Host/adapter | contrato implementado e SDK do vendor | regras específicas do jogo |

Código específico de vendor só existe em adapter de borda. Código específico de jogo só existe no jogo até haver segundo uso real.

## 4. APIs e dados

1. APIs públicas DEVEM ser mínimas, tipadas, documentadas e testadas no boundary.
2. Parâmetros booleanos ambíguos, strings mágicas e IDs físicos são proibidos.
3. IDs, unidades, versões, ownership e nullability DEVEM ser explícitos.
4. Erros esperados DEVEM usar diagnósticos estruturados com código estável.
5. Capturar e ignorar erro é proibido.
6. Fallback DEVE ser declarado, observável e testado.
7. Mudança incompatível exige versionamento, migration ou ADR; nunca detecção silenciosa por tentativa.
8. Dados derivados NÃO DEVEM virar segunda fonte de verdade.
9. Save e estado autoritativo NÃO DEVEM conter objetos de apresentação, host ou vendor.
10. Input físico, relógio civil, rede e RNG externo NÃO DEVEM entrar diretamente na simulação.

## 5. Decisões e dependências

1. Prefira a solução mais simples que respeite os contratos atuais.
2. Nova abstração reutilizável exige dois usos reais diferentes. Contratos exigidos por uma fronteira desta arquitetura podem começar com um produtor e um consumidor, mantendo a API mínima.
3. Nova dependência exige busca por solução existente, justificativa, licença, versão fixada e avaliação de targets.
4. Dependência de runtime, mudança de boundary ou decisão difícil de reverter exige ADR antes da implementação.
5. Não introduza framework, service locator, code generation ou cache sem necessidade medida.
6. Não otimize sem benchmark; não ignore budget já comprovadamente excedido.
7. TODO sem responsável, motivo e issue/backlog ID é proibido.
8. Compatibilidade temporária DEVE possuir prazo e condição objetiva de remoção.

## 6. Testes e verificabilidade

1. Comportamento novo exige teste ou cenário no boundary público.
2. Bug corrigido exige teste que falhava antes da correção.
3. Testes DEVEM observar comportamento, não copiar a implementação.
4. Determinismo, save, replay, schema e protocolo exigem fixtures ou golden vectors quando aplicável.
5. Mock só pode substituir boundary externo; mockar internals para forçar teste a passar é proibido.
6. Teste removido, enfraquecido ou ignorado exige justificativa explícita e aprovação.
7. Código morto, API sem consumidor e configuração sem uso são proibidos.

## 7. Enforcement

Toda regra mecanicamente verificável DEVE virar lint, teste arquitetural, schema ou gate de CI. Até ser automatizada, a regra continua obrigatória e deve possuir item de backlog para automação.

Suppression só é aceita pelo processo formal de exceção. Comentário local, flag escondida ou configuração divergente não substituem exceção aprovada.
