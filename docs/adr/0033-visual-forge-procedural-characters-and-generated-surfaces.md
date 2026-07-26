# ADR 0033 — Visual Forge local: uma receita, personagem final em 2D, 2.5D e 3D

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-25 para tornar o Forge responsável por todo conteúdo visual
- Revisão: antes de adicionar um novo arquétipo canônico ou modo de renderização
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Complementa: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md) e [ADR 0026](0026-construction-graph-as-source-of-truth.md)
- Fase: 10, com consumo na Fase 8

## Contexto

Um personagem final precisa ser mais que um arquivo carregável. Em 2D ele exige recorte, escala, pivô, bleed, atlas e cobertura de animação. Em 2.5D precisa preservar identidade, proporções e equipamento em todas as direções. Em 3D precisa de topologia fechada, rig, skin, UV, materiais PBR, texturas, animações, bounds e budget.

A revisão anterior transformou o perfil de produção em importador de PNG e glTF. Isso contrariou a fronteira do produto: o Visual Forge deve criar o personagem, não selecionar um asset externo e apenas empacotá-lo. A dependência também quebrava a continuidade entre 2D, 2.5D e 3D, pois cada saída podia representar uma identidade diferente.

## Decisão

### A receita é a única fonte visual

`visuals/*.character.json` versão 2 contém identidade, arquétipo, anatomia, rosto, vestuário, equipamento, acessórios, animações, efeitos, seed e saídas desejadas. O schema proíbe superfícies externas: `surfaces` deve ser vazio e nenhum output possui `path`, origem, licença ou hash de asset.

O Forge não lê imagem, sprite sheet, modelo ou material como entrada de produção. Dependências de software do authoring podem codificar PNG, YAML ou glTF, mas não fornecem conteúdo visual.

### Personagem canônico compartilhado

Uma compilação cria primeiro um `CanonicalCharacter` determinístico:

1. esqueleto humanoide e proporções semânticas;
2. malha orgânica contínua extraída de volumes implícitos combinados, com cabeça, mandíbula, orelhas, nariz, pescoço, ombros, membros, mãos e pés esculpidos;
3. skin com até quatro influências e pesos normalizados;
4. UV cilíndrico por região;
5. cores por papel semântico do Style Bible;
6. albedo, normal e metallic-roughness procedurais por classe semântica;
7. clipes de animação declarados na receita.

Todas as saídas vêm dessa mesma instância. Não existe reconstrução separada por modo.

### Blueprint semântico e primeira geração

O planejador não começa por primitivas soltas. Ele seleciona um blueprint calibrado
antes de construir a receita:

- `hero-mascot`: cabeça e mãos expressivas, pose de apresentação, roupa em camadas,
  cabelo, calçado e headwear;
- `stylized-hero`: proporção humanoide intermediária, mãos articuladas e roupa modular;
- `compact-creature`: anatomia compacta para goblin, orc e demônio simples.

Cada blueprint fixa relações coerentes entre quadril, ombros, cabeça, olhos, nariz,
palmas, dedos, pés, enquadramento e gates. `game visual plan` infere o perfil,
headwear, cabelo, barba, mãos, calçado e construção da roupa da descrição textual.
Mesmo quando a descrição menciona textura, a receita permanece `surfaces: []`:
microtextura, normal e roughness são produzidos pelo Forge, sem inbox ou PNG.

O objetivo do blueprint é que a primeira compilação já seja um personagem completo;
o seed varia identidade e assimetria dentro do perfil, não corrige anatomia quebrada.

```text
receita v2 + Style Bible + seed
                 ↓
       CanonicalCharacter local
        ↙          ↓          ↘
  câmera 2D   8 câmeras 2.5D   glTF 3D
       ↓           ↓             ↓
 PNG + atlas   PNG + atlas   mesh + rig + PBR
```

### Perfis de produção

| Modo | Perfil | Entrega canônica |
|---|---|---|
| 2D | `illustrated-character-2d` | PNG RGBA de alta resolução, atlas JSON, pivô e animações |
| 2.5D | `directional-character-2.5d` | oito vistas do modelo canônico, atlas RGBA, pivô comum e direção por célula |
| 3D | `stylized-pbr-3d` | glTF autocontido, buffer, rig, skin, UV, 18 mapas PBR (três por classe), animações e preview |

