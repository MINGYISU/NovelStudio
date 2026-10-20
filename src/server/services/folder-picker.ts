import { execFile } from 'node:child_process';
import { ApiError } from '../errors.ts';

const PICKER_TIMEOUT_MS = 10 * 60 * 1000;

export type FolderPicker = () => Promise<string | null>;

/**
 * macOS folder picker (ARCHITECTURE §10.2). The script is a fixed string and no user input reaches
 * the command line. Cancelling resolves to null.
 */
export const chooseFolderWithOsascript: FolderPicker = () => {
  if (process.platform !== 'darwin') {
    throw new ApiError(501, 'PICKER_UNSUPPORTED', 'The folder picker is only available on macOS.');
  }
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "Choose cold backup folder")'],
      { timeout: PICKER_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          if (/-128|cancel/i.test(stderr) || /-128|cancel/i.test(error.message)) resolve(null);
          else reject(new ApiError(500, 'PICKER_FAILED', 'The folder picker could not be opened.'));
          return;
        }
        const picked = stdout.trim();
        resolve(picked === '' ? null : picked.length > 1 ? picked.replace(/\/+$/, '') : picked);
      },
    );
  });
};
