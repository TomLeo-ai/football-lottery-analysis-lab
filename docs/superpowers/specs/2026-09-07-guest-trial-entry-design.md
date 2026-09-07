# Guest Trial Entry Design

## Goal

Make the public trial immediately understandable and usable without creating an
authentication system. Visitors keep the existing project-introduction page and
use one explicit action to enter the trial workspace.

## Decision

Keep the current marketing home at `/`. Rename its two primary workspace links
from `进入工作台` to `免登录进入试用`. Both links continue to use Vue Router and
navigate directly to `/dashboard`.

The action does not:

- request an account, username, password, email, verification code, or consent
  to create an identity;
- call a login API;
- create a token, cookie, account record, browser session, or authentication
  state;
- imply that trial data is private, durable, or associated with a user account.

The existing non-dismissible public-trial warning remains visible above the
marketing home and workspace. It continues to explain cold start, disposable
data, sensitive-image, and unauthorized-image boundaries.

## Alternatives Considered

### Selected: rename the existing calls to action

This is the smallest change, keeps the repository presentation and compliance
context visible, and avoids making a fake login screen look like real identity
verification.

### Rejected: add a `/login` page with a no-op login button

This adds a route and screen that provide no functional value and can mislead
visitors into believing authentication or account isolation exists.

### Rejected: redirect `/` automatically to `/dashboard`

This is faster by one click but removes the public explanation of the project,
its open-source purpose, and its compliance boundary.

## User Flow

1. The visitor opens `/` and sees the project introduction and public-trial
   data-reset warning.
2. The navigation and hero each show `免登录进入试用`.
3. Clicking either action navigates directly to `/dashboard`.
4. The visitor can use the trial without identity or authentication state.

Render account login remains a separate maintainer-only deployment requirement.
It is never shown as part of the deployed trial application.

## Files and Validation

Modify only:

- `apps/web/src/views/MarketingHome.vue`
- `apps/web/src/views/MarketingHome.spec.ts`

Validation is limited to the existing focused MarketingHome test. The test must
assert that both direct `/dashboard` links use the new label and that account,
password, and verification-code fields are absent. No full Web suite, build,
backend test, or Stage 9 smoke is required locally; the repository's single
GitHub `verify` check remains the merge gate.

## Release Boundary

This change improves trial onboarding only. It does not add access control,
privacy isolation, durable storage, user analytics, or evidence of external
adoption. Bugs and feature requests remain welcome through the existing GitHub
Issues link.
