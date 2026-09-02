# Public Trial Deployment Design

## Goal

Publish a low-cost, public trial of Football Lottery Analysis Lab so people can
experience the implemented Stage 9 workflow, open genuine Issues, and decide
whether to contribute. The trial is evidence of accessibility and maintenance,
not evidence of adoption or guaranteed acceptance into Codex for Open Source.

## Scope

The first trial deploys the current `main` branch as one Render Free Docker web
service. It exposes the Vue application and Spring Boot API on one origin so the
browser-local OCR boundary remains unchanged.

The trial includes:

- the existing real browser-local Tesseract OCR flow;
- the existing editable draft, confirmation, analysis, plan, and review paths;
- an always-visible trial-data warning;
- a GitHub Issues feedback/contribution link;
- an automated Render blueprint and container build;
- a public health endpoint already backed by build identity.

It does not add authentication, analytics, payments, production storage,
multi-user isolation, external LLM credentials, or a new product feature.

## Runtime Architecture

1. A multi-stage Docker build installs Node dependencies, synchronizes the
   approved OCR assets, and builds the Vue application.
2. The Web build is copied into the Spring Boot static-resource directory only
   inside the container build layer; generated assets are not committed.
3. Spring Boot packages the API and Web build into one executable JAR.
4. A small SPA fallback serves `index.html` for approved application routes
   while `/api/**` remains handled only by API controllers.
5. The trial profile binds to `0.0.0.0:${PORT}` and disables the H2 Console.
6. H2 writes to an ephemeral trial directory. No persistent disk or external
   database is configured for this first release.

Render may suspend the free service after inactivity. A suspended service can
take about one minute to wake. A suspend, restart, redeploy, or upgrade may
remove all trial data.

## User-Facing Trial Notice

Every application page shows a non-dismissible banner with this meaning:

> Public trial: the first visit can take about one minute to start. Service
> sleep, restart, or upgrade can clear drafts, plans, and review data. Do not
> rely on this site to preserve important data. Do not upload sensitive images
> or images you do not have permission to use.

The screenshot-upload and draft-save screens repeat a shorter warning next to
their primary action. The notice links to the existing compliance page.

The banner also provides a visible **Report an issue / Contribute** action that
opens the repository's public GitHub Issues page. No usage counter or hidden
analytics is added.

## Privacy and Compliance

- Original images and complete OCR text remain browser-local under the existing
  Stage 9 boundary.
- The public trial accepts the rights-safe fictional fixture and user-owned
  inputs only.
- No OpenAI-compatible provider key is configured by default.
- The H2 Console is disabled in the public profile.
- Trial data is disposable and must not be described as durable storage.
- The simulation-only, no-purchase, no-profit, and minors boundaries remain
  visible and unchanged.

## Repository Changes

Expected implementation scope:

- one Dockerfile and `.dockerignore`;
- one `render.yaml` free-web-service blueprint;
- one Spring trial configuration file;
- one bounded SPA fallback controller/configuration;
- the shared application-shell warning plus two contextual warning placements;
- README trial URL, cold-start, data-reset, and feedback documentation;
- focused tests only where a changed unit already has a direct test seam.

## Minimal Verification

Only the following direct checks are required before delivery:

1. Build and start the Docker image, then confirm the health/build-identity
   endpoint and root page respond.
2. On the deployed URL, complete one smoke path: open the app, upload the
   rights-safe fictional sample, run local OCR, and save an editable draft.
3. Wait for the repository's single required GitHub `verify` check before
   merging the PR.

Do not repeat the full local Stage 9 gate, run unrelated suites, add a second
browser matrix, or perform load testing for this trial.

## Release Boundary

The first successful deployment is labeled **Public Trial**, not production.
Known cold-start, data-reset, single-user, Chromium, OCR-quality, and WDL-only
limitations are acceptable and documented. Bugs and improvement requests are
expected to be handled through public Issues and follow-up contributions.

Deployment requires the maintainer to authorize Render access to the GitHub
repository. That account-authorization step is the only planned manual gate
after the implementation PR is ready.
