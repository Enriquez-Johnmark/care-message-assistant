# Decisions

Approved by the owner, newest last.

## 2026-11-10 (recorded in Lab Report Assistant's `docs/decisions.md`)

- **A healthcare series:** four portfolio projects, each in its own repository, built one at a time, each finished before the next: lab reports, care follow-up reminders, a care-team message assistant (this one) and a record-access audit.
- **Language:** TypeScript, with React pages.

## 2026-11-11

- **Repository:** created by the owner; work starts once Care Reminders is finished.
- **Wording of the real-company rule:** research documents may name real companies as cited sources.

## 2026-11-11 (later): standing approval

- **Standing approval:** the owner approved in advance every recommendation put to them ("approved if it's your recommendation, yes to all"; recorded first in Care Reminders' `docs/decisions.md`). Each decision below was taken under it, as recommended in `docs/research/README.md` (Open decisions).
- **Research:** done; started once Care Reminders was finished.
- **Brief, Round 1** (all eleven as recommended; `docs/product/brief.md`):
  1. Scope: replies to portal messages for one made-up primary care clinic, inside the clinic's queue; no patient chat, no auto-replies, no other channels.
  2. Four message types (medication/refill, symptom, test result, scheduling/admin), each tagged; scheduling and admin answered from fixed templates, not the model.
  3. The model sees only the message plus active conditions, current medications, allergies, the last 12 months of observations and upcoming appointments; never a name, date of birth, address, record number or contact details.
  4. The clinic's own written guidance goes to the model as versioned text; each draft records the version.
  5. A fixed, tested red-flag list runs in code before any model call; a flagged message gets no AI draft, goes to the top of the queue with a fixed "call 911 / 988 / the clinic now" reply; the model may raise urgency, never lower it.
  6. Blocking checks: no diagnosis; no starting, stopping or changing a medicine or dose; no medicine, value or date not in the record; no promise; within a length and about grade 8.
  7. Only a clinician approves, bound to the text's hash; any edit needs a new approval and is checked again.
  8. Every sent reply ends with the disclosure "This reply was drafted with the help of AI and reviewed and approved by [clinician]. To reach a person, call [clinic phone]."
  9. Replies go back into the made-up portal; messages are FHIR `Communication` linked by `inResponseTo`, from a pinned local HAPI FHIR server; no email or SMS.
  10. Measurement on about 80 labelled made-up messages: red-flag recall (target 100%), check pass/fail rates, unedited/edited/discarded shares, approval time; no claim of time saved.
  11. Claude Sonnet through `OWNER_ANTHROPIC_API_KEY`; the README states real use needs a provider that signs a BAA.
- **Spec** (as recommended; `docs/product/spec.md`): Example Community Clinic with an administrator, a clinician and front desk; 20 made-up patients and 80 labelled messages; a fixed red-flag list matched in code before any model, negations still flagged; admin messages from templates; seven blocking checks; only clinicians approve clinical replies; replies sent once into the portal with a disclosure added by code and written back as FHIR `Communication`; an append-only log; measurement on the labelled set, 40 bad drafts and Claude's recorded drafts; 37 acceptance criteria (A1–J1).
- **Architecture** (as recommended; `docs/architecture.md`): one TypeScript package (Fastify, `pg`, zod, the Anthropic SDK) with the React app in `web/`; the rules in `src/core/`; red flags run before the model client is built; recorded answers; approval and sending in one transaction, the FHIR write by conditional create; emailed-link logins; an append-only log enforced by a trigger; build order M1–M7.
- **Build:** approved; M1 starts.
