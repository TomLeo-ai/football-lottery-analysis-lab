# Contributing

Thank you for helping improve Football Lottery Analysis Lab.

## Required Boundaries

Contributions must preserve these rules:

- Do not submit official lottery page crawlers, mirrors, cache jobs, or republished official lottery datasets.
- Do not submit official screenshots, logos, copied page assets, or real official batch match, odds, draw, or result data.
- Do not add real purchase, payment, ticket issuing, proxy purchase, group purchase, following-order, deposit, or withdrawal capability.
- Do not add promotional copy that promises profit, certainty, recovery of losses, or guaranteed outcomes.
- Do not bypass anti-crawling, CAPTCHA, security policy, risk-control, or access-control systems.
- Keep sample data fictional and clearly marked as `DEMO DATA / FICTIONAL SAMPLE`.

## Development Flow

1. Keep each change focused on one independently verifiable stage.
2. Update documents when behavior or boundaries change.
3. Add tests or verification scripts for business logic and compliance-sensitive behavior.
4. Run local checks before opening a pull request:

```shell
npm run verify:stage8
```

## Pull Request Checklist

- The change is simulation-only and non-official.
- No official lottery data, screenshots, logos, or page assets are included.
- No real purchase, payment, or ticketing path is introduced.
- Fictional examples are labeled `DEMO DATA / FICTIONAL SAMPLE`.
- Compliance scan passes.
