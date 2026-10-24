export const REQUEST_ID_HEADER = "x-request-id";

const OK = /^[A-Za-z0-9_-]{8,64}$/;

/** Accepts a well-formed incoming id (so traces join up across hops), otherwise mints one. Never trusts newlines or long values. */
export function resolveRequestId(incoming: string | null | undefined, gen: () => string): string {
  return incoming && OK.test(incoming) ? incoming : gen();
}

export const newRequestId = () => crypto.randomUUID().replace(/-/g, "");
