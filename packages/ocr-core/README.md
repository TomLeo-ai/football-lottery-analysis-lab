# OCR Core

`@football-lottery-analysis-lab/ocr-core` is a framework-neutral package for OCR
candidate contracts and policy. It has no DOM, network, or storage access.

OCR candidates are untrusted evidence rather than authority. The browser adapter
belongs in `apps/web`, while the server revalidates all fields before it accepts
or uses a candidate.

