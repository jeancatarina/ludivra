# ADR 0040 — Ausência de framework de UI e limites da UI diegética

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-26 para explicitar a política de UI nos perfis desktop
- Revisão: se uma tela do jogo exigir comportamento que DOM acessível não consiga expressar com o mesmo nível de evidência
- Fecha as pendências de: [ADR 0014](0014-declarative-ui-contracts-and-initial-renderer.md)
- Fase: 8

## Contexto

O ADR 0014 decidiu os contratos de UI e o renderer inicial em DOM acessível, e deixou duas pendências: adotar um framework de UI e permitir UI diegética em canvas ou no renderer 3D. Ambas ficaram como "exige ADR próprio", o que é uma dependência aberta no meio da Fase 8.

A implementação do `ENG-017` mudou o que se sabe. O renderer de UI em DOM cabe em um arquivo, reconcilia por id, resolve rótulos por locale e mede bounds, visibilidade, clipping, foco, texto, papel de acessibilidade e contraste. O `RenderedUiSnapshot` produzido por ele já encontrou um defeito real de layout que nenhuma inspeção manual havia notado.

## Decisão

### Nenhum framework de UI

A Ludivra não adota React, Vue, Svelte ou equivalente. A decisão é definitiva para o escopo do programa, não um adiamento.

O motivo é a natureza do consumidor. O `UiViewModel` já é o modelo declarativo, e a reconciliação necessária é por id estável sobre uma lista de nós — o problema que um framework resolve já está resolvido pelo contrato. Em troca, um framework traria dependência de runtime, um segundo modelo de componentes, um ciclo de vida próprio e uma superfície que o `RenderedUiSnapshot` não descreve.

Isso não proíbe TypeScript de apresentação organizado em módulos. Proíbe importar um framework de componentes como dependência de runtime do host.

### UI diegética é permitida, com o mesmo contrato

UI dentro do mundo — texto em placa, painel em máquina, marcador flutuante — pode ser renderizada no renderer 3D, sob três condições que não admitem exceção:

1. o nó existe no `UiViewModel` como qualquer outro, com id estável, papel e ações declaradas;
2. o renderer produz `RenderedUiSnapshot` com `renderer` próprio declarado e com bounds em espaço de tela, visibilidade, clipping, foco efetivo, texto resolvido e contraste medidos — estimativa não é aceita;
3. quando o nó é interativo e a plataforma não fornecer acessibilidade, o host mantém um nó DOM equivalente e focável, mesmo invisível, para navegação por teclado e leitor de tela.

Nó diegético que não consiga medir bounds ou contraste é `UI_DIEGETIC_NOT_MEASURABLE` e não pode ser interativo.

### Consequência de projeto

Menu, HUD, inventário e diálogo permanecem em DOM nos hosts Browser e Electron, inclusive no perfil `desktop-high` do ADR 0047. O canvas recebe apenas o que precisa existir dentro do mundo para o jogo funcionar. Essa divisão é o que mantém a acessibilidade verificável por dado em vez de reimplementada.

Se um host nativo de produção vier a ser justificado, ele precisará de um adapter que preserve `UiViewModel`, `RenderedUiSnapshot`, navegação e acessibilidade, ou de revisão explícita deste ADR. A possibilidade futura de host nativo não justifica duplicar a UI agora.

Códigos: `UI_FRAMEWORK_DEPENDENCY_FORBIDDEN`, `UI_DIEGETIC_NOT_MEASURABLE`, `UI_DIEGETIC_INTERACTIVE_WITHOUT_FALLBACK`.

## Consequências

- as duas pendências do ADR 0014 deixam de existir;
- nenhuma dependência de framework entra no host;
- UI diegética passa a ser possível sem abrir uma segunda árvore de UI sem evidência;
- interatividade diegética exige nó DOM equivalente, o que preserva teclado e leitor de tela;
- a Fase 8 pode implementar HUD e menus sem esperar outra decisão;
- se uma tela realmente exceder o DOM, a revisão deste ADR é o caminho, com o defeito concreto como evidência.

## Alternativas rejeitadas

- **Adotar um framework agora:** dependência de runtime e segundo modelo de componentes, sem consumidor que o exija.
- **Proibir UI diegética:** eliminaria placas, painéis e marcadores, que são parte da linguagem visual de jogos isométricos.
- **Permitir UI diegética sem medição:** produziria nó que "deveria aparecer" sem evidência de que apareceu, exatamente o que o ADR 0014 separou.
- **Reimplementar acessibilidade no canvas:** custo alto para reproduzir pior o que a plataforma já entrega.
- **Deixar as duas pendências abertas:** manteria dependência não resolvida no meio da fase de apresentação.
