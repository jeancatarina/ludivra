# ADR 0033 — Visual Forge: personagens finais em 2D, 2.5D e 3D

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-25 para substituir o escopo 3D procedural por perfis de renderização de produção
- Revisão: antes de adicionar um novo modo de renderização ou tornar um provedor generativo obrigatório
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Complementa: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md) e [ADR 0026](0026-construction-graph-as-source-of-truth.md)
- Fase: 10, com consumo na Fase 8

## Contexto

Um personagem utilizável no jogo final não é definido apenas por existir um arquivo carregável. Em 2D ele precisa de recorte, escala, pivô, bleed, atlas e cobertura de animação corretos. Em 2.5D precisa manter identidade, escala e equipamento entre direções. Em 3D precisa de topologia, rig, skin, materiais, texturas, animações, bounds e budget adequados.

A primeira implementação do Visual Forge confundiu compilação procedural com qualidade final: tubos construídos ao redor de um esqueleto produzem um blockout animável, mas não substituem direção artística, escultura, retopologia, UV, materiais e animação de produção. Também limitou o contrato a humanoides 3D isométricos, embora os jogos da engine possam escolher gráficos 2D, 2.5D ou 3D.

O Forge deve automatizar a passagem de uma intenção textual para um pacote verificável de jogo. Ele não deve fingir que o mesmo algoritmo local produz, sozinho, arte final competitiva em todos os estilos.

## Decisão

### Uma identidade, saídas explícitas

`visuals/*.character.json` versão 2 declara a identidade semântica do personagem e uma ou mais saídas. Cada saída escolhe:

- `mode`: `2d`, `2.5d` ou `3d`;
- `profile`: contrato de câmera, iluminação, material e entrega;
- `quality`: `blockout` ou `production`;
- `source`: fonte raster, folha direcional, modelo glTF/GLB ou gerador procedural;
- requisitos de animação, resolução, escala, pivô, colisão, LOD e budget;
- proveniência completa de cada fonte.

O gameplay continua referenciando `visual: <id>`. A variante de apresentação é resolvida pelo build target, não pela simulação.

Os contratos v1 permanecem válidos para projetos existentes. Eles representam o perfil `stylized-humanoid-blockout-3d` e não podem ser promovidos como `production`. A versão 2 é um contrato novo, sem reinterpretação silenciosa.

### Perfis de renderização

Um perfil é textual, versionado e validado. O primeiro conjunto canônico contém:

| Modo | Perfil | Entrega canônica |
|---|---|---|
| 2D | `painted-cutout-2d` | PNG RGBA, atlas JSON, pivôs, bounds e animações |
| 2.5D | `directional-impostor-2.5d` | atlas RGBA, direções ordenadas, pivô comum, bounds e animações |
| 3D | `stylized-pbr-3d` | glTF/GLB com rig, skin, materiais, texturas, animações e metadados de LOD |
| 3D | `stylized-humanoid-blockout-3d` | glTF procedural para prototipação, diagnóstico e colisão inicial |

Perfis adicionais exigem schema e validador próprios; trocar apenas um nome não altera critérios de qualidade.

### 2D de produção

A fonte é uma imagem ou folha de animação autorada ou gerada em authoring. O sidecar registra prompt, modelo, versão, seed quando disponível, origem, licença e hash. O compilador local:

1. valida resolução, espaço de cor e cobertura;
2. remove matte declarado quando necessário;
3. recorta preservando padding semântico;
4. extruda cores sob pixels transparentes para impedir halos;
5. monta atlas determinístico;
6. calcula pivô, bounds visuais e collider sugerido;
7. emite metadata de frames e animações;
8. bloqueia promoção quando alpha, bleed, escala ou cobertura falham.

O Forge pode aceitar arte com alpha nativo. Chroma/matte é uma estratégia de importação, não requisito do produto final.

### 2.5D de produção

2.5D usa sprites direcionais ou impostores derivados de:

- renderizações determinísticas de um modelo 3D canônico; ou
- uma folha multivista declarada que contenha todas as direções exigidas.

Uma única ilustração não é inventada como vistas consistentes. O compilador verifica número e ordem de direções, dimensões, pivô comum, ocupação, diferença de escala, transparência e cobertura de animação. O manifest registra a relação entre cada célula e `north`, `north-east`, `east`, `south-east`, `south`, `south-west`, `west` e `north-west`.

### 3D de produção

O perfil de produção recebe um modelo glTF/GLB rigado proveniente de kit modular, DCC, fotogrametria ou gerador 3D autorizado. O Forge valida e empacota, mas não afirma que tubos procedurais equivalem a um personagem final.

São obrigatórios:

