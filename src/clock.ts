/** The only place that reads the system clock. Everything else asks a
 *  `Clock`, so tests can control time. */
export interface Clock {
  now(): Date
}

/** The real clock. */
export const systemClock: Clock = { now: () => new Date() }

/** A clock that stays where it is put, moved on by hand; for tests. */
export class FixedClock implements Clock {
  #at: Date

  constructor(at: Date) {
    this.#at = at
  }

  now(): Date {
    return new Date(this.#at)
  }

  advance(milliseconds: number): void {
    this.#at = new Date(this.#at.getTime() + milliseconds)
  }
}
