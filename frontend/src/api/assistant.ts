export type AssistantAvailability = {
  status: 'unavailable'
  reason: string
}

const unavailableReason =
  'The assistant request endpoint is listed in API_CONTRACTS.md, but its request and response contracts are TODO and no assistant endpoint is implemented in the backend.'

/** This intentionally makes no network request until Siddharth/Dhruv agree and implement a contract. */
export async function loadAssistantAvailability(): Promise<AssistantAvailability> {
  return { status: 'unavailable', reason: unavailableReason }
}
