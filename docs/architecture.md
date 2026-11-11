# Architecture

Status: **decided 2026-11-11** under the owner's standing approval (`docs/decisions.md`). The spec is [product/spec.md](product/spec.md). The patterns come from [Lab Report Assistant](https://github.com/Enriquez-Johnmark/lab-report-assistant) and [Care Reminders](https://github.com/Enriquez-Johnmark/care-reminders) (Rust, on Nudgewright) and [Review Triage Agent](https://github.com/Enriquez-Johnmark/review-triage-agent) (TypeScript).

## Shape

One TypeScript package for the server, with the React app in `web/`:

| Folder | Holds | Criteria |
|---|---|---|
| `src/core/` | The rules, with no input or output: red flags, the checks, the reading level, content hashes, fill-ins | B1, D1–D7 |
| `src/fhir/` | The strict FHIR R4 reader and the client for the clinic's FHIR server | H2, F4 |
| `src/model/` | The model client: live (Claude) and recorded (for tests and the demo); the request builder | A2, C1, C3 |
| `src/store/` | Postgres: the pool, numbered SQL migrations and the repositories | G1, G2 |
| `src/intake.ts` | Taking in a message: red flags, sorting, then a draft or a template | B2–B4, C2, C4, C5 |
| `src/review.ts` | Approve, edit, write by hand, discard | E1–E4 |
| `src/sending.ts` | Sending an approved reply once, into the portal and the FHIR server | F1–F4 |
| `src/api/` | The JSON API (Fastify) for the staff pages and the portal, and emailed-link logins | A4, H1 |
| `src/eval.ts`, `src/evidence.ts` | The measurement report and the evidence pack | I1–I3, J1 |
| `src/cli.ts` | The commands: `migrate`, `load-made-up`, `fetch`, `serve`, `eval`, `evidence` | |
| `web/` | The React app: the staff pages and the patient portal | |
| `demo/`, `evalset/` | The made-up patients and messages, the bad drafts, the recorded answers | A1 |

The safety rules live in `src/core/` and are called by every way in (the API, the commands, the measurement), so none can skip a rule. Model output, message text and anything from the FHIR server are untrusted: parsed with zod, never echoed into SQL or HTML.

## One clinic

The demo has one made-up clinic, so tables carry no clinic column; the patient boundary (A4) is the one that matters, and every portal query filters on the logged-in patient. A second clinic would add a clinic column to every table, as Care Reminders does.

## Red flags come first

`intake` runs the red-flag list before anything else. A flagged message is stored, logged and queued as urgent with the clinic's urgent template, and the function returns before the model client is even built for it (B2 tests this with a model that fails the test if called). The model's urgency is stored separately and only orders unflagged messages (B4).

## The model

Behind an interface with two versions, as in Review Triage Agent:

- **Live:** the official Anthropic SDK with `OWNER_ANTHROPIC_API_KEY` (never `ANTHROPIC_API_KEY`), `claude-sonnet-5-5`.
- **Recorded:** replays saved answers under a fingerprint of the model and the exact request, so tests, CI and the demo need no key and cost nothing; a request nobody recorded fails rather than reaching a model.

The request type is built from a `RecordFacts` value that has no field for a name, birth date, address, identifier or contact, so A2 holds by construction; a test also searches every request for the patients' identifying values.

## Approval and sending

- An **approval** stores the SHA-256 of the exact reply text and the clinician; one approval covers one draft.
- **Sending** happens in one database transaction with the approval: a `replies` row unique on the message, holding the text with the disclosure added. A second approval of the same message finds the row and sends nothing (F2).
- Writing the reply to the FHIR server is a follow-up step: a `fhir_writes` row is recorded before the call, and the call is a conditional create (`If-None-Exist` on the reply's identifier), so a retry after a crash never makes a second `Communication`. A worker retries pending writes.
- Before a reply is stored, the text is checked to hash to the approval, so a changed text is never sent (E2).

## Logins

Emailed links through Mailpit's send API in development: a single-use token, hashed in the database, valid for 15 minutes, giving a session cookie (HttpOnly, SameSite=Lax). Staff and patients have separate sessions; every staff route checks the role, every portal route the patient.

## The activity log

An `audit_events` table with a trigger that refuses `UPDATE` and `DELETE` (G2). Every step writes to it in the same transaction as the change it records.

## Time

Read only through an injected `Clock`; ESLint bans `Date.now()` and `new Date()` with no arguments outside `src/clock.ts`.

## Checks before every commit

`pnpm lint`, `pnpm typecheck` and `pnpm test` (Vitest, against Postgres and a HAPI FHIR server), and for `web/` its own lint, typecheck, tests and build. CI also runs the browser tests and builds the evidence pack.

## Build order

| Milestone | What | Criteria | Status |
|---|---|---|---|
| M1 | Data and FHIR: the made-up patients and messages, HAPI FHIR, the strict reader, the made-up check, the evidence pack, CI | A1, A3, H2, J1 | done (2026-11-11) |
| M2 | Red flags and checks, with the 40 bad drafts | B1, D1–D7, I1 | done (2026-11-11) |
| M3 | Sorting and drafting: the model client, recorded answers, intake, the guidance | A2, B2, B4, C1–C5 | planned |
| M4 | Logins, review and the activity log, with the staff pages | B3, E1–E4, G1–G3, H1 | planned |
| M5 | Sending and the portal | A4, F1–F4 | planned |
| M6 | Measurement: Claude's recorded drafts, red-flag recall, the review report | I2, I3 | planned |
| M7 | Showcase: README, screenshots, walkthrough video, portfolio page | none | planned |

Each milestone ends with a code review and an evidence page.