- pelo menos uma malha, skin, material e animação;
- texturas e buffers resolvidos, com hashes e licenças;
- pesos normalizados, no máximo quatro influências por vértice e joints válidos;
- ausência de NaN, infinito e triângulos degenerados;
- escala, eixo vertical, pivô e bounds declarados;
- budget por LOD e cobertura das animações requeridas;
- preview de frente, costas, lado, três quartos e clipes principais.

O gerador skeleton-first existente permanece disponível apenas no perfil de blockout. Ele é útil para escala, colisão, teste de gameplay e especificação de silhueta, nunca como evidência de arte final.

### Direção artística e consistência

Todo output de produção referencia um Style Bible e um perfil. A receita descreve silhueta, formas dominantes, proporções, materiais, paleta, contraste, densidade de detalhe, câmera e iluminação. Um personagem compartilhado entre modos usa a mesma identidade visual e registra quais diferenças são deliberadas.

Prompts são montados a partir da receita e do Style Bible. A saída aceita vira fonte congelada. Gerar novamente cria uma revisão; não sobrescreve silenciosamente a fonte anterior.

### Qualidade é um gate mensurável

`quality: production` só é aceito quando o validador do perfil passa. O relatório diferencia erros técnicos de avaliação artística:

- técnico: dimensões, alpha, bleed, dependências, rig, animações, budgets e hashes;
- visual: legibilidade em tamanho de jogo, silhueta, consistência de direção, contraste focal e ausência de artefatos;
- proveniência: origem, licença, termos, prompt e hash.

A avaliação visual produz contact sheet ou turntable inspecionável. O comando `finalize` falha se qualquer saída de produção estiver sem evidência ou com diagnóstico bloqueante.

### Authoring e runtime

Geração, importação, corte de atlas, validação e previews rodam somente em authoring/build time. O runtime recebe PNG, JSON, glTF/GLB e texturas convencionais. Nenhuma credencial, SDK generativo ou pacote do Forge entra no jogo publicado.

Um serviço externo é opcional: o build recompila uma fonte já aprovada sem chamar o serviço. O repositório registra exatamente qual fonte foi aprovada.

### Job inspecionável

Cada geração mantém os estados `PLANNED`, `WAITING_FOR_SOURCES`, `SOURCES_IMPORTED`, `COMPILING`, `VALIDATING`, `NEEDS_REVISION` e `APPROVED`.

```bash
game visual plan "<descrição>" --project <p>
game visual import <inbox> --project <p>
game visual compile <visualId> --project <p>
game visual preview <visualId> --project <p>
game visual validate <visualId> --project <p>
game visual finalize <visualId> --project <p>
```

Códigos adicionais: `VISUAL_PROFILE_UNKNOWN`, `VISUAL_SOURCE_MISSING`, `VISUAL_SOURCE_HASH_MISMATCH`, `VISUAL_SOURCE_LICENSE_MISSING`, `VISUAL_QUALITY_PROFILE_FAILED`, `VISUAL_ALPHA_INVALID`, `VISUAL_ATLAS_BLEED`, `VISUAL_DIRECTION_SET_INCOMPLETE`, `VISUAL_DIRECTION_SCALE_MISMATCH`, `VISUAL_3D_SKIN_MISSING`, `VISUAL_3D_ANIMATION_MISSING`, `VISUAL_3D_DEPENDENCY_MISSING`, `VISUAL_BLOCKOUT_NOT_PRODUCTION`.

## Consequências

- o Forge entrega personagens utilizáveis em jogos 2D, 2.5D e 3D;
- qualidade final vem de fontes visuais adequadas, não de uma promessa impossível do gerador procedural;
- compilação, atlas, empacotamento e validação permanecem locais e determinísticos;
- fontes generativas deixam de ser opacas porque têm recipe, prompt, modelo, licença e hash;
- o jogo publicado não depende do Forge nem de serviço externo;
- o contrato v1 continua funcionando como blockout, enquanto v2 expressa produção;
- kits e fontes de terceiros aumentam a responsabilidade de proveniência e versionamento;
- avaliação artística continua necessária, mas vira evidência explícita em vez de aprovação implícita.

## Alternativas rejeitadas

- **Tratar o blockout procedural como arte final:** produz geometria tecnicamente válida, mas visualmente insuficiente.
- **Um único formato para todos os modos:** perde pivôs e frames em 2D, direções em 2.5D ou rig e materiais em 3D.
- **Converter uma única imagem em 3D automaticamente:** ainda exige reconstrução, retopologia, UV e rig confiáveis.
- **Inventar vistas 2.5D de uma única imagem:** não garante identidade, equipamento ou proporção entre direções.
- **Exigir geração externa no build:** torna CI, build offline e publicação dependentes de credenciais e disponibilidade.
- **Aceitar fonte sem licença e hash:** impede reprodução e auditoria.
- **Quebrar o schema v1 no lugar:** reinterpreta projetos existentes e viola compatibilidade.
