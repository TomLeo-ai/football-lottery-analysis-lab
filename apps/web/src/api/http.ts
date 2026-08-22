import type { ApiErrorBody, ApiFieldError, ApiResult } from '@/types/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly fieldErrors: ApiFieldError[];
  readonly traceId: string | null;
  readonly recovery: Record<string, unknown>;

  constructor(status: number, apiError: ApiErrorBody) {
    super(apiError.message || 'Request failed.');
    this.name = 'ApiRequestError';
    this.status = status;
    this.errorCode = apiError.errorCode;
    this.fieldErrors = apiError.fieldErrors ?? [];
    this.traceId = apiError.traceId ?? null;
    this.recovery = apiError.recovery ?? {};
  }
}

export interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

export async function requestJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers ?? {}),
  };
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  let result: ApiResult<T> | null = null;
  try {
    result = (await response.json()) as ApiResult<T>;
  } catch {
    if (!response.ok) {
      throw new ApiRequestError(response.status, {
        errorCode: 'HTTP_ERROR',
        message: `Request failed: ${response.status}`,
      });
    }
    throw new ApiRequestError(response.status, {
      errorCode: 'MALFORMED_RESPONSE',
      message: 'Server returned malformed JSON.',
    });
  }

  if (!response.ok || result.error !== undefined || result.code >= 400) {
    throw new ApiRequestError(response.status || result.code, result.error ?? {
      errorCode: 'HTTP_ERROR',
      message: result.msg || `Request failed: ${response.status}`,
    });
  }
  if (result.data === undefined) {
    return undefined as T;
  }
  return result.data;
}
