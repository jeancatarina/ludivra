# ADR 0033 — Visual Forge: personagens procedurais e superfícies geradas

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de ampliar o arquétipo além de humanoides estilizados, ou antes de aceitar provedor externo de malha 3D
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Complementa: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md) e [ADR 0026](0026-construction-graph-as-source-of-truth.md)
- Fase: 10, com consumo na Fase 8

## Contexto

Um agente descreve bem: "goblin xamã corcunda, máscara de madeira, cajado de ossos, magia verde". Ele não produz malha rigada, pesos de skin nem topologia animável. E transformar uma ilustração 2D em personagem 3D animado é um problema aberto que exigiria retopologia e rigging automáticos de malha arbitrária — trabalho maior que a própria engine.

A divisão realista é outra: **a engine constrói o 3D; o agente produz direção artística, especificação estrutural e imagens 2D de superfície.**

Existe uma tentação a evitar. Pedir ao gerador de imagens um normal map, uma UV completa do personagem ou transparência perfeita produz entrada tecnicamente errada com aparência convincente, que só falha depois, dentro do jogo. A superfície gerada precisa entrar como enriquecimento sobre um material procedural que já funciona sozinho.

## Decisão

### Fronteira de responsabilidade

```text
agente:   interpreta o pedido, escolhe arquétipos, escreve especificações,
          pede texturas e decalques 2D, inspeciona previews e ajusta parâmetros
engine:   geometria, esqueleto, skinning, animação, roupas, equipamentos,
          materiais, mapas técnicos, colisão, validação, budget e preview
```

O agente descreve e pinta. A engine constrói, anima e executa. O agente nunca escreve vértices, pesos ou pixels de mapa técnico.

### Style Bible por projeto

Nenhum asset é gerado sem direção artística explícita em `styles/<id>/style.yaml`: estilo de geometria, silhueta, assimetria, budget de triângulos, faixas de proporção, frequência de detalhe, viés de roughness, paleta por função e parâmetros de render.

O Style Bible é lido antes de qualquer geração. É ele que impede que um goblin saia cartoon e o próximo saia realista.

### `CharacterSpec` como fonte de verdade

`visuals/*.character.json` declara arquétipo, anatomia por medidas, rosto por gerador e parâmetros, pele, roupas, equipamentos, acessórios, animações e efeitos, mais uma `seed`. Nada de geometria bruta.

### Geometria skeleton-first

O personagem nasce do esqueleto: cada osso declara comprimento, espessura inicial e final, orientação, curvatura e perfil. A malha é construída em anéis conectados ao redor dos ossos.

Essa ordem é a decisão central. Construir volume primeiro — por exemplo por marching cubes — e tentar rigar depois transforma cada personagem em um problema de retopologia. Construindo ao redor do esqueleto, os pesos de skinning saem da própria geração, por distância ao osso, região anatômica e limites de articulação.

Operações disponíveis: sweep, loft, extrude, bevel, subdivide, smooth, bend, twist, taper, inflate, flatten, mirror, assimetria controlada, booleanas união e subtração, e conformação a superfície.

### Geradores semânticos, não modelos prontos

Anatomia, rosto, roupas, equipamentos e acessórios são **algoritmos parametrizados com seed**, reutilizáveis entre personagens. Roupas são shells geradas sobre a região corporal, com folga, espessura, barra irregular, rasgos e costuras. O primeiro escopo usa ossos auxiliares e movimento procedural em vez de simulação física de tecido.

### Superfícies: quatro tipos de imagem, e nada além

O agente gera apenas: **swatch** de superfície repetível, **decalque**, **máscara** em preto e branco e **concept render** — este último só como referência para comparação, nunca aplicado ao modelo.

Cada imagem tem um `TextureRequest` declarando propósito, projeção, resolução, requisitos técnicos, direção artística e restrições negativas. O prompt final é montado a partir do Style Bible mais o request, não escrito à mão.

Transparência não é exigida do gerador: decalque é pedido em branco puro sobre preto puro e o compilador local converte luminância em alpha. Depender do recorte do modelo seria depender do detalhe menos confiável da saída.

### O compilador local produz os mapas técnicos

`texture-compiler` recebe a imagem e produz albedo, normal, roughness, máscara de detalhe e `material.json`, passando por normalização de cor, redução de seam, separação de frequências, extração de máscara, aproximação de altura, mipmaps e compressão.

O agente gera cor, padrão e identidade visual. A engine gera relevo, normal, roughness, escala, repetição e compressão. Pedir normal map ao gerador de imagens é proibido.

### Mapeamento sem UV manual

Triplanar para pele, pedra, madeira, tecido e solo; mapeamento por região semântica com escala e material próprios; projeção de decalque por posição, rotação e escala; atlas apenas para elementos controlados como olhos, bocas e ícones. Uma UV única do personagem inteiro não entra no primeiro escopo.

### Materiais em camadas

Todo material tem base procedural confiável — cor, roughness, subsurface — mais camadas procedurais como ruído celular, escurecimento por curvatura e vermelhidão em articulações, e só então camadas geradas com blend e força declarados.

