# Eficiência de tokens e contexto

Economizar tokens significa remover trabalho e texto sem valor. Nunca significa omitir contexto obrigatório, validação, erro, risco ou evidência.

## 1. Ordem de contexto

Carregue contexto nesta ordem:

1. instruções obrigatórias completas;
2. estado e manifest relevantes;
3. símbolos diretamente citados pela tarefa;
4. contratos públicos desses símbolos;
5. testes relacionados;
6. dependentes e implementação interna somente quando necessário.

É proibido começar lendo o repositório inteiro. Cada expansão de contexto DEVE responder a uma dúvida concreta.

## 2. Busca antes de leitura

1. Use índice, manifest, `rg --files` ou `rg` antes de abrir arquivos.
2. Pesquise primeiro por ID, símbolo, erro, contrato e import.
3. Leia inicialmente apenas o bloco do match com contexto suficiente.
4. Expanda para o arquivo completo somente quando estrutura ou instrução exigir.
5. Refine buscas amplas por diretório, extensão ou módulo.
6. Não releia arquivo inalterado na mesma sessão.
7. Depois de editar, revise o diff e as regiões alteradas; não reimprima arquivos inteiros.

Instruções, contratos normativos e schemas selecionados DEVEM ser lidos por completo.

## 3. Saída de ferramentas

1. Prefira saída estruturada, resumida e filtrável.
2. Mostre falhas, warnings relevantes e resumo; omita linhas repetitivas de sucesso.
3. Logs completos DEVEM ir para artefato quando forem grandes.
4. O resumo DEVE apontar para o log completo e informar se houve truncamento.
5. Use filtros por arquivo, suite, target, cenário ou código de erro.
6. Agrupe verificações independentes em uma única rodada quando isso não esconder resultados.
7. Não execute novamente comando caro se inputs e configuração não mudaram.
8. Não cole build logs, stack traces ou JSON extensos no chat quando um diagnóstico e um caminho bastarem.

Falha desconhecida pode exigir log completo. Eficiência nunca autoriza cortar a causa raiz.

## 4. Implementação econômica

1. Faça o menor patch coeso.
2. Edite somente arquivos proprietários da responsabilidade.
3. Reuse contratos e geradores existentes.
4. Não crie scaffolding, adapter, abstração ou documentação sem consumidor atual.
5. Não reformate nem reorganize arquivos fora do escopo.
6. Use ferramentas mecânicas para mudanças repetitivas, preservando revisão por diff.
7. Mantenha nomes e APIs explícitos para reduzir contexto necessário em sessões futuras.

## 5. Validação em funil

Execute do mais barato e específico ao mais caro e amplo:

```text
schema/lint local
      ↓
teste afetado
      ↓
suite do módulo
      ↓
teste de integração/boundary
      ↓
matriz completa exigida pelo gate
```

Falha em uma camada interrompe as camadas dependentes até a correção. Gates obrigatórios continuam obrigatórios antes da conclusão; o funil apenas evita rodá-los repetidamente durante a edição.

## 6. Memória entre sessões

1. Estado durável pertence a fontes, manifests, ADRs e relatórios versionados.
2. Relatórios registram decisão e evidência, não transcrição da sessão.
3. Use IDs, links e hashes em vez de copiar conteúdo já canônico.
4. `SESSION_REPORT.md` deve permitir continuação sem recontar o histórico completo.
5. Resultados antigos só são recarregados quando ainda correspondem ao commit e às versões atuais.

## 7. Resposta pelo chat

A resposta final usa, quando aplicável:

1. resultado;
2. arquivos alterados;
3. validações;
4. limitações ou itens não executados;
5. próxima prioridade única.

Não repita o pedido, o plano, logs já resumidos ou a mesma conclusão em várias seções. Detalhes adicionais são fornecidos somente quando ajudam uma decisão.

## 8. Requisitos para a CLI

Comandos devem oferecer, quando semanticamente aplicável:

- `--format json` para consumo por agentes;
- `--quiet` ou `--summary` para ocultar progresso repetitivo;
- `--scope`, `--changed` ou `--affected` para limitar trabalho;
- `--max-diagnostics` sem perder o total de ocorrências;
- caminho para artefato completo;
- códigos estáveis para usar `game explain <code>` sob demanda.

Saída resumida DEVE informar status, duração, contagens, diagnósticos principais, artefatos e próximos passos. Progresso animado, banners e duplicação stdout/stderr são proibidos no modo estruturado.

## 9. Antipadrões proibidos

- abrir todos os arquivos “para entender o projeto”;
- repetir conteúdo canônico em prompt, relatório ou documentação;
- investigar internals antes do contrato público;
- executar a suite completa após cada edição pequena;
- colar logs completos sem análise;
- criar muitos arquivos especulativos;
- manter duas fontes para evitar uma leitura;
- pedir ao usuário informação disponível no repositório;
- ocultar falha para produzir resposta menor.
