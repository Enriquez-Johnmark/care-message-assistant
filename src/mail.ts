/** Sending the login emails. In development they all land in Mailpit, a test
 *  inbox on this computer, so nothing real is ever sent. */

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>
}

export class MailpitMailer implements Mailer {
  constructor(
    private readonly base = process.env["MAILPIT_URL"] ?? "http://127.0.0.1:8025",
    private readonly from = "care-team@clinic.example.test",
  ) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const response = await fetch(`${this.base}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: this.from, Name: "Example Community Clinic" },
        To: [{ Email: to }],
        Subject: subject,
        Text: text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Mailpit refused the email: ${response.status}`)
  }
}
