# Changelog

This file records implemented project changes. Public release and adoption
evidence is kept separately in
[`docs/oss-maintenance.md`](docs/oss-maintenance.md).

## Unreleased — v0.2.0 release candidate

This section is release-candidate preparation and evidence. It is **not a
release/adoption claim**: it does not mean that a `v0.2.0` tag or GitHub Release
exists, that an external user has adopted the project, or that Codex for Open
Source has approved it.

### Added

- Real Tesseract.js 7.0.0 OCR runs locally in the browser from packaged,
  same-origin worker, WebAssembly, and `eng`/`chi_sim` trained-data assets.
- Crop, rotation, and redaction are applied in the browser. Original image
  pixels and complete OCR text stay outside the backend and persistent browser
  storage; only the minimum editable structured candidate crosses the API
  boundary.
- Revisioned OCR review drafts can be saved and restored after page reload and
  backend process restart, then explicitly confirmed.
- Confirmed snapshots, analysis reports, and simulated plans carry
  server-authoritative workflow lineage. Client-asserted authority fields and
  missing or legacy parents are rejected for new writes.
- A private Stage 9 Chromium golden flow checks cold and warm local OCR, draft
  recovery, confirmation, rule-engine analysis, plan persistence and deep-link
  recovery, same-origin traffic, browser storage, logs, temporary files, and an
  isolated H2 database.

### Changed

- Root, Web, OCR Core, lockfile workspaces, and Spring Boot server versions are
  aligned at `0.2.0` without `SNAPSHOT`.
- `npm run verify:stage9` is the current release-readiness and CI gate.
  `npm run verify:stage8` remains a historical reproducibility command.
- New candidate writes accept only WDL markets and use UUID idempotency keys;
  draft revisions use compare-and-swap semantics.

### Internal API breaking change

- Clients must create and resume `/api/ocr/workflows`, write or read
  `/api/ocr/review-drafts/{ocrTaskId}`, and confirm through
  `/api/ocr/review-drafts/{ocrTaskId}/confirm` with an `Idempotency-Key`.
- The former `POST /api/ocr/review/confirm` endpoint is intentionally retained
  as a `410 Gone` tombstone (`LEGACY_CONFIRM_ENDPOINT_REMOVED`) so stale clients
  fail explicitly instead of producing an ambiguous write.

### Migration and compatibility

- Flyway migrations add workflow, operation, review-draft, authority, schema,
  provenance, and analysis-authority persistence.
- Authority columns added to existing Stage 8 records remain nullable. This
  **legacy null compatibility** keeps historical records readable, while new
  Stage 9 writes must provide complete server-authoritative lineage.

### Fixed

- Successful upload-to-review navigation now preserves the one-shot in-memory
  OCR handoff while ordinary navigation, cancellation, replacement, and failed
  navigation still clear private transient data.

### Candidate verification

```shell
npm ci
npm run verify:stage9
npm audit --json
npm audit --omit=dev --json
```

The exact candidate commit and its CI result must be recorded before a human
maintainer decides whether to create a tag or GitHub Release.

### Known limitations

- The candidate is a local, single-user research workflow, not a hardened
  multi-user production service.
- The real golden flow is locked to desktop Chromium; it is not a cross-browser
  compatibility certification.
- Only WDL review markets are supported in the trustworthy OCR path.
- Optional external LLM paths require backend credentials and are not part of
  the private Stage 9 golden-flow authority proof.

Codex assisted with implementation, tests, documentation, and release
preparation. A human maintainer remains responsible for review, merge, tags,
releases, repository settings, and every public statement.

## v0.1.1 — public release record

`v0.1.1` remains the latest public release recorded by the project's evidence
ledger at the time this candidate was prepared. See the
[GitHub Releases page](https://github.com/TomLeo-ai/football-lottery-analysis-lab/releases).
This historical entry does not claim downloads, users, adoption, or external
contributions.
