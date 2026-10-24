/** Shared error types. HttpError lives here so storage code and routes use one class. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** A key or id failed validation, or tried to leave its game prefix. */
export class KeyError extends HttpError {
  constructor(message: string) { super(400, message); this.name = "KeyError"; }
}

/** A per game byte quota would be exceeded. */
export class QuotaExceededError extends HttpError {
  constructor(message: string) { super(413, message); this.name = "QuotaExceededError"; }
}

/** An adapter that is specified but not built yet. */
export class NotImplementedError extends Error {
  constructor(message: string) { super(message); this.name = "NotImplementedError"; }
}
