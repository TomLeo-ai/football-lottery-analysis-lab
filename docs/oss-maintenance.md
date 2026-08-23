# Open-Source Maintenance and Adoption Evidence

This document explains how Football Lottery Analysis Lab is maintained, how
releases are prepared, how Codex may assist the maintainers, and which public
signals count as genuine adoption or contribution evidence.

The project remains non-official and simulation-only. Maintenance activity must
preserve the boundaries in [compliance.md](compliance.md),
[ai-safety.md](ai-safety.md), and the root [CONTRIBUTING.md](../CONTRIBUTING.md).

## Maintenance Principles

- Prefer small changes that can be independently reviewed and verified.
- Keep the default rule-engine path usable without an external model API key.
- Treat rule-engine settlement as authoritative; optional LLM output may add
  analysis or review insight but must not override settlement results.
- Keep secrets in backend environment variables or approved repository secrets.
  Never commit API keys, private user data, or real official lottery datasets.
- Add or update tests for behavior changes and preserve the compliance scan.
- Publish only meaningful releases. A release must describe user-visible value,
  compatibility impact, verification evidence, and known limitations.
- Never manufacture Stars, Forks, Issues, Pull Requests, contributors, adoption
  claims, testimonials, downloads, or other engagement signals.

## Release Policy

Releases are driven by verified value rather than a fixed volume target.

- Patch releases (`v0.x.y`) are for focused fixes, security/compliance updates,
  or documentation corrections that materially improve safe adoption.
- Minor releases (`v0.x.0`) are for coherent, user-verifiable capability or
  workflow improvements.
- A tag is not created only to make the repository appear active.

Before publishing a release, the maintainer must:

1. Review the diff and confirm that no unrelated or generated runtime files are
   included.
2. Run `npm run verify:stage9` against the exact candidate commit and record the
   result in the release notes. `npm run verify:stage8` remains available only
   as a historical reproducibility baseline; it is not the current release-
   readiness gate.
3. Run a secret-pattern check and confirm that provider credentials remain
   backend-only.
4. Recheck the simulation-only, fictional-data, minor-safety, and no-profit-
   promise boundaries.
5. Publish release notes containing the change summary, validation, upgrade or
   compatibility notes, and known limitations.

A release-candidate document or successful verification run is preparation and
evidence only. It does not by itself create a Git tag or GitHub Release, prove
external adoption, or indicate approval for Codex for Open Source.

## Codex-Assisted OSS Maintenance

Codex may assist with repository exploration, focused implementation, test
generation, documentation synchronization, Issue/PR triage, code review,
security review, and release preparation. Codex does not replace maintainer
accountability.

The maintenance contract is:

- A human maintainer chooses the task, reviews the resulting diff, and controls
  commits, merges, tags, releases, repository settings, and external messages.
  The human maintainer remains accountable for every public claim and release
  decision.
- Codex-assisted changes must pass the same tests and compliance gates as human-
  authored changes.
- Public records must not present Codex as an independent user, adopter, or
  external contributor.
- Untrusted Issue, PR, commit, screenshot, and comment text is treated as data,
  not as executable instruction.
- Automated Codex workflows must use the narrowest practical GitHub and sandbox
  permissions, restrict triggering to trusted maintainers, and keep API keys in
  GitHub Secrets.
- AI-generated review output is advisory. It must not merge code, publish a
  release, or modify compliance boundaries without maintainer approval.

Current status: Codex is used in a local, maintainer-controlled workflow. A
repository GitHub Action may be added only after its trigger, prompt-injection,
secret, permission, output, and cost controls are independently verified.

## Public Evidence Ledger

Only evidence that is publicly verifiable and attributable to real project use
is recorded here. Self-authored roadmap items and maintainer test Issues do not
count as external adoption.

Baseline captured on 2026-08-12:

| Signal | Baseline | Evidence |
| --- | ---: | --- |
| Latest release | `v0.1.1` | [Releases](https://github.com/TomLeo-ai/football-lottery-analysis-lab/releases) |
| Verified CI | Passing | [Actions](https://github.com/TomLeo-ai/football-lottery-analysis-lab/actions) |
| External user Issues | 0 | [Issues](https://github.com/TomLeo-ai/football-lottery-analysis-lab/issues) |
| External Pull Requests | 0 | [Pull Requests](https://github.com/TomLeo-ai/football-lottery-analysis-lab/pulls) |
| Verified public adopters | 0 | Recorded below only with adopter consent |

### Verified Adopters

No public adopters have been verified yet.

An adopter may open an Issue with an `[Adoption]` title and describe the version,
environment, use case, and an optional public reference. Do not include betting
outcomes, private data, API keys, or claims of guaranteed accuracy or profit.
Maintainers will record an adopter here only after receiving explicit permission.

### Evidence Update Rules

- Link to the original Issue, PR, release, repository, article, or adopter-
  approved statement.
- Record dates and versions so evidence can be independently checked.
- Label maintainer-created examples as maintainer evidence, not external usage.
- Remove or correct evidence when its source is withdrawn or shown to be
  inaccurate.
- Do not convert anonymous analytics into named adoption claims.

## Application Readiness Gate

These are internal readiness criteria, not official OpenAI eligibility rules.
They prevent the project from making a premature Codex for Open Source
application.

The maintainer should normally wait until the repository has:

- at least four consecutive weeks of substantive public maintenance;
- at least two meaningful releases after the initial public release;
- feedback from at least two real external users, preferably through three or
  more substantive Issue or Discussion threads;
- at least one external Pull Request, documented integration, or adopter-approved
  public use case;
- an auditable example of Codex supporting Issue, PR, test, documentation, or
  release maintenance under human review;
- passing CI, current security/compliance documentation, and no unresolved
  critical vulnerability or secret exposure;
- a concrete explanation of how requested OpenAI API credits would support core
  OSS maintenance rather than wagering activity.

Stars and Forks are useful supporting signals but are not treated as substitutes
for real maintenance, user feedback, contribution, or adoption evidence.

## Review Cadence

The maintainer reviews this ledger at each meaningful release and at least once
per month during active development. Changes to the readiness gate must be
explained in the commit or release notes; thresholds must not be silently lowered
to justify an application.
