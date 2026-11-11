# Showcase

Screenshots and a captioned walkthrough (1 min 23 s) of Care Message Assistant at a made-up clinic, Example Community Clinic. The administrator fetches 30 made-up portal messages from the clinic's FHIR server (HAPI FHIR, running on this computer). Code finds the red flags before any model sees a message. The clinician opens a red-flagged message and finds the clinic's fixed urgent reply ready. The clinician then reviews Claude's draft for a question about metformin, makes an edit that names a condition and sees it blocked, writes a safe reply, and approves it. The patient reads that reply in the portal, and the activity log shows every step.

The drafts are Claude Sonnet's, made with the owner's API key on 2026-11-11 and replayed from `evalset/recorded/` (the same answers `evalset/report.md` measures). Everything is made up: the clinic, the patients, their records, their messages and the `example.test` addresses. Login emails arrive in Mailpit, a test inbox on this computer; nothing is sent anywhere.

| File | Shows |
|---|---|
| `walkthrough.mp4` | The whole loop, from fetching the messages to the patient's portal and the activity log |
| `desktop-1-inbox.png` | The inbox after a fetch: red-flagged messages first, each with the urgent reply ready |
| `desktop-2-red-flag.png` | A red-flagged message: found in code, never sent to the model, the clinic's fixed urgent reply ready |
| `desktop-3-review.png` | Reviewing Claude's draft beside the patient's record; it passed every check |
| `desktop-4-blocked-edit.png` | The clinician's edit naming a condition, blocked by the same checks Claude's drafts go through |
| `desktop-5-sent.png` | After approval: the exact text approved, with who approved it and how to reach a person |
| `desktop-6-portal.png` | The patient's portal: only her own messages, and only approved replies |
| `desktop-7-activity.png` | The administrator's activity log |
| `phone-1-review.png`, `phone-2-portal.png` | A review page and the portal on a phone |

## Making them again

```bash
docker compose --profile fhir up -d
pnpm install && pnpm --dir web install && pnpm --dir web build
scripts/showcase.sh
```

The script starts a fresh database and a server on port 3006 that drafts from the recordings (`serve --recorded`), so it needs no API key and costs nothing. It loads the made-up patients and messages into HAPI FHIR on this computer; nothing is sent to a public FHIR server. The video needs ffmpeg.
