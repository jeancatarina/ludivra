# ADR 0003 — Licença MIT

- Status: aceito
- Data: 2026-07-18
- Revisado: 2026-07-26 para vincular incorporação de fonte externa a provenance verificável
- Complementa: [ADR 0055](0055-upstream-first-and-external-source-incorporation.md)

## Contexto

A Ludivra será pública e precisa permitir uso, modificação e distribuição com baixa fricção.

## Decisão

Distribuir o código próprio da Ludivra sob a licença MIT. Dependências, assets, SDKs e trechos incorporados de terceiros mantêm suas próprias licenças e continuam sujeitos à validação de release. Incorporação de fonte externa segue o processo do ADR 0055 e não muda automaticamente a autoria ou licença daquele código.

## Consequências

- uso comercial e redistribuição são permitidos;
- avisos de copyright e licença devem ser preservados;
- porções substanciais e forks externos exigem provenance e notices rastreáveis;
- não há garantia fornecida pelos mantenedores.
