# ADR 0036 — Physics Forge: receitas de collider, massa e estabilidade

- Status: provisório
- Data: 2026-07-24
- Revisão: antes do primeiro corpo com autoridade `gameplay` em um jogo de prova
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Depende de: [ADR 0021](0021-motion-and-physics-adapter-authority.md) e [ADR 0037](0037-physics-solver-selection.md)
- Fase: 10

## Contexto

O ADR 0021 decidiu contratos semânticos de física, autoridade por corpo e quantização no commit. O que falta é a autoria dos corpos: quem decide collider, massa, centro de massa, joints, pontos de agarre e perfis de quebra — e como isso é verificado antes de um jogo depender do comportamento.

Collider ajustado à mão dentro do código do jogo é a forma mais comum de física irreprodutível: ninguém revisa números soltos e ninguém sabe qual cenário os validou.

## Decisão

### A receita descreve o corpo, e o collider é derivado

`physics/*.body.jsonc` declara, por asset visual, a forma de colisão pretendida — caixa, cápsula, esfera, convex hull ou composição —, densidade ou massa, centro de massa, atrito, restituição, joints com limites, pontos de agarre e perfis de quebra.

O collider é **derivado do asset visual** sempre que possível: o Forge o ajusta a partir da malha compilada pelo Visual Forge e registra o desvio. Collider digitado que não corresponde à malha é diagnóstico, não decisão.

### Validação por cenário de estabilidade, não por opinião

Cada receita declara cenários de verificação, e o Forge os executa no adapter escolhido pelo ADR 0037: repouso sobre plano por N ticks sem deriva, empilhamento sem explodir, queda sem tunneling na velocidade máxima declarada, joint dentro do limite, ragdoll que assenta, e quebra que conserva massa.

O relatório registra deriva máxima, penetração máxima, energia residual, ticks até repouso e divergência entre execuções. Um corpo sem cenário aprovado não pode receber autoridade `gameplay`.

### Determinismo e quantização

O Forge verifica a propriedade que o ADR 0021 exige: com a mesma seed e o mesmo binário, as posições quantizadas no boundary de commit são idênticas entre execuções. Divergência é `PHYSICS_DIVERGENCE` no relatório do Forge, antes de virar bug de replay.

```bash
game physics render   --project <p> [--id <bodyId>]
game physics validate --project <p> --id <bodyId>
game physics inspect  --project <p>
```

Códigos: `PHYSICS_RECIPE_INVALID`, `PHYSICS_COLLIDER_MESH_MISMATCH`, `PHYSICS_MASS_UNDECLARED`, `PHYSICS_STABILITY_SCENARIO_MISSING`, `PHYSICS_RESTING_DRIFT`, `PHYSICS_TUNNELING_DETECTED`, `PHYSICS_JOINT_LIMIT_VIOLATED`, `PHYSICS_BREAKABLE_MASS_MISMATCH`.

## Consequências

- collider passa a ser derivado e auditável, não número digitado;
- autoridade `gameplay` fica condicionada a cenário de estabilidade aprovado;
- deriva, penetração e tunneling aparecem em authoring, não em playtest;
- trocar de solver reexecuta as mesmas receitas e produz relatório comparável;
- ragdoll, agarre e quebra ganham critério objetivo antes de entrar no jogo.

## Alternativas rejeitadas

- **Collider digitado sem relação com a malha:** desalinha visual e colisão sem qualquer sinal.
- **Aprovar corpo por inspeção visual:** não é reproduzível nem verificável em CI.
- **Confiar nos padrões do solver:** esconde massa e atrito implícitos que mudam entre versões da biblioteca.
- **Validar física só dentro do jogo:** mistura defeito de corpo com defeito de regra.
