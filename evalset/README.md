# Measurement sets

All made up, written for this project; no real patient or message.

- `messages.json`: 80 labelled portal messages from the 20 made-up patients in `demo/patients.json`: type, red flag (with the reason), tricky kind, whether it is in the demo inbox, and a note on what a good reply must do.

## Red-flag recall

The red-flag list (`src/core/red-flags.ts`) was written from the spec's categories **before** the labelled messages were read. On that first, blind run it caught **12 of 19** red flags. It missed phrasing with more words between the parts ("pressure in the middle of my chest", "words are coming out slurred"), "droopy", "ending my life", signs of bleeding in the gut (black stool, vomit like coffee grounds) and accidental double doses.

The list was then widened with those general patterns, and now catches **19 of 19**. The set is no longer unseen, so 19 of 19 is not a measure of recall on new wording. The 3 false alarms are the 3 negated messages ("no chest pain…"), flagged by design.

## Claude's drafts

`report.md` is built by `pnpm cli eval` from Claude Sonnet's answers, recorded once with the owner's key (2026-11-11, 92 calls) and replayed in tests and CI.

On the first run **27 of 34** drafts passed. Four of the seven failures were the checks being wrong, not the drafts:
- two drafts gave an eGFR result in its own unit, "mL/min/1.73m2", and 1.73 was taken for a number not in the record;
- one said "I will pass your question on", read as the promise "it will pass";
- one said "I can't say whether you should start a medicine", read as an instruction to start one.

Each was fixed with a test, and **31 of 34** pass. The 3 still blocked name the medicine the patient asked about, to say it isn't in their record. The prompt tells the model not to, and the check rightly blocks it, so the clinician rewords those.

Then the record's facts were put in a fixed order, because the FHIR server returns them in its own order and the same record gave different questions. 31 questions changed and were asked again. One new answer showed one more false alarm: "I can't tell you to skip or change a medicine" was read as an instruction. It was fixed with a test, and the result is again **31 of 34**.
