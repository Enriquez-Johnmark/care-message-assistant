# AGENTS.md

**Care Message Assistant** helps a clinic's care team answer patients' portal messages: Claude drafts a reply from the patient's record and the clinic's own guidance, code checks it, a clinician edits and approves the exact text, and every step is in an append-only audit log. It works for any clinic; the demo uses a **made-up clinic with made-up patients**, and the repository names no real company. Working name; it may be renamed.

It is the third of four healthcare projects, each in its own repository: [Lab Report Assistant](https://github.com/Enriquez-Johnmark/lab-report-assistant) (done), [Care Reminders](https://github.com/Enriquez-Johnmark/care-reminders), the care-team message assistant (this one) and a record-access audit.

## Phases

Each gate needs the owner's explicit "yes"; an approval for one phase never carries into the next.

| Phase | Status |
| --- | --- |
| 1. Research | done (2026-11-11, `docs/research/README.md`) |
| 2. Brief | done, approved 2026-11-11 under the standing approval (`docs/product/brief.md`) |
| 3. Spec & acceptance criteria | done, approved 2026-11-11 under the standing approval (`docs/product/spec.md`, 37 criteria) |
| 4. Architecture | done, approved 2026-11-11 under the standing approval (`docs/architecture.md`) |
| 5. Build | done (2026-11-11), approved 2026-11-11: M1–M7, all 37 criteria proven (`docs/evidence/m6.html`, `docs/showcase/`) |

## Owner decisions

Every decision needing the owner's judgement goes through the `grilling` skill: numbered rounds of questions, each with a recommended answer, worded so "yes" accepts it. Look facts up yourself, using sub-agents for research; put only decisions to the owner. Record every approved decision, dated, in `docs/decisions.md`.

## Evidence

Research claims carry a source (URL, publisher, date) and a confidence (H/M/L). Label vendor claims as vendor claims. When evidence is missing, write "not found"; a gap stays a gap. Keep facts, hypotheses, recommendations and owner-approved decisions visibly distinct.

## Rules

- **No real company or patient.** No real company's name, branding or content, and no real patient data, anywhere in the repository, except that research documents may name real companies as cited sources (decided 2026-11-11).
- **A clinician approves every reply.** Nothing reaches a patient without approval, and the approval binds the exact text.
- **Model output is untrusted.** Parsed into strict types and checked by rules before a person sees it.
- **API key only.** The Claude API through the owner's key (`OWNER_ANTHROPIC_API_KEY`), never a Claude subscription; no data to free model tiers that train on inputs.
- **No compliance claims.** The README never says "HIPAA compliant" or "certified".
- **Language:** TypeScript, with React pages (decided 2026-11-10).
- **Report test results only from commands actually run.**
- **Red flags before the model.** An urgent message never reaches a model; code finds it first.
- **The model never sees who the patient is.** Requests carry only the record fields the spec allows; no name, date of birth, address, record number or contact details.
- **Tests:** test first (one criterion's test, see it fail, then make it pass); every acceptance criterion has a test whose name starts with its ID, e.g. `b2 a flagged message never reaches the model`.
- **Time:** read only through the injected `Clock` (`src/clock.ts`); ESLint bans `Date.now()` and `new Date()` elsewhere.
- **React:** read the `vercel-react-best-practices`, `vercel-composition-patterns`, `shadcn`, `frontend-design`, `web-design-guidelines` and `ui-taste` skills before writing or reviewing the React app; third-party skills are read in full before they're added and recorded in `skills-lock.json`.
- **Small commits** on `main`, each one change; messages imperative; no AI attribution trailers such as "Co-Authored-By" (owner's choice). Commits are signed with the owner's SSH key, so GitHub shows them as verified.

## Working here

- **Before every commit:** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and for changes under `web/`, `pnpm --dir web lint`, `typecheck`, `test` and `build` too.
- **Cloud sessions:** `scripts/cloud-session-start.sh` runs at session start (via `.claude/settings.json`): commit signing, Postgres, Mailpit and HAPI FHIR, and the packages.
- **Locally:** `docker compose --profile fhir up -d`; `cp .env.example .env` once; `pnpm install`; `pnpm test`.
