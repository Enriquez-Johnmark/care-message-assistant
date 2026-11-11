import { loadMadeUp } from "./fhir.ts"

export default async function setup(): Promise<void> {
  await loadMadeUp()
}
