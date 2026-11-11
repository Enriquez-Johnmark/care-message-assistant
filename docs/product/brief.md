# Brief: Care Message Assistant

Status: **approved** (2026-11-11, Round 1, under the owner's standing approval of every recommendation; `docs/decisions.md`). The spec (`spec.md`) is decided from it. "Care Message Assistant" is a working name.

## In one sentence

An AI assistant for a clinic's care team: when a patient sends a portal message, code checks it for red flags first, Claude drafts a reply from the patient's record and the clinic's own guidance, code checks the draft, and a clinician edits and approves the exact text before it reaches the patient. Every step is in an append-only audit log.

## Why it exists

A portfolio project for AI roles in health software, and the third of four healthcare projects, after [Lab Report Assistant](https://github.com/Enriquez-Johnmark/lab-report-assistant) and [Care Reminders](https://github.com/Enriquez-Johnmark/care-reminders). It shows what matters when AI helps answer patients: an urgent message is never left to the model, a draft can't state what the record doesn't say, a clinician approves the exact text, and the clinic can prove every step.

## The problem

Portal messages have grown far faster than visits (`docs/research/README.md` §1):

- patient-written messages rose 153% from 2020 to 2025, while visits rose about 17%;
- primary care physicians spend about 52 minutes a workday in the inbox, over a third of it after hours, and more inbox work is linked to burnout;
- many messages are administrative: in one large system, refills were nearly half and scheduling nearly a fifth.

AI drafts are already offered inside the big record systems. The published studies (§2) find they **don't save time**, though clinicians report less burden. They are rated more empathetic, but they are longer and harder to read. In one study, 7.7% of unedited drafts could have caused severe harm, most often by not telling the patient to seek urgent care, and reviewing physicians missed most planted errors. So the useful product is not "AI answers patients". It is: urgent messages are caught in code before any model runs, the draft is checked against the record, a clinician approves it, and every claim is measured.

## Who uses it

- **A clinician** (a physician or nurse) reviews each drafted reply beside the message and the record, edits it, and approves, rewrites or discards it. Only a clinician may approve.
- **A front-desk staff member** handles scheduling and admin messages from the clinic's templates, and sees the queue.
- **A patient** sends a message in the made-up portal and reads the approved reply there.
- **A clinic administrator** edits the clinic's guidance and templates, and sees the audit log.

(In the portfolio, all of them are shown in a demo of a made-up US primary-care clinic.)

## What it does (first version)

1. **Takes in portal messages** from the clinic's made-up portal, stored as FHIR R4 `Communication`, with the patient's record (conditions, medications, allergies, recent observations, appointments) from a local HAPI FHIR server.
2. **Checks for red flags in code first,** before any model call: chest pain, trouble breathing, stroke signs, thoughts of self-harm and other listed emergencies. A flagged message gets no AI draft. It jumps to the top of the queue with a fixed "call 911 / 988 / the clinic now" reply ready to approve. The model may raise a message's urgency, never lower it.
3. **Sorts each message by type:** medication question or refill, symptom question, test-result question, or scheduling/admin. Scheduling and admin are answered from the clinic's fixed templates, not the model.
4. **Drafts a reply** with Claude from the message, the clinic's written guidance (versioned) and only the record data allowed: active conditions, current medications, allergies, the last 12 months of observations and upcoming appointments. Never a name, date of birth, address, record number or contact details; code fills in names afterwards.
5. **Checks the draft in code:** no diagnosis; no starting, stopping or changing a medicine or dose; no medicine, value or date that isn't in the record; no promise of a time or outcome; within a length and about an 8th-grade reading level. A failed check blocks the draft with the reason.
6. **Lets a clinician approve** the exact text. Edits are checked again; the approval binds the text's hash, and any change needs approving again.
7. **Sends the reply** back into the portal, once, ending with: "This reply was drafted with the help of AI and reviewed and approved by [clinician]. To reach a person, call [clinic phone]."
8. **Logs every step** in an append-only audit log.
9. **Measures itself** on a labelled set of about 80 made-up messages: red-flag recall (target: every one), check pass and fail rates, how many drafts are sent unedited, edited or discarded, and approval time. It never claims to save time.
10. **Produces an evidence pack** linking each acceptance criterion to the test that proves it.

## What it must never do

- Let a model decide that a message isn't urgent, or draft a reply to a flagged message.
- Send a reply nobody approved, or a different text from the one approved, or a reply approved by someone who isn't a clinician.
- Diagnose, start, stop or change a medicine or dose, or state a medicine, value or date that isn't in the record.
- Send the model a patient's name, date of birth, address, record number or contact details.
- Use real patient data, or a real company's name or branding.
- Claim to be "HIPAA compliant" or certified, or claim it saves clinicians time. The README says that any real use needs a model provider that signs a business associate agreement.

## How success is shown

- **Red-flag recall** on the labelled set: every planted emergency caught (`§4` of the research found no published figures to compare with, so the set is the measure).
- **The checks, measured** on drafts with planted faults (a made-up dose change, a medicine not in the record, a promise, a diagnosis): every one blocked, and the good drafts wrongly blocked reported.
- **Claude's recorded drafts** put through the same checks, with the pass rate and cost reported.
- **Safety tests that always pass:** nothing unapproved, changed or flagged-but-drafted is ever sent.
- **The evidence pack**, published with each commit; a README with screenshots and a walkthrough video, and a page on the owner's portfolio.

## Technology (proposed)

**TypeScript** on Node (decided 2026-11-10), with a JSON API and **React** pages for the staff and the made-up portal; **Postgres 17**; **Claude** through the owner's API key (`OWNER_ANTHROPIC_API_KEY`), Sonnet by default, with recorded answers so tests and CI need no key; FHIR R4 from a local **HAPI FHIR** server, with patients and their records written by hand (Synthea gives records but not messages, and the public message sets pair messages with real de-identified records, so they're not used); Vitest and Playwright; GitHub Actions. Nudgewright is a Rust library, so this project borrows its ideas (approval bound to a hash, idempotent sends, an append-only log) rather than its code. The details are decided in the spec and the architecture.

## Not in the first version

Email or text-message replies, patient-facing chat or auto-replies, other channels (phone notes, fax), billing for e-visits, writing back to a real record system, and voice.
