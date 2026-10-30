/** Every `error.code` the API can return (PRD I18N-04). The client has an `errors.<CODE>` message for each. */
export const ERROR_CODES = [
  'BACKUP_INVALID',
  'BACKUP_UNUSABLE',
  'BACKUP_VERIFY_FAILED',
  'BAD_REQUEST',
  'BOOK_NOT_TRASHED',
  'BOOK_TRASHED',
  'CATEGORY_NOT_EMPTY',
  'CHECKSUM_MISMATCH',
  'COLD_BACKUP_LOCATION_INVALID',
  'COLD_BACKUP_LOCATION_UNAVAILABLE',
  'COLD_BACKUP_NOT_CONFIGURED',
  'CONFIRM_TITLE_MISMATCH',
  'CONTENT_INVALID',
  'EXPORT_FAILED',
  'FILE_TOO_LARGE',
  'FORBIDDEN_HOST',
  'FORBIDDEN_ORIGIN',
  'IMPORT_EMPTY',
  'IMPORT_ENCODING',
  'IMPORT_FAILED',
  'IMPORT_NOT_TEXT',
  'IMPORT_TOO_MANY_SECTIONS',
  'INTERNAL_ERROR',
  'INVALID_BACKGROUND',
  'INVALID_BACKUP',
  'INVALID_COVER',
  'INVALID_IMAGE',
  'INVALID_INDEX',
  'INVALID_MOVE',
  'INVALID_PARENT',
  'INVALID_REPLACEMENT',
  'INVALID_SECTION',
  'MAP_DAMAGED',
  'NOT_FOUND',
  'NOT_TRASHED',
  'PICKER_FAILED',
  'PICKER_UNSUPPORTED',
  'RESTORE_FAILED',
  'RESTORE_STAGING_FAILED',
  'SNAPSHOT_INVALID',
  'STALE_REVISION',
  'UNSUPPORTED_FORMAT_VERSION',
  'UNSUPPORTED_IMAGE_TYPE',
  'VALIDATION_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes raised by the client itself, never sent by the server. */
export const CLIENT_ERROR_CODES = ['NETWORK', 'UNKNOWN'] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

/**
 * Codes whose server message carries details the translation cannot know (a path, the invalid field,
 * the reason a backup is unusable). The client shows its sentence followed by the server's detail.
 */
export const ERROR_CODES_WITH_DETAIL: ReadonlySet<string> = new Set<ErrorCode>([
  'BACKUP_INVALID',
  'BACKUP_UNUSABLE',
  'BACKUP_VERIFY_FAILED',
  'BAD_REQUEST',
  'COLD_BACKUP_LOCATION_INVALID',
  'COLD_BACKUP_LOCATION_UNAVAILABLE',
  'EXPORT_FAILED',
  'INVALID_BACKUP',
  'RESTORE_STAGING_FAILED',
  'VALIDATION_ERROR',
]);

export function isErrorCode(code: string): code is ErrorCode | ClientErrorCode {
  return (
    (ERROR_CODES as readonly string[]).includes(code) ||
    (CLIENT_ERROR_CODES as readonly string[]).includes(code)
  );
}
