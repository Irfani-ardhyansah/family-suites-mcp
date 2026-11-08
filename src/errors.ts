export class ToolInputError extends Error {
  readonly code = 'INVALID_INPUT';
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export class FamilyApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = 'FamilyApiError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

export type MappedError = {
  ok: false;
  error: {
    code: string;
    message: string;
    status?: number;
    requestId?: string;
    details?: unknown;
  };
};

export function mapError(error: unknown): MappedError {
  if (error instanceof FamilyApiError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        ...(error.requestId ? { requestId: error.requestId } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
  }

  if (error instanceof ToolInputError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, status: error.status },
    };
  }

  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return {
      ok: false,
      error: {
        code: 'API_TIMEOUT',
        message: 'FamilyRoots API tidak merespons tepat waktu.',
      },
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    };
  }

  return {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi error yang tidak dikenal.' },
  };
}
