# Measurement sets

All made up, written for this project; no real patient or message.

- `messages.json`: 80 labelled portal messages from the 20 made-up patients in `demo/patients.json`: type, red flag (with the reason), tricky kind, whether it is in the demo inbox, and a note on what a good reply must do.

## Red-flag recall

The red-flag list (`src/core/red-flags.ts`) was written from the spec's categories **before** the labelled messages were read. On that first, blind run it caught **12 of 19** red flags. It missed phrasing with more words between the parts ("pressure in the middle of my chest", "words are coming out slurred"), "droopy", "ending my life", signs of bleeding in the gut (black stool, vomit like coffee grounds) and accidental double doses.

The list was then widened with those general patterns, and now catches **19 of 19**. The set is no longer unseen, so 19 of 19 is not a measure of recall on new wording. The 3 false alarms are the 3 negated messages ("no chest pain…"), flagged by design.
