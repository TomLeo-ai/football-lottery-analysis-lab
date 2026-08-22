export interface ApiFieldError {
  fieldPath: string;
  message: string;
}

export interface ApiErrorBody {
  errorCode: string;
  message: string;
  traceId?: string;
  fieldErrors?: ApiFieldError[];
  recovery?: Record<string, unknown>;
}

export interface ApiResult<T> {
  code: number;
  msg: string;
  data: T;
  error?: ApiErrorBody;
}
