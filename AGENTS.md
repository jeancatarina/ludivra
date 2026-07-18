# Regras para agentes

Estas instruções são obrigatórias para qualquer IA que altere este repositório.

## Leitura obrigatória

Antes de editar código, leia nesta ordem:

1. [architecture.md](architecture.md);
2. [engineering-rules.md](docs/guardrails/engineering-rules.md);
3. [token-efficiency.md](docs/guardrails/token-efficiency.md);
4. [change-gates.md](docs/guardrails/change-gates.md);
5. o contexto específico apontado pela tarefa.

Não carregue documentação sem relação com a mudança.

## Aplicação

- `architecture.md` é a fonte canônica de fronteiras e decisões da engine.
- `engineering-rules.md` é a fonte canônica de regras técnicas.
- `token-efficiency.md` é a fonte canônica de economia de contexto e saída.
- `change-gates.md` é a fonte canônica de workflow, aceite e exceções.

Não repita regras destes documentos em novos arquivos. Aponte para a fonte canônica. Guardrails só podem ser editados quando a tarefa pedir explicitamente sua alteração.

## Quando parar

Pare e peça decisão quando houver:

- conflito entre arquitetura, guardrails ou pedido;
- nova dependência de runtime;
- mudança de API, schema, protocolo, formato de save ou replay;
- migração destrutiva ou risco de perda de dados;
- escolha de segurança, licença, publicação ou serviço comercial;
- duas alternativas com consequências duráveis e sem evidência suficiente.

Mudanças locais, reversíveis e cobertas pelos contratos existentes não exigem confirmação.

## Estado de conclusão

Uma tarefa só pode ser declarada concluída quando todos os itens aplicáveis de [change-gates.md](docs/guardrails/change-gates.md) estiverem `PASS`. Itens não aplicáveis devem registrar motivo. Exceções seguem exclusivamente o processo descrito naquele documento.