A consequência é a propriedade que importa: **o personagem continua aceitável quando a textura gerada não é boa**. Material procedural é a estrutura; imagem gerada é enriquecimento.

### Animação reutilizável e parametrizada

Movimentos são semânticos e compartilhados — idle, walk, run, ataque, cast, hit, morte, interação — e cada personagem aplica modificadores como corcunda, claudicação, largura de passo, balanço de braço e velocidade. A animação final combina clip base, proporções, postura, IK de pés e mãos, movimento secundário e eventos de gameplay. Uma animação exclusiva por personagem é proibida no primeiro escopo.

### Registro, validação e job inspecionável

Todo asset compilado tem manifest com spec de origem, malha, esqueleto, materiais, animações, bounds e performance. O gameplay referencia apenas `visual: <id>`.

A validação é obrigatória e automática: geometria sem NaN, sem triângulo degenerado, sem normal inválida, interseção dentro do limite; rig com todos os vértices pesados, no máximo quatro ossos por vértice, pesos somando um, pés alcançando o chão e mãos alcançando o equipamento; e previews de frente, costas, lado, três quartos, turntable e clipes de idle, walk, attack e cast.

Cada geração é um job com estado explícito: `PLANNED`, `WAITING_FOR_TEXTURES`, `TEXTURES_IMPORTED`, `COMPILING`, `VALIDATING`, `NEEDS_REVISION`, `APPROVED`.

```bash
game visual plan "<descrição>" --project <p>
game visual import <inbox> --project <p>
game visual compile <visualId> --project <p>
game visual preview <visualId> --project <p>
game visual validate <visualId> --project <p>
game visual finalize <visualId> --project <p>
```

A etapa de trazer as imagens geradas para o `inbox` do job é a única possivelmente manual, e é declarada como tal em vez de escondida.

### Escopo do primeiro sistema

**Suportado:** humanoides pequenos e médios; cabeças humana, goblin, orc, esqueleto e demônio simples; túnica, robe, capa, armadura leve e faixas; espada, machado, cajado, escudo e arco; chifres, ossos, máscaras, bolsas, colares e cristais; idle, walk, run, attack, cast, hit e death; materiais de pele, tecido, couro, madeira, osso, metal, pedra e cristal; câmera isométrica, 12 a 20 mil triângulos por personagem, texturas de 512 ou 1024.

**Fora:** geração universal de qualquer criatura, retopologia genérica, rigging de malha arbitrária, simulação completa de tecido, cabelo realista, expressão facial cinematográfica, humano realista, UV completa gerada por IA, cenário inteiro como malha única, shader escrito livremente pelo modelo, geração em runtime e dependência de transparência.

Restringir o primeiro sistema a humanoides estilizados com câmera isométrica é o que mantém o Visual Forge menor que a engine. Ampliar arquétipo é revisão deste ADR.

Códigos: `VISUAL_SPEC_INVALID`, `VISUAL_STYLE_MISSING`, `VISUAL_GENERATOR_UNKNOWN`, `VISUAL_TRIANGLE_BUDGET_EXCEEDED`, `VISUAL_SKIN_WEIGHTS_INVALID`, `VISUAL_MESH_DEGENERATE`, `VISUAL_INTERSECTION_ABOVE_LIMIT`, `VISUAL_TEXTURE_REQUEST_UNFULFILLED`, `VISUAL_TEXTURE_NOT_TILEABLE`, `VISUAL_PREVIEW_UNAVAILABLE`, `VISUAL_JOB_NEEDS_REVISION`.

## Consequências

- um agente cria personagens variados sem editar malha, e o resultado é animável por construção;
- o pipeline não depende de transformar ilustração em 3D;
- textura gerada ruim degrada a superfície, não o asset;
- pesos de skin saem da geração, eliminando rigging automático de malha arbitrária;
- o budget de triângulos e a validação entram no gate antes de o asset chegar ao jogo;
- previews existem para o agente decidir, não para o humano aprovar manualmente;
- o escopo restrito a humanoides isométricos é uma limitação declarada, não um acidente;
- ampliar para quadrúpedes, cenários e rostos avançados é trabalho posterior com revisão deste ADR.

## Alternativas rejeitadas

- **Converter imagem 2D em malha 3D:** exigiria retopologia e rigging de malha arbitrária, e produz topologia inanimável.
- **Volume primeiro e rig depois:** transforma cada personagem em problema de retopologia e perde os pesos que a geração já poderia dar.
- **Pedir normal map, UV completa ou transparência ao gerador de imagens:** entrada tecnicamente errada com aparência convincente.
- **Um gerador por personagem:** anula reuso e faz o custo crescer com o elenco.
- **Animação exclusiva por personagem:** custo proporcional ao elenco para ganho pequeno em câmera isométrica.
- **Material só com textura gerada:** o asset fica hostage da qualidade da imagem.
- **Geração de asset em runtime:** custo por sessão, resultado dependente do dispositivo e evidência incomparável.
- **Abrir o escopo para qualquer criatura na primeira versão:** o Visual Forge ficaria maior que a engine.
