export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_FILE_PAYLOAD"
  | "UNAUTHORIZED"
  | "REAUTH_FAILED"
  | "SEAT_QUOTA_EXCEEDED"
  | "FORBIDDEN"
  | "SELF_APPROVAL_PROHIBITED"
  | "NOT_FOUND"
  | "INVALIDATION_CONFIRMATION_REQUIRED"
  | "APPROVAL_CYCLE_INVALIDATED"
  | "APPROVAL_STEP_NOT_ACTIVE"
  | "VERSION_IMMUTABLE"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "CONCURRENT_MODIFICATION"
  | "INTEGRITY_HASH_MISMATCH"
  | "ENGAGEMENT_THRESHOLD_NOT_MET"
  | "UNSUPPORTED_DIFF_FORMAT"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_SERVER_ERROR";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: DomainErrorCode,
    message: string,
    httpStatus = 400,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}
