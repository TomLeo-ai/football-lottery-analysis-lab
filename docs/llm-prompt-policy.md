# LLM Prompt Policy

This project keeps prompt packs inside the repository so runtime behavior is auditable and does not depend on personal Codex skills.

## Runtime Prompt Files

- `apps/server/src/main/resources/prompts/danche-prediction-v1.md`
- `apps/server/src/main/resources/prompts/danche-review-insight-v1.md`
- `apps/server/src/main/resources/prompts/danche-safety-guard-v1.md`

## Policy

1. Prompts must require JSON output.
2. Prompts must require `strategyParameters` and must not hard-code budget, ticket count, entertainment-ticket cost, play preferences, or max parlay legs.
3. Prediction prompts may explain probabilistic simulation only; they must not present output as official advice.
4. Review prompts may explain rule-engine settlement only; they must not modify settlement status, actual score, or actual return amount.
5. Safety prompts must include a prohibited-expression list and must require non-official, research-only, no-certainty language.
6. API keys are read only from backend environment variables and must not appear in prompts, logs, database records, frontend responses, or audit payloads.
7. OpenAI-compatible providers may return pure JSON or complete `markdown fenced JSON`; both forms must pass the same validator after fence normalization.

## DeepSeek Stage Configuration

DeepSeek verification uses:

```text
providerKey=deepseek
baseUrl=https://api.deepseek.com
modelId=deepseek-v4-pro
apiKeyEnvName=DEEPSEEK_API_KEY
```

The real API key must be set only in the backend process environment, for example in PowerShell:

```shell
$env:DEEPSEEK_API_KEY="replace-with-your-deepseek-key"
```

Do not persist real keys in repository files, documentation, H2/MySQL records, frontend responses, logs, or test snapshots.

## Prediction Prompt Contract

`danche-prediction-v1` must require these JSON fields:

```text
parameterUsage
scorePredictions
upsetFocus
stableMatches
ticketGroups
finalDecision
ledgerSnapshot
complianceNotice
```

The prompt may use the strategy discipline of "main ticket for probability, upset ticket for direction, exact-score ticket only as entertainment", but concrete budget, ticket count, cost cap, preferred plays, excluded plays, and max parlay legs must come from `strategyParameters`.

The model must not invent injuries, lineups, market movement, internal information, or official data. If the input lacks evidence, it should classify the point as information risk instead of inventing details.

## Review Insight Prompt Contract

`danche-review-insight-v1` must require these JSON fields:

```text
settlementAuthorityNotice
ticketReviewNarratives
failureClassifications
strategyRevisionSuggestions
nextRoundParameterSuggestions
doNotOverreactEvents
complianceNotice
```

The prompt must state that rule-engine settlement is locked. The model may explain each ticket, classify failure reasons, suggest next-round parameter changes for manual review, and list events that should not trigger overreaction. It must not modify settlement status, actual score, actual return amount, or result source.

## Safety Prompt Contract

`danche-safety-guard-v1` is always prepended to prediction and review insight calls. It must require:

- non-official simulation/review wording;
- technical research and workflow validation framing;
- no certainty or profit language;
- strict JSON output;
- strict `strategyParameters` compliance;
- no prohibited promotional expressions.

## Audit Contract

LLM audit rows are written to `llm_invocation_audit`. They store:

```text
inputHash
outputHash
promptTokens
completionTokens
totalTokens
latencyMs
safetyStatus
errorCode
```

The audit service stores SHA-256 hashes of the input and output payloads. It must not store API keys, full system prompts, full user prompts, screenshots, or raw model output. `safetyStatus=BLOCKED` means validation caught a policy or structure violation and the output must not be treated as a usable report or insight.

## Versioning Rules

- Prompt version strings are request-visible and stored with analysis reports, review records, and audit rows.
- A new prompt version must be added as a new file instead of silently changing historical semantics.
- Existing persisted reports and review records must keep their original `promptVersion` and `strategyParameters` snapshots.
