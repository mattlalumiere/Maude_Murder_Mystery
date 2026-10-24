# ADR-0003: Ports and adapters for every external dependency

- Status: accepted
- Date: 2026-10-20

## Context

Today the app mixes storage and vendor SDK choices (DynamoDB, S3, Bedrock) into library code. That blocks portability and makes tests slow.

## Decision

The app depends only on TypeScript interfaces (ports): `Store`, `MediaStore`, `TextModel`, `ImageModel`, `Moderator`, `Clock`, `Ids`. Each environment supplies adapters, selected by environment variables only (`STORE_ADAPTER`, `MEDIA_ADAPTER`, `AI_TEXT_ADAPTER`, ...). Vendor SDKs are imported only inside adapter files. Every port has a shared contract test suite that every adapter must pass.

## Consequences

- Tests use `memory`, `Clock` and `Ids` fakes: fast, deterministic.
- Adding a cloud means adding one adapter plus passing the contract suite.
- Slight indirection cost; accepted.
