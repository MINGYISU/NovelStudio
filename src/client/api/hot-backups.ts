import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hotBackupStateSchema,
  restoreHotBackupResponseSchema,
} from '../../shared/schemas/hot-backup.ts';
import { apiRequest } from './http.ts';

const hotBackupsKey = ['hot-backups'] as const;

export function useHotBackups() {
  return useQuery({
    queryKey: hotBackupsKey,
    queryFn: async ({ signal }) =>
      hotBackupStateSchema.parse(await apiRequest('/api/hot-backups', { signal })),
  });
}

export function useRestoreHotBackup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      restoreHotBackupResponseSchema.parse(
        await apiRequest(`/api/hot-backups/${encodeURIComponent(name)}/restore`, {
          method: 'POST',
        }),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: hotBackupsKey }),
  });
}

export function useCancelHotRestore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      hotBackupStateSchema.parse(
        await apiRequest('/api/hot-backups/pending-restore', { method: 'DELETE' }),
      ),
    onSuccess: (data) => client.setQueryData(hotBackupsKey, data),
  });
}
