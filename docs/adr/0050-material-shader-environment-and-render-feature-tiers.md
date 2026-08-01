# ADR 0050 — Materiais, shaders, ambiente e tiers de renderização

- Status: provisório
- Data: 2026-07-26
- Revisão: antes do primeiro shader customizado de produção ou de promover uma feature avançada a obrigatória
- Complementa: [ADR 0047](0047-desktop-rendering-profiles-and-backend-policy.md) e [ADR 0049](0049-asset-ingest-cooking-and-residency.md)
- Fase: 8

## Contexto

O renderer atual possui quatro superfícies e valores fixos de iluminação. A arquitetura cita PBR, toon, fog e pós-processamento, mas não define um contrato de materiais, tiers ou política para shaders customizados. Expor propriedades de Three.js no conteúdo resolveria o primeiro efeito e impediria um segundo renderer.

## Decisão

### Materiais semânticos

Os modelos públicos iniciais são `unlit`, `pbr-metallic-roughness`, `toon`, `transparent`, `decal`, `particle` e `ui`. Cada modelo possui schema versionado, texturas por papel semântico, color space explícito, alpha mode, sidedness e parâmetros limitados. Materiais referenciam assets por ID.

### Tiers de feature

| Tier | Obrigatório |
|---|---|
| `core` | PBR/unlit, luz direcional/pontual/spot, shadows básicas, fog de profundidade/altura, tonemap e color grading |
| `enhanced` | melhor filtragem de sombras, SSAO, bloom, DOF, decals e reflection probes quando suportados |
| `advanced` | fog volumétrico, compute effects, reflexos ou iluminação indireta em tempo real quando o backend e o budget permitirem |

`web-compatible` exige `core`; `desktop-compatible` exige `core` e pode habilitar `enhanced`; `desktop-high` exige `core` e `enhanced`. `advanced` é opt-in até um jogo de prova aprová-lo.

### Sem linguagem de shader própria

A Ludivra não cria uma linguagem universal de shader. Material semântico é a superfície portátil. Shader customizado é uma extensão de renderer: declara método, entry points, recursos, permissões, variantes, fallback material e targets. Ausência de implementação compatível falha na validação quando o efeito for obrigatório.

Shaders e pipelines são compilados ou aquecidos antes do primeiro uso observável. Compilação durante gameplay registra stutter, variante, material e origem. Erro de shader possui código próprio e nunca aparece como erro genérico de script.

### Ambiente e câmera

Scene referencia um environment textual com sky, exposição, tonemap, fog, ambient light, shadow profile e cadeia de pós-processamento. Câmera pode selecionar ou sobrescrever environment por ID, sem carregar objetos de renderer no estado lógico.

O primeiro corte dessa superfície é `rendering.environments` no manifest v5, com um perfil para Browser e outro para Desktop. Cada perfil declara ID, tier `core`/`enhanced`, sky, exposição, fog, as três luzes semânticas e sombra `basic`/`soft`. O BrowserHost entrega o perfil escolhido ao renderer antes do primeiro frame; `web-compatible` rejeita um environment `enhanced`, enquanto Desktop pode declarar esse tier. A inspeção e o smoke Electron registram o ID/tier efetivo, para que o tier não seja apenas configuração sem evidência.

Os valores ainda servem como environment-base; `setAtmosphere` continua uma sobrescrita efêmera de apresentação para o gameplay. Material IDs, texturas por papel, shaders customizados e warmup de variantes são os próximos cortes desta decisão.

Códigos: `MATERIAL_MODEL_UNSUPPORTED`, `MATERIAL_TEXTURE_ROLE_MISSING`, `SHADER_TARGET_UNSUPPORTED`, `SHADER_COMPILE_FAILED`, `SHADER_VARIANT_WARMUP_MISSED`, `RENDER_FEATURE_TIER_UNAVAILABLE`, `ENVIRONMENT_PROFILE_INVALID`.

## Consequências

- conteúdo descreve aparência sem conhecer Three.js;
- qualidade desktop cresce por tiers mensuráveis, não por flags soltas;
- shader customizado continua possível sem criar uma nova linguagem;
- fallback visual é declarado por material e target;
- falhas e stutter de shader passam a ser diagnosticáveis.

## Alternativas rejeitadas

- **Expor classes e propriedades do Three.js:** quebra portabilidade e espalha vendor pelo projeto.
- **Criar shader graph visual:** contradiz o fluxo text-first e exige editor.
- **Criar linguagem própria de shader:** custo de compilador e tooling sem consumidor que o justifique.
- **Ativar todas as técnicas avançadas por padrão:** quebra budgets e hardware compatível.
- **Compilar variantes no primeiro frame de uso sem registro:** transforma pipeline miss em travada inexplicável.
