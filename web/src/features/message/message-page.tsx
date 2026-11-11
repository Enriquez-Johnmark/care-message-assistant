import { CircleAlertIcon, CircleCheckIcon, SirenIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"

import type { Draft, Facts, MessageDetail } from "@/api/types"
import { PageHeader } from "@/components/page-header"
import { QueryError } from "@/components/query-error"
import { SaveError } from "@/components/save-error"
import { Section } from "@/components/section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, formatDateTime } from "@/lib/dates"
import { actionLabel, checkLabel, sourceLabel, typeLabel, urgencyLabel } from "@/lib/labels"
import { useApprove, useDiscard, useEdit, useMessage } from "@/features/queue/queries"

/** One message: what the patient wrote beside their record, the draft and
 *  what the checks found, and the care team's actions. Every rule (who may
 *  approve, what blocks a draft) is the API's; this page shows its answers. */
export function MessagePage() {
  const { id = "" } = useParams()
  const message = useMessage(id)

  if (message.isPending) return <Skeleton className="h-96 w-full" />
  if (message.isError) return <QueryError error={message.error} />
  const m = message.data
  return (
    <>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Inbox
      </Link>
      <PageHeader
        title={`${m.patient.name} (made up)`}
        description={`${typeLabel(m.type)} · ${urgencyLabel(m.urgency).label} · sent ${formatDateTime(m.sentAt)}`}
      />
      {m.redFlags.length > 0 ? (
        <Alert variant="destructive">
          <SirenIcon />
          <AlertTitle>Red flag: this may be an emergency</AlertTitle>
          <AlertDescription>
            Found in code before any model saw it:{" "}
            {m.redFlags.map((f) => `${f.category} ("${f.found}")`).join("; ")}. No AI draft was
            written. Call the patient, and send the clinic&rsquo;s urgent reply below.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <section
            aria-label="The patient's message"
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <h2 className="font-semibold">{m.subject}</h2>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </section>
          {m.reply ? <Sent reply={m.reply} /> : <Review message={m} />}
        </div>
        <Record facts={m.patient.facts} birthDate={m.patient.birthDate} />
      </div>
      <Section title="Timeline" description="Every step for this message, newest first.">
        <ol className="flex flex-col gap-2 text-sm">
          {m.timeline.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-wrap gap-x-3">
              <span className="text-muted-foreground tabular-nums">{formatDateTime(entry.at)}</span>
              <span className="font-medium">{actionLabel(entry.action)}</span>
              <span className="text-muted-foreground">by {entry.actor}</span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  )
}

function Sent({ reply }: { reply: NonNullable<MessageDetail["reply"]> }) {
  return (
    <Alert>
      <CircleCheckIcon />
      <AlertTitle>Sent to the patient&rsquo;s portal</AlertTitle>
      <AlertDescription>
        <p>
          Approved by {reply.approvedBy} on {formatDateTime(reply.sentAt)}.
        </p>
        <p className="mt-2 whitespace-pre-wrap text-foreground">{reply.text}</p>
      </AlertDescription>
    </Alert>
  )
}

function Review({ message }: { message: MessageDetail }) {
  const [editing, setEditing] = useState(false)
  const draft = message.draft
  if (editing || !draft) {
    return <Write message={message} draft={draft} onDone={() => setEditing(false)} />
  }
  return (
    <section
      aria-label="The draft reply"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{sourceLabel(draft.source)}</span>
        {draft.guidanceVersion !== null ? <> · guidance version {draft.guidanceVersion}</> : null} ·
        reading grade {draft.grade.toFixed(1)}
      </p>
      <p className="whitespace-pre-wrap">{draft.text}</p>
      <Problems draft={draft} />
      <Actions draft={draft} onEdit={() => setEditing(true)} />
    </section>
  )
}

function Problems({ draft }: { draft: Draft }) {
  if (draft.problems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Passed every check. The clinic adds the patient&rsquo;s name and who approved it.
      </p>
    )
  }
  return (
    <Alert variant="destructive" className="border-0 bg-destructive/[0.06]">
      <CircleAlertIcon />
      <AlertTitle>This draft failed a check, so it can&rsquo;t be approved</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {draft.problems.map((p) => (
            <li key={`${p.check}-${p.found}`}>
              <span className="font-medium">{checkLabel(p.check)}:</span> {p.found}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function Actions({ draft, onEdit }: { draft: Draft; onEdit: () => void }) {
  const approve = useApprove(draft.id)
  const discard = useDiscard(draft.id)
  const [reason, setReason] = useState("")
  const [discarding, setDiscarding] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {draft.problems.length === 0 ? (
          <Button
            onClick={() => approve.mutate({ contentHash: draft.contentHash })}
            disabled={approve.isPending}
          >
            {approve.isPending ? <Spinner data-icon="inline-start" /> : null}
            Approve and send
          </Button>
        ) : null}
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={() => setDiscarding(true)}>
          Discard the draft
        </Button>
      </div>
      {discarding ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            discard.mutate({ reason })
          }}
        >
          <label htmlFor="reason" className="text-sm font-medium">
            Why? (the message stays open)
          </label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div>
            <Button type="submit" variant="outline" disabled={discard.isPending}>
              Discard it
            </Button>
          </div>
        </form>
      ) : null}
      {approve.isError ? <SaveError error={approve.error} /> : null}
      {discard.isError ? <SaveError error={discard.error} /> : null}
    </div>
  )
}

function Write({
  message,
  draft,
  onDone,
}: {
  message: MessageDetail
  draft: Draft | null
  onDone: () => void
}) {
  const edit = useEdit(message.id)
  const [text, setText] = useState(draft?.text ?? "Hi {first_name}, ")
  return (
    <form
      aria-label="Write the reply"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        edit.mutate({ text }, { onSuccess: onDone })
      }}
    >
      <label htmlFor="reply" className="font-medium">
        {draft ? "Edit the reply" : "Write the reply"}
      </label>
      {!draft && message.needsPerson ? (
        <p className="text-sm text-muted-foreground">No draft: {message.needsPerson}.</p>
      ) : null}
      <Textarea id="reply" value={text} onChange={(e) => setText(e.target.value)} rows={7} />
      <p className="text-sm text-muted-foreground">
        Write {"{first_name}"} where the patient&rsquo;s name goes. Your text goes through the same
        checks.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save the text
        </Button>
        {draft ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
      {edit.isError ? <SaveError error={edit.error} /> : null}
    </form>
  )
}

/** What the model could see of the patient: never who they are. */
function Record({ facts, birthDate }: { facts: Facts; birthDate: string }) {
  return (
    <aside aria-label="The patient's record" className="flex flex-col gap-4 text-sm">
      <h2 className="font-semibold">Record</h2>
      <p className="text-muted-foreground">
        Born {formatDate(birthDate)}. The model never sees the name or birth date.
      </p>
      <FactList
        title="Conditions"
        items={facts.conditions.map((c) => `${c.name}, since ${formatDate(c.since)}`)}
      />
      <FactList
        title="Medicines"
        items={facts.medications.map((m) => `${m.name} ${m.dose}, ${m.frequency}`)}
      />
      <FactList
        title="Allergies"
        items={facts.allergies.map((a) => `${a.substance} (${a.reaction})`)}
      />
      <FactList
        title="Recent results"
        items={facts.observations.map(
          (o) =>
            `${o.name}: ${o.value} ${o.unit}${o.low !== undefined || o.high !== undefined ? ` (range ${o.low ?? "–"} to ${o.high ?? "–"})` : ""}, ${formatDate(o.date)}`
        )}
      />
      <FactList
        title="Appointments"
        items={facts.appointments.map(
          (a) => `${a.kind} with ${a.with}, ${formatDateTime(a.start)}`
        )}
      />
    </aside>
  )
}

function FactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground">None</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
