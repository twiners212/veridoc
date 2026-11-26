import type { DomainErrorCode } from "./errors";

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: DomainErrorCode;
        message: string;
        status: number;
        fieldErrors?: Record<string, string[]>;
      };
    };
