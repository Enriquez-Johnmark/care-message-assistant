import { cn } from "@/lib/utils"

/** The app's name beside a mark: a message bubble with a tick. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-6">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M8 10.5h16v9H15l-4.5 4v-4H8zM12 15.2l2.5 2.4 5.5-5.2"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary-foreground"
        />
      </svg>
      Care Message Assistant
    </span>
  )
}
