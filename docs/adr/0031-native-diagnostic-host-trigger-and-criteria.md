# ADR 0031 — Gatilho e critérios do `NativeDiagnosticHost`

- Status: provisório
- Data: 2026-07-24
- Revisão: quando um dos gatilhos abaixo ocorrer; a escolha do backend concreto exige ADR próprio
- Complementa: [ADR 0002](0002-runtime-c-abi.md) e [ADR 0005](0005-first-steam-delivery.md)
- Fecha em parte: item "backend do `NativeDiagnosticHost`" da seção 36 de [architecture.md](../../architecture.md)
- Fase: 11

## Contexto

A arquitetura prevê dois hosts nativos: o `NativeHeadlessHost`, que prova portabilidade lógica cedo e já existe, e um `NativeDiagnosticHost` visual posterior, que desenha primitivas, recebe input e reproduz áudio básico. Ele é a sonda de portabilidade para consoles, cujo port só começa com acesso oficial, justificativa comercial e conformidade do kernel verde.

A seção 36 pede a decisão de backend. Escolher agora entre camadas de janela, input e áudio nativos significaria adicionar uma dependência de runtime — com licença, build por plataforma e manutenção — para um host sem consumidor atual. O caminho WebAssembly com Electron e o `NativeHeadlessHost` cobrem hoje tanto a execução visual quanto a prova de portabilidade lógica.

Por outro lado, deixar o item aberto sem critério convida alguém a adicionar essa dependência de forma oportunista.

## Decisão

O `NativeDiagnosticHost` **não é iniciado agora**. O que fica decidido é quando ele passa a ser justificado e o que ele deve satisfazer.

### Gatilhos

Basta um:

1. acesso oficial a um SDK de console, com justificativa comercial registrada;
2. classe de defeito reproduzível apenas fora do navegador e do Electron, comprovada por tentativa registrada de reproduzi-la no `NativeHeadlessHost`;
3. target nativo de desktop sem WebAssembly entrando no escopo de release.

Preferência por tecnologia nativa, desconforto com o stack web ou expectativa de desempenho não são gatilhos.

### Critérios que o host deverá satisfazer

- implementar os mesmos contratos dos demais hosts, sem caminho próprio de simulação;
- consumir os buffers de apresentação do ADR 0020 sem formato paralelo;
- expor `UiViewModel` e `RenderedUiSnapshot` conforme o ADR 0014, com `renderer` próprio declarado;
- implementar o backend de áudio conforme o ADR 0025, inclusive o fallback observável;
- rodar os mesmos cenários e produzir a mesma classe de evidência.

### Escolha de backend

A camada concreta de janela, input e áudio será escolhida no momento em que um gatilho ocorrer, por ADR próprio, com avaliação registrada de licença, plataformas suportadas, tamanho, portabilidade para console e observabilidade. Este ADR não elege candidato, porque a avaliação depende dos targets que o gatilho trouxer.

Código: `HOST_NATIVE_DIAGNOSTIC_NOT_AVAILABLE`, usado para classificar explicitamente qualquer evidência que exigiria esse host.

## Consequências

- nenhuma dependência nativa de janela, input ou áudio entra no repositório sem gatilho;
- o item da seção 36 deixa de ficar aberto sem critério;
- evidência que exigiria host nativo visual recebe classificação explícita em vez de silêncio;
- quando o host existir, ele nasce obrigado aos contratos já decididos, sem formato paralelo;
- o `NativeHeadlessHost` continua sendo a prova de portabilidade lógica;
- port de console permanece condicionado a acesso oficial e justificativa comercial.

## Alternativas rejeitadas

- **Escolher a camada nativa agora:** dependência de runtime com manutenção por plataforma para um host sem consumidor.
- **Remover o host do plano:** perderia a sonda de portabilidade que o port de console exige.
- **Deixar o item aberto sem critério:** permite adição oportunista da dependência sob qualquer pretexto.
- **Implementar um host nativo com renderer próprio fora dos contratos:** criaria segundo caminho de apresentação e de evidência.
- **Tratar desempenho esperado como gatilho:** seria otimização sem benchmark, proibida pelas regras de engenharia.
