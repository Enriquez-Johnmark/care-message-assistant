import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/api/client"
import type { Edited, Fetched, MessageDetail, QueueRow } from "@/api/types"
import { messageKeys } from "@/app/query-keys"

export function useQueue() {
  return useQuery({
    queryKey: messageKeys.queue(),
    queryFn: () => api<QueueRow[]>("GET", "/api/queue"),
    // New messages are taken in in the background: show them as they arrive.
    refetchInterval: 15_000,
  })
}

export function useMessage(id: string) {
  return useQuery({
    queryKey: messageKeys.detail(id),
    queryFn: () => api<MessageDetail>("GET", `/api/messages/${id}`),
  })
}

/** A review step; afterwards everything about messages is read again. */
function useStep<Body, Result = void>(path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Body) => api<Result>("POST", path, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: messageKeys.all() }),
  })
}

export const useApprove = (draftId: string) =>
  useStep<{ contentHash: string }>(`/api/drafts/${draftId}/approve`)
export const useDiscard = (draftId: string) =>
  useStep<{ reason: string }>(`/api/drafts/${draftId}/discard`)
export const useEdit = (messageId: string) =>
  useStep<{ text: string }, Edited>(`/api/messages/${messageId}/edit`)
export const useFetch = () => useStep<undefined, Fetched>("/api/fetch")
