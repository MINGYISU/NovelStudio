import { healthSchema, type Health } from '../../shared/schemas/health.ts';

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return healthSchema.parse(await res.json());
}
