import type { z } from 'zod';

export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  throw new ApiError(400, 'VALIDATION_ERROR', `${where}${issue?.message ?? 'Invalid request.'}`);
}
