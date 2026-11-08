import { describe, expect, it } from 'vitest';
import { FamilyApiError, mapError, ToolInputError } from '../src/errors.js';

describe('mapError', () => {
  it('memetakan FamilyApiError lengkap', () => {
    const mapped = mapError(
      new FamilyApiError({
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'branchName wajib diisi.',
        requestId: 'req-1',
        details: { field: 'branchName' },
      }),
    );

    expect(mapped).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'branchName wajib diisi.',
        status: 422,
        requestId: 'req-1',
        details: { field: 'branchName' },
      },
    });
  });

  it('memetakan ToolInputError', () => {
    expect(mapError(new ToolInputError('Input salah.'))).toEqual({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Input salah.',
        status: 400,
      },
    });
  });

  it('memetakan timeout fetch', () => {
    const mapped = mapError(new DOMException('timeout', 'TimeoutError'));
    expect(mapped.error.code).toBe('API_TIMEOUT');
  });

  it('memetakan error umum tanpa membocorkan objek', () => {
    const mapped = mapError(new Error('boom'));
    expect(mapped.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'boom',
    });
  });
});
