# Measurement

On the 80 labelled made-up messages in `evalset/messages.json`, with the clinic's default guidance. Claude's answers are replayed from `evalset/recorded/`; `pnpm cli eval --record` asks Claude again with the owner's key. Costs are at list price. The model never sees who the patient is, and never sees a flagged message.

| Measure | Result |
|---|---|
| Red flags caught in code | 19 of 19 (100%) |
| False alarms (flagged, labelled not urgent) | 3: m04, m24, m79 |
| Messages sorted to their labelled type (claude-sonnet-5-5) | 57 of 58 (98%) |
| Drafts passing every check (claude-sonnet-5-5) | 31 of 34 (91%) |
| Model calls, and cost per draft | 92 calls; US$0.0095 |

The red-flag list was written before these messages were read and caught 12 of 19 on that blind run; it was then widened, so this set no longer measures recall on new wording (`evalset/README.md`).

## Messages sorted to another type

- **m28**: labelled medication, sorted as test-result

## Drafts that failed a check

- **m22**
  - medicine-not-in-record: metoprolol
- **m66**
  - medicine-not-in-record: warfarin
- **m67**
  - medicine-not-in-record: ibuprofen
