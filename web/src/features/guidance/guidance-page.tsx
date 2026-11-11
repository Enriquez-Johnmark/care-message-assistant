import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "@/api/client"
import type { Guidance } from "@/api/types"
import { useMe } from "@/app/queries"
import { guidanceKeys } from "@/app/query-keys"
import { PageHeader } from "@/components/page-header"
import { QueryError } from "@/components/query-error"
import { SaveError } from "@/components/save-error"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/** C4: the clinic's written guidance for replies. Each change makes a new
 *  version; each draft records the version it was written with. Only the
 *  administrator changes it. */
export function GuidancePage() {
  const me = useMe()
  const guidance = useQuery({
    queryKey: guidanceKeys.current(),
    queryFn: () => api<Guidance>("GET", "/api/guidance"),
  })
  const isAdmin = me.data?.who === "staff" && me.data.role === "administrator"
  return (
    <>
      <PageHeader
        title="Guidance"
        description="The clinic's own instructions, given to the model with every draft. The model never sees who the patient is."
      />
      {guidance.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : guidance.isError ? (
        <QueryError error={guidance.error} />
      ) : isAdmin ? (
        <Editor key={guidance.data.version} current={guidance.data} />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Version {guidance.data.version}</p>
          <p className="whitespace-pre-wrap">{guidance.data.text}</p>
        </div>
      )}
    </>
  )
}

function Editor({ current }: { current: Guidance }) {
  const [text, setText] = useState(current.text)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => api<Guidance>("POST", "/api/guidance", { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guidanceKeys.current() }),
  })
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <label htmlFor="guidance" className="text-sm font-medium">
        Version {current.version}
      </label>
      <Textarea id="guidance" value={text} onChange={(e) => setText(e.target.value)} rows={10} />
      <div>
        <Button type="submit" disabled={save.isPending || text.trim() === current.text}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save as a new version
        </Button>
      </div>
      {save.isError ? <SaveError error={save.error} /> : null}
    </form>
  )
}
