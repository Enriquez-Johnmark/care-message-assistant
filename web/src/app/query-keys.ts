// Every server-data key in one place, so a change in one feature can
// refresh what another shows.

export const messageKeys = {
  all: () => ["messages"] as const,
  queue: () => [...messageKeys.all(), "queue"] as const,
  detail: (id: string) => [...messageKeys.all(), "detail", id] as const,
}

export const activityKeys = {
  list: (actor: string, action: string) => ["activity", actor, action] as const,
}

export const guidanceKeys = {
  current: () => ["guidance"] as const,
}

export const portalKeys = {
  messages: () => ["portal", "messages"] as const,
}
