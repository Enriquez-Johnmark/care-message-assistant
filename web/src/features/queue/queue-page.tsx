import { CloudDownloadIcon } from "lucide-react"
import { Link } from "react-router"

import type { QueueRow } from "@/api/types"
import { useMe } from "@/app/queries"
import { PageHeader } from "@/components/page-header"
import { QueryError } from "@/components/query-error"
import { SaveError } from "@/components/save-error"
import { Status } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/dates"
import { typeLabel, urgencyLabel } from "@/lib/labels"
import { useFetch, useQueue } from "@/features/queue/queries"

/** The care team's inbox (B3): red flags first, then messages to look at
 *  today, then the rest, oldest first (the API's order). */
export function QueuePage() {
  const queue = useQueue()
  const me = useMe()
  const isAdmin = me.data?.who === "staff" && me.data.role === "administrator"
  const fetch = useFetch()

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Patients' portal messages, red flags first. Every reply is approved by a person before the patient sees it."
      >
        {isAdmin ? (
          <Button onClick={() => fetch.mutate(undefined)} disabled={fetch.isPending}>
            {fetch.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CloudDownloadIcon data-icon="inline-start" />
            )}
            Fetch new messages
          </Button>
        ) : null}
      </PageHeader>
      {fetch.isError ? <SaveError error={fetch.error} /> : null}
      {fetch.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          Fetched {fetch.data.patients} patients&rsquo; records.{" "}
          {Object.values(fetch.data.messages).reduce((a, b) => a + b, 0) -
            (fetch.data.messages["already-here"] ?? 0)}{" "}
          new messages, {fetch.data.messages["flagged"] ?? 0} with a red flag.
        </p>
      ) : null}
      {queue.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : queue.isError ? (
        <QueryError error={queue.error} />
      ) : queue.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No messages waiting</EmptyTitle>
            <EmptyDescription>New portal messages appear here as they arrive.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reply</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link to={`/messages/${row.id}`} className="underline-offset-4 hover:underline">
                      {row.patient}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72 truncate">{row.subject}</TableCell>
                  <TableCell>{typeLabel(row.type)}</TableCell>
                  <TableCell>
                    <Status tone={urgencyLabel(row.urgency).variant}>
                      {urgencyLabel(row.urgency).label}
                    </Status>
                  </TableCell>
                  <TableCell>
                    <ReplyState row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDateTime(row.sentAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

function ReplyState({ row }: { row: QueueRow }) {
  if (row.redFlags.length > 0) return <Status tone="destructive">Urgent reply ready</Status>
  if (row.draftSource === null) return <Status tone="secondary">Needs a person</Status>
  return row.draftPassed ? (
    <Status tone="default">Ready to review</Status>
  ) : (
    <Status tone="warning">Blocked by a check</Status>
  )
}
