import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  importPreviewResponseSchema,
  importTextCommitResponseSchema,
  type IMPORT_PRESETS,
} from '../../shared/schemas/import.ts';
import { currentLocale } from '../i18n/index.ts';
import { apiRequest } from './http.ts';

export interface TextImportVars {
  file: File;
  detect: boolean;
  title?: string;
  preset?: (typeof IMPORT_PRESETS)[number];
}

function form(mode: 'preview' | 'commit', vars: TextImportVars): FormData {
  const data = new FormData();
  data.append('mode', mode);
  data.append('locale', currentLocale());
  data.append('detect', vars.detect ? '1' : '0');
  if (vars.title) data.append('title', vars.title);
  if (vars.preset) data.append('preset', vars.preset);
  data.append('file', vars.file);
  return data;
}

export function useTextImportPreview() {
  return useMutation({
    mutationFn: async (vars: TextImportVars) =>
      importPreviewResponseSchema.parse(
        await apiRequest('/api/import/text', { method: 'POST', body: form('preview', vars) }),
      ),
  });
}

export function useTextImportCommit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TextImportVars) =>
      importTextCommitResponseSchema.parse(
        await apiRequest('/api/import/text', { method: 'POST', body: form('commit', vars) }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['books'] }),
  });
}
