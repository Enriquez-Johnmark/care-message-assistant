import { describe, expect, it } from "vitest"

import { actionLabel, checkLabel, typeLabel, urgencyLabel } from "@/lib/labels"

describe("labels", () => {
  it("names each code in plain words", () => {
    expect(typeLabel("test-result")).toBe("Test result")
    expect(typeLabel(null)).toBe("Not sorted")
    expect(urgencyLabel("urgent").label).toBe("Red flag")
    expect(checkLabel("medicine-change")).toBe("A change to a medicine")
    expect(actionLabel("reply.sent")).toBe("Reply sent")
  })

  it("shows an unknown code as it is rather than hiding it", () => {
    expect(checkLabel("something-new")).toBe("something-new")
    expect(urgencyLabel("odd")).toEqual({ label: "odd", variant: "secondary" })
  })
})
