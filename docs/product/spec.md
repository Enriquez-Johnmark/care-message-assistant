# Spec: Care Message Assistant

The single source for spec decisions. The brief is `brief.md`. Status: **complete** (decided 2026-11-11 under the owner's standing approval; `docs/decisions.md`), with 37 acceptance criteria.

## Words

- A **message** is one patient's portal message to the clinic. A **reply** answers one message.
- A message's **type** is one of: **medication** (questions and refills), **symptom**, **test result** or **admin** (scheduling and everything else).
- A **red flag** is a phrase from the clinic's fixed list that may mean an emergency. A **flagged** message has one.
- A **draft** is a reply's text before approval; an **approved reply** is one a clinician approved.
- A **check** is a rule in code that a draft must pass before a person sees it.
- The **guidance** is the clinic's own short written instructions for replies; each change makes a new **guidance version**.
- The **record** is what the model may see of the patient: active conditions, current medications, allergies, observations from the last 12 months and upcoming appointments.

## The made-up clinic

- **Example Community Clinic**, a made-up US primary-care clinic.
- Four people: an **administrator** (edits the guidance and templates, sees the log), a **clinician** (Dr. Example Lee, who approves replies), a **front desk** member (answers admin messages from templates; cannot approve clinical replies) and the **patients**.
- Every page, file and reply says the clinic and patients are made up.

## Made-up data

- **20 made-up patients**, written by hand as FHIR R4 from a fixed file, each with conditions, medications, allergies, recent observations and appointments, every resource marked as test data (`HTEST`).
- **80 labelled made-up messages** (`evalset/messages.json`), each with its patient, its type, whether it is a red flag and why. At least 15 are red flags, and at least 10 are tricky: a red flag in casual words or odd spelling, a negated symptom ("no chest pain, just a cough"), a question about a medicine the patient doesn't take, and a request to change a dose.
- The demo's inbox holds 30 of them, as FHIR `Communication` on a local HAPI FHIR server.

## Red flags, before any model

- A fixed list in code: chest pain or pressure, trouble breathing, stroke signs (face drooping, arm weakness, slurred speech), thoughts of suicide or self-harm, severe bleeding, a severe allergic reaction, fainting, overdose, and a stiff neck with fever.
- Matching ignores case, punctuation and repeated letters, and covers common short forms. A negated phrase is still flagged: a false alarm costs a moment, a miss can cost a life.
- A flagged message gets **no model call at all**. It goes to the top of the queue marked urgent, with the clinic's fixed urgent reply ready to approve ("…please call 911 now, or 988 for thoughts of suicide, or call the clinic at…").
- For other messages the model also gives an urgency (routine or soon); it can raise a message's place in the queue but never lower it below a red flag.

## Sorting and drafting

- The model sorts each unflagged message into a type, as strict JSON. **Admin** messages are answered from the clinic's fixed templates, never the model.
- For the other types the model drafts a reply from:
  - the message text;
  - the record, as plain facts with no name, date of birth, address, record number or contact details;
  - the current guidance version.
- It writes `{first_name}` where the patient's name goes; code fills it in.
- The draft records the guidance version and the model.
- **Claude Sonnet** drafts by default, through the owner's key; its answers are recorded, so tests, CI and the demo need no key. Without a model, the clinician writes the reply by hand.

## Checks on every draft

A draft is **blocked**, with each problem and what was found shown, if it:

1. **diagnoses**: says the patient has, or likely has, a condition ("you have…", "this sounds like…", "you are diagnosed with…");
2. **changes a medicine**: tells the patient to start, stop, increase, decrease, double, halve or skip a medicine or dose;
3. names a **medicine not in the record**;
4. gives a **number or date not in the message or the record** (a dose, a value, a day);
5. **promises**: a time, a callback or an outcome ("we'll call you today", "this will clear up", "guaranteed");
6. is **too long** (over 150 words) or reads **above 8th grade**;
7. has a fill-in not on the list, or misses `{first_name}`.

The clinician's own edits go through the same checks.

## Review

- The **queue**: red flags first, then by urgency, then oldest first. Each row shows the type, the urgency and whether a draft passed.
- The **review page**: the message, the record beside it, the draft with its problems, and the guidance version.
- A **clinician** can **approve** the exact text, **edit** it, **write one by hand**, or **discard** the draft with a reason (the message stays open). Front-desk staff can approve only admin templates.
- An approval binds the text's **content hash**; any later change needs approving again.

## Sending

- An approved reply goes into the portal **once**: a second approve, a double click or a retry never sends it twice.
- Code adds the disclosure at the end: "This reply was drafted with the help of AI and reviewed and approved by Dr. Example Lee. To reach a person, call (555) 010-0200." A reply written by hand says "written and approved by". An admin template says "sent by the front desk".
- The reply is written to the FHIR server as a `Communication` with `inResponseTo` the message.
- A **patient** logs into the made-up portal with an emailed link and sees only their own messages and approved replies.

## The activity log

- Every step is in an **append-only** log the database refuses to change: received, flagged, sorted, drafted, checked, edited, approved, discarded, sent, guidance changed.
- Each message has its timeline; the administrator sees the whole log, filtered by person and step.

## How it is measured

| Set | What it holds | Target |
|---|---|---|
| Labelled messages | the 80 made-up messages | every red flag flagged; false alarms reported |
| Bad drafts | 40 hand-written drafts, each with one planted fault | every one blocked by the check it was written to trip |
| Claude's drafts | Claude's draft for every unflagged, non-admin labelled message, recorded | at least 90% pass; every failure listed |
| Review | the demo's log | unedited, edited and discarded shares and approval time, reported; no claim of time saved |

## The evidence pack

- A page, built on every push, linking each acceptance criterion to the tests that prove it. CI fails if a finished milestone's criterion has none passing.

## Tooling

- **TypeScript** on Node 22, Fastify, `pg` with numbered SQL migrations, zod for every input and every model answer; the official Anthropic SDK.
- **React**, TypeScript and shadcn for the staff pages and the portal, in the clinical look of Lab Report Assistant.
- **Postgres 17**, **HAPI FHIR** v8.4.0-1 and **Mailpit** in Docker, locally and in CI; **Vitest**; **Playwright**; **GitHub Actions**.

## Acceptance criteria

Each criterion has tests whose names start with its ID, e.g. `b1 every red flag in the set is flagged`; the evidence pack links them.

### A. Data and privacy

- **A1** The made-up data is the same every time: 20 patients and 80 labelled messages, valid FHIR R4, each resource marked as test data.
- **A2** A request to the model carries no name, date of birth, address, record number or contact details.
- **A3** CI fails if the repository names a real company outside research documents, or holds a real patient record.
- **A4** A patient in the portal sees only their own messages and replies.

### B. Red flags

- **B1** Every red flag in the labelled set is flagged, including casual words, odd spelling and negated phrases; false alarms are reported.
- **B2** A flagged message never reaches the model: it works with the model switched off, and no model call is logged.
- **B3** A flagged message goes to the top of the queue with the clinic's urgent reply ready, and has no AI draft.
- **B4** The model's urgency can raise a message's place in the queue but never move it above or below a red flag.

### C. Sorting and drafting

- **C1** The model's answers are parsed into strict types; an answer that doesn't parse leaves the message for a person, with no draft.
- **C2** Admin messages are answered from the clinic's templates; the model never drafts them.
- **C3** The model sees only the allowed record fields and the current guidance; each draft records the guidance version and model.
- **C4** Changing the guidance makes a new version; earlier drafts keep the version they used.
- **C5** With no model, nothing is drafted and the clinician can write the reply by hand.

### D. Checks

- **D1** A draft that diagnoses is blocked.
- **D2** A draft that starts, stops or changes a medicine or dose is blocked.
- **D3** A draft naming a medicine not in the record is blocked.
- **D4** A draft with a number or date not in the message or the record is blocked.
- **D5** A draft that promises a time, a callback or an outcome is blocked.
- **D6** A draft over 150 words or above 8th-grade reading level is blocked; a fill-in not on the list, or a missing `{first_name}`, is blocked.
- **D7** Every blocked draft shows which check failed and what it found.

### E. Review

- **E1** Only a clinician can approve a clinical reply; front-desk staff can approve only admin templates.
- **E2** An approval binds the exact text; a reply changed after approval is never sent.
- **E3** The clinician's edits and hand-written replies go through the same checks.
- **E4** Discarding a draft needs a reason; the message stays open.

### F. Sending

- **F1** Nothing reaches the portal without an approval.
- **F2** A reply is sent once, even when approved twice or retried.
- **F3** Code adds the right disclosure, naming the approving clinician and the clinic's phone.
- **F4** The sent reply is written to the FHIR server as a `Communication` linked to the message by `inResponseTo`.

### G. The activity log

- **G1** Every step is logged with who and when.
- **G2** The log is append-only: the database refuses to change or delete an entry.
- **G3** Each message has its timeline, and the administrator sees the whole log, filtered by person and step.

### H. Logins and data

- **H1** Staff and patients log in with an emailed link; every staff API needs a staff login and every portal API a patient login.
- **H2** Messages and records are read from the FHIR server through a strict reader; a resource it can't read is refused with the reason, and the others are taken in.

### I. Measurement

- **I1** All 40 bad drafts are blocked, each by the check it was written to trip.
- **I2** At least 90% of Claude's recorded drafts pass, and the report lists every one that didn't.
- **I3** The report gives red-flag recall and false alarms on the labelled set, and the review shares and approval time from the log.

### J. Evidence

- **J1** The evidence pack links each acceptance criterion to its passing tests; CI fails if a finished milestone's criterion has none.
