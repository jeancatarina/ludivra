# Ludivra

Fundação da engine AI-first, text-first e code-first descrita em [architecture.md](architecture.md).

## Estado atual

- kernel C++20 determinístico mínimo;
- C ABI versionada;
- host native headless;
- CLI TypeScript com saída estruturada;
- schemas e testes de boundary.

## Bootstrap

```sh
pnpm install
pnpm build
pnpm test
pnpm --silent game -- doctor --format json
pnpm --silent game -- test --format json
```

Consulte [AGENTS.md](AGENTS.md) antes de contribuir. Limitações e próximos marcos estão em [BACKLOG.md](BACKLOG.md).
