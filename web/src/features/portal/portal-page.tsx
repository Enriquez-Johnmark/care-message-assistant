import { useQuery } from "@tanstack/react-query"
import { Navigate } from "react-router"

import { api, ApiError } from "@/api/client"
import type { PortalMessage } from "@/api/types"
import { Account } from "@/app/app-shell"
import { useMe } from "@/app/queries"
import { portalKeys } from "@/app/query-keys"
import { Logo } from "@/components/logo"
import { QueryError } from "@/components/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/dates"

/** A4: the patient's portal, made up for the demo: only their own messages,
 *  and only replies a person approved. */
export function PortalPage() {
  const me = useMe()
  const messages = useQuery({
    queryKey: portalKeys.messages(),
    queryFn: () => api<PortalMessage[]>("GET", "/api/portal/messages"),
    enabled: me.data?.who === "patient",
  })
  if (me.error instanceof ApiError && me.error.isNotLoggedIn)
    return <Navigate to="/login" replace />
  if (me.data?.who === "staff") return <Navigate to="/" replace />
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Logo />
          <Account who={me.data?.name} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 md:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your messages</h1>
          <p className="text-sm text-muted-foreground">
            A made-up patient portal for the demo. Replies appear here once your care team approves
            them.
          </p>
        </div>
        {messages.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : messages.isError ? (
          <QueryError error={messages.error} />
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.data.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{m.subject}</h2>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatDateTime(m.sentAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.reply ? (
                  <div className="flex flex-col gap-1 border-l-2 border-primary pl-4">
                    <p className="text-sm font-medium">
                      Reply from Example Community Clinic, {formatDateTime(m.reply.sentAt)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.reply.text}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Your care team has your message.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
