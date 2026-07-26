# ADR 0043 — Backend do `NativeDiagnosticHost`

- Status: provisório
- Data: 2026-07-24
- Revisado: 2026-07-26 para separar SDL3 da política de renderer de produção
- Revisão: quando um gatilho do ADR 0031 ocorrer, e antes de portar para um console
- Fecha a pendência de: [ADR 0031](0031-native-diagnostic-host-trigger-and-criteria.md) e o item correspondente da seção 36 de [architecture.md](../../architecture.md)
- Fase: 11

## Contexto

O ADR 0031 decidiu que o `NativeDiagnosticHost` não é iniciado agora, definiu três gatilhos e deixou o backend concreto para um ADR próprio. Essa pendência mantém o item aberto na arquitetura e convida adição oportunista de dependência nativa quando o gatilho chegar.

Escolher agora não obriga a implementar agora. Obriga apenas que, no dia do gatilho, ninguém decida sob pressão.

Os critérios são objetivos: licença compatível, janela, input e áudio em uma única camada, build por CMake, portabilidade real para os sistemas suportados e um caminho conhecido para consoles, onde a camada precisa ser substituível sem reescrever o host.

## Decisão

### SDL3 é o backend escolhido

SDL3 é licenciado sob zlib, compila com CMake, cobre janela, eventos de input, teclado, mouse, gamepad e áudio na mesma biblioteca, e roda em Windows, macOS e Linux. Sua camada de plataforma é isolada, o que é exatamente a propriedade necessária para um port de console substituir o backend sem tocar no host.

Uma única dependência para janela, input e áudio é preferível a compor três bibliotecas: menos superfície, menos versões para fixar e menos combinações para testar.

### Como entra

SDL3 é vendor em adapter de borda dentro de `hosts/native-diagnostic/`, com versão fixada em `toolchain.lock` e no grafo CMake no momento da adoção. Kernel, gameplay, Lua, contratos e renderer não conhecem SDL.

O host implementa os mesmos contratos dos demais: consome buffers de apresentação do ADR 0020, publica `UiViewModel` e `RenderedUiSnapshot` com `renderer` próprio conforme o ADR 0014, implementa o backend de áudio com fallback observável do ADR 0025 e roda os mesmos cenários.

### O que ele não é

Ele não é um segundo caminho de simulação, não recebe renderer próprio fora dos contratos, e não é requisito para publicar o jogo. SDL3 cobre shell, janela, input e áudio; ele não decide renderer nem substitui a política WebGPU/WebGL2 do ADR 0047. Sua ausência continua sendo `HOST_NATIVE_DIAGNOSTIC_NOT_AVAILABLE`, como já definido pelo ADR 0031.

Códigos: `HOST_NATIVE_BACKEND_UNAVAILABLE`, `HOST_NATIVE_BACKEND_VERSION_UNSUPPORTED`, `HOST_NATIVE_AUDIO_UNAVAILABLE`.

## Consequências

- o último item aberto da seção 36 relativo a hosts fica decidido;
- no dia do gatilho, a implementação começa sem decisão de dependência pendente;
- uma dependência cobre janela, input e áudio, mantendo o bootstrap nativo pequeno;
- licença zlib não altera o regime de licenciamento do projeto;
- o caminho para console permanece substituir a camada de plataforma, não o host;
- nada é instalado ou compilado antes de um gatilho ocorrer.
- SDL3 não se torna dependência do host Electron nem backend nativo de produção por consequência deste ADR.

## Alternativas rejeitadas

- **GLFW mais miniaudio:** duas dependências, duas versões e nenhuma cobertura de gamepad unificada.
- **raylib:** conveniente, porém opinativo sobre loop e render, o que colidiria com o presentation protocol.
- **Qt:** tamanho e modelo de licenciamento desproporcionais a um host de diagnóstico.
- **Camada própria por sistema operacional:** trabalho de plataforma que não é o objetivo do programa.
- **Deixar a escolha para o dia do gatilho:** decisão sob pressão, com o item permanecendo aberto na arquitetura.
