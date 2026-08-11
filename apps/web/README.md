# Web App

Vue3 + Vite + TypeScript frontend for Football Lottery Analysis Lab.

## Current Page

- `/dashboard` - First-release workflow status dashboard.
- `/official-source-hub` - OfficialSourceHub external-link entry page.
- `/screenshot-upload` - Fictional screenshot task and local/mock OCR parsing page.
- `/ocr-review` - Manual OCR review and `USER_SCREENSHOT_CONFIRMED` snapshot page.
- `/match-workspace` - Read-only user-confirmed match workspace.
- `/strategy-simulator` - Mock AI/rule-engine analysis report page.
- `/saved-plans` - Simulated plan generation, save, list, and detail page.
- `/review-center` - Mock public result provider sync, pending review, match, settle, and review-result page.
- `/strategy-lab` - Read-only strategy revision rule library.
- `/about-compliance` - Compliance boundary summary page.

This page only displays external link metadata and compliance notices. It does not embed official pages, fetch official page content, or display official match, odds, result, or lottery data.

OCR pages use fictional data by default. OCR output stays blocked from AI analysis until the user confirms it.

The strategy simulator only accepts confirmed snapshots and generates a Mock rule-engine report. SavedPlans converts that generated report into a simulation-only saved plan and moves it to `PENDING_RESULT`. ReviewCenter syncs fictional Mock public result snapshots, loads pending review plans, runs match/settle actions, and displays failure reasons plus strategy revision rules.

The desktop shell exposes all workflow pages in the left navigation rail. The mobile shell keeps five primary bottom navigation entries and leaves secondary pages reachable through desktop navigation or page links.

## Commands

```shell
npm run dev:web
npm run lint:web
npm run test:web
npm run build:web
npm run smoke:stage8
```

Planned first pages:

- Dashboard
- ScreenshotUpload
- OcrReviewWizard
- MatchWorkspace
- StrategyLab
- AboutCompliance

All pages must show the non-official and simulation-only notice.
