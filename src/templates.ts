/** The clinic's fixed replies: never written by a model. */

/** For a flagged message (B3): the clinician approves it, edits it, or writes their own. */
export const URGENT_REPLY =
  "Hi {first_name}, what you describe may need care right away. Please call 911 now, or go to the nearest " +
  "emergency room. If you are having thoughts of suicide, call or text 988 now. If you are not sure, call the clinic now."

/** For an admin message (C2): the front desk approves it or writes its own. */
export const ADMIN_REPLY =
  "Hi {first_name}, thank you for your message. Our front desk has it and can help with this. " +
  "If it is about a visit, you can also call the clinic to book or change it."
