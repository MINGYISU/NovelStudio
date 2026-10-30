import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chooseFolderResponseSchema,
  coldBackupSettingsResponseSchema,
  exportAllResponseSchema,
  exportResponseSchema,
  importResponseSchema,
  validateLocationResponseSchema,
  verifyResponseSchema,
  type ExportBody,
  type PutColdBackupSettingsBody,
} from '../../shared/schemas/cold-backup-settings.ts';
import { currentLocale } from '../i18n/index.ts';
import { apiRequest } from './http.ts';

export const coldBackupKey = ['cold-backup-settings'] as const;

export function useColdBackupSettings() {
  return useQuery({
    queryKey: coldBackupKey,
    queryFn: async ({ signal }) =>
      coldBackupSettingsResponseSchema.parse(
        await apiRequest('/api/settings/cold-backup', { signal }),
      ),
  });
}

export function useSaveColdBackupSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: PutColdBackupSettingsBody) =>
      coldBackupSettingsResponseSchema.parse(
        await apiRequest('/api/settings/cold-backup', { method: 'PUT', json: body }),
      ),
    onSuccess: (data) => client.setQueryData(coldBackupKey, data),
  });
}

export async function validateLocation(dir: string) {
  return validateLocationResponseSchema.parse(
    await apiRequest('/api/settings/cold-backup/validate', { method: 'POST', json: { dir } }),
  );
}

/** Opens the macOS folder picker on the server; null when the user cancels. */
export async function chooseFolder(): Promise<string | null> {
  return chooseFolderResponseSchema.parse(
    await apiRequest('/api/settings/cold-backup/choose-folder', { method: 'POST' }),
  ).path;
}

export function useExportBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookId, ...body }: ExportBody & { bookId: string }) =>
      exportResponseSchema.parse(
        await apiRequest(`/api/books/${bookId}/cold-backup`, { method: 'POST', json: body }),
      ).result,
    onSettled: () => client.invalidateQueries({ queryKey: coldBackupKey }),
  });
}

export function useExportAll() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: ExportBody) =>
      exportAllResponseSchema.parse(
        await apiRequest('/api/cold-backup/all', { method: 'POST', json: body }),
      ).results,
    onSettled: () => client.invalidateQueries({ queryKey: coldBackupKey }),
  });
}

export function useVerifyBackups() {
  return useMutation({
    mutationFn: async () =>
      verifyResponseSchema.parse(
        await apiRequest('/api/cold-backup/verify', { method: 'POST', json: {} }),
      ).results,
  });
}

export function useImportColdBackup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { file: File; checksum?: File | null; ignoreChecksum?: boolean }) => {
      const form = new FormData();
      if (vars.ignoreChecksum) form.append('ignoreChecksum', '1');
      if (vars.checksum) form.append('checksum', vars.checksum);
      form.append('locale', currentLocale());
      form.append('file', vars.file);
      return importResponseSchema.parse(
        await apiRequest('/api/import/cold-backup', { method: 'POST', body: form }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['books'] }),
  });
}
