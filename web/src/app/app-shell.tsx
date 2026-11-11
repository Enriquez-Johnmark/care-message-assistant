import { useMutation } from "@tanstack/react-query"
import { Navigate, NavLink, Outlet, useLocation } from "react-router"

import { api, ApiError } from "@/api/client"
import { useMe } from "@/app/queries"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type NavItem = { to: string; label: string }

const inbox: NavItem = { to: "/", label: "Inbox" }
const guidance: NavItem = { to: "/guidance", label: "Guidance" }
const activity: NavItem = { to: "/activity", label: "Activity" }

/** The care team's frame: a letterhead across the top (the product, then the
 *  clinic and who is logged in), the places beneath it, and the page below.
 *  A patient who lands here is taken to their portal. */
export function AppShell() {
  const me = useMe()
  // Only an ended session means logging in again; anything else (a deploy, a
  // dropped connection) is retried while the person stays where they are.
  if (me.error instanceof ApiError && me.error.isNotLoggedIn)
    return <Navigate to="/login" replace />
  if (me.data?.who === "patient") return <Navigate to="/portal" replace />
  const items =
    me.data?.who === "staff" && me.data.role === "administrator"
      ? [inbox, guidance, activity]
      : [inbox, guidance]
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-3 md:px-8">
          <Logo />
          <Account who={me.data?.who === "staff" ? me.data.name : undefined} />
        </div>
        <nav aria-label="Places" className="mx-auto w-full max-w-6xl px-4 md:px-8">
          <ul className="-mb-px flex gap-6 overflow-x-auto">
            {items.map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}

function NavItemLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation()
  // A message belongs to the inbox it was opened from.
  const isActive =
    item.to === "/"
      ? pathname === "/" || pathname.startsWith("/messages")
      : pathname.startsWith(item.to)
  return (
    <li>
      <NavLink
        to={item.to}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "block border-b-2 py-3 text-sm whitespace-nowrap transition-colors",
          isActive
            ? "border-primary font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        {item.label}
      </NavLink>
    </li>
  )
}

export function Account({ who }: { who?: string }) {
  const logOut = useMutation({
    mutationFn: () => api("POST", "/api/logout"),
    onSettled: () => location.assign("/login"),
  })
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col text-sm leading-tight sm:items-end">
        <span className="font-medium">Example Community Clinic (made up)</span>
        {who ? (
          <span className="text-xs text-muted-foreground">{who}</span>
        ) : (
          <Skeleton className="h-3 w-24" />
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => logOut.mutate()}
        disabled={logOut.isPending}
      >
        Log out
      </Button>
    </div>
  )
}
