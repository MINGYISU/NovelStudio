import { errorResponseSchema } from '../../shared/schemas/book.ts';

export class ApiRequestError extends Error {
  override name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown;
  body?: FormData;
  signal?: AbortSignal;
}

/** Sends a request and returns the parsed JSON body (undefined for 204). Errors carry the server message. */
export async function apiRequest(url: string, options: RequestOptions = {}): Promise<unknown> {
  const init: RequestInit = { method: options.method ?? 'GET', signal: options.signal };
  if (options.json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.json);
  } else if (options.body) {
    init.body = options.body;
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (options.signal?.aborted) throw err;
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the NovelStudio server.');
  }

  if (res.status === 204) return undefined;
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(data);
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.error.code : 'UNKNOWN',
      parsed.success ? parsed.data.error.message : `Request failed (${res.status}).`,
    );
  }
  return data;
}