O gameplay referencia apenas `visual: <id>`. O target escolhe a variante de apresentação; a simulação não conhece o modo gráfico.

### Render local 2D e 2.5D

O rasterizador de authoring projeta os triângulos do personagem canônico, resolve profundidade por pixel, interpola normais e cores e aplica iluminação PBR aproximada, tone mapping, rim light, oclusão de contato em screen space, contorno, sombra de chão, supersampling 2× e remoção restrita de artefatos subpixel entre camadas. Pele, tecido, couro, cabelo, superfícies brilhantes e peças rígidas têm respostas e microtexturas distintas. A saída permanece transparente.

2D usa uma câmera declarada e resolução mínima de 768 px. 2.5D usa exatamente oito direções ordenadas e resolução mínima de 256 px por célula. A mesma geometria garante continuidade de rosto, roupa e equipamento entre as vistas.

O atlas registra frames, direção, pivô, pixels por metro e animações. O compilador valida resolução, cobertura alpha, conjunto direcional, identidade e determinismo.

### 3D local

O perfil 3D emite glTF 2.0 com:

- topologia fechada e sem triângulos degenerados;
- rig e skin gerados da mesma hierarquia semântica;
- UVs, vertex colors e primitives separadas por seis classes semânticas de material;
- albedo, normal e metallic-roughness de 512 px gerados localmente para cada uma das seis classes, totalizando 18 mapas;
- animações `idle`, `walk`, `run`, `attack`, `cast`, `hit`, `death` ou subconjunto declarado;
- bounds, contagem de vértices, triângulos, ossos, segmentos e texturas no relatório.

O manifest identifica `source.kind: forge-recipe`, `pipeline: canonical-character-local` e `generatedFrom.kind: canonical-character` em cada output. Não existe campo de proveniência de asset porque não existe asset de entrada.

### Qualidade e evidência

`quality: production` passa somente quando todos os checks do perfil passam. O gate cobre:

- resolução e alpha para raster;
- oito direções e identidade comum para 2.5D;
- topologia, budget, rig, skin, PBR e animações para 3D;
- proporção mínima de vértices pertencentes a superfícies orgânicas contínuas e quantidade mínima de detalhes semânticos;
- conjunto completo de módulos exigidos pelo blueprint e quantidade mínima de classes PBR;
- folga volumétrica mínima entre olhos e nariz e variação material distinta entre os mapas PBR;
- regeneração byte a byte com mesma receita, Style Bible, seed e versão do Forge.

Preview PNG, atlas direcional, manifest e relatório são evidência obrigatória. `game visual finalize` bloqueia qualquer saída reprovada.

### Authoring e runtime

Toda geração ocorre em authoring/build time. O runtime recebe somente PNG, JSON, glTF e texturas convencionais. Não há chamada de rede, credencial, SDK generativo ou resolução de asset remoto.

Os estados do job v2 são `PLANNED`, `COMPILING`, `VALIDATING`, `NEEDS_REVISION` e `APPROVED`. Estados de espera por fonte pertencem apenas ao contrato v1 legado.

## Consequências

- o Visual Forge cria todos os pixels, vértices, materiais e animações do personagem;
- 2D, 2.5D e 3D preservam a mesma identidade por construção;
- builds são locais, offline, determinísticos e auditáveis pela receita;
- não há licença ou disponibilidade de asset visual externo para administrar;
- aumentar a cobertura artística exige novos geradores canônicos e Style Bibles, não novos importadores;
- o primeiro gerador de produção cobre humanoides estilizados; quadrúpedes, veículos, fotorealismo, bake raster de todos os clipes e simplificação multi-LOD continuam explícitos como próximos perfis.

## Alternativas rejeitadas

- **Importar PNG ou sprite sheet como produção:** o Forge deixaria de criar o personagem.
- **Importar glTF/GLB como produção:** validaria um personagem feito fora do Forge e quebraria a identidade compartilhada.
- **Gerar cada modo separadamente:** permite divergência de rosto, proporção, roupa e equipamento.
- **Derivar 2.5D de uma única ilustração:** inventa vistas sem geometria canônica.
- **Executar geração remota:** perde operação offline, determinismo e domínio completo do pipeline.
- **Manter tubos abertos como perfil final:** falha visualmente mesmo quando contagens e rig são válidos.
