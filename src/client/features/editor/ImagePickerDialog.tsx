import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatBytes, IMAGE_TOTAL_WARN_BYTES } from '../../../shared/image-sizing.ts';
import { assetsKey, useBookAssets } from '../../api/assets.ts';
import { Button, Dialog, FormError, uiStyles } from '../../components/ui.tsx';
import { apiErrorMessage, useT, type MessageKey } from '../../i18n/index.ts';
import { getKeepOriginal, setKeepOriginal } from './image-optimize.ts';
import { uploadImageFile } from './image-upload.ts';
import styles from './editor.module.css';

export type ImagePickerMode = 'insert' | 'replace' | 'header';

const TITLES: Record<ImagePickerMode, MessageKey> = {
  insert: 'images.picker.title.insert',
  replace: 'images.picker.title.replace',
  header: 'images.picker.title.header',
};

interface ImagePickerDialogProps {
  bookId: string;
  mode: ImagePickerMode;
  onPick: (asset: { id: string }) => void;
  onClose: () => void;
}

/** One dialog for inserting, replacing and header images: upload a file, or reuse one of the book's (IMG-08). */
export function ImagePickerDialog({ bookId, mode, onPick, onClose }: ImagePickerDialogProps) {
  const t = useT();
  const client = useQueryClient();
  const assets = useBookAssets(bookId);
  const [keepOriginal, setKeep] = useState(getKeepOriginal);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadImageFile(bookId, file, keepOriginal);
      void client.invalidateQueries({ queryKey: assetsKey(bookId) });
      onPick(asset);
    } catch (err) {
      setError(apiErrorMessage(err));
      setUploading(false);
    }
  };

  const total = assets.data?.totalBytes ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t(TITLES[mode])} wide>
      <label className={uiStyles.field}>
        <span>{t('images.picker.upload')}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={uploading}
          data-testid="image-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
        <small className={styles.pickerHelp}>{t('images.picker.uploadHelp')}</small>
      </label>
      <label className={styles.pickerCheck}>
        <input
          type="checkbox"
          checked={keepOriginal}
          onChange={(e) => {
            setKeep(e.target.checked);
            setKeepOriginal(e.target.checked);
          }}
        />
        {t('images.picker.keepOriginal')}
      </label>
      {uploading ? <p role="status">{t('images.picker.uploading')}</p> : null}
      <FormError message={error} />

      <h3 className={styles.pickerHeading}>{t('images.picker.bookImages')}</h3>
      {assets.isError ? (
        <FormError
          message={t('images.picker.loadFailed', { message: apiErrorMessage(assets.error) })}
        />
      ) : assets.data && assets.data.assets.length === 0 ? (
        <p className={styles.pickerHelp}>{t('images.picker.empty')}</p>
      ) : (
        <ul className={styles.pickerGrid} data-testid="image-grid">
          {assets.data?.assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className={styles.pickerThumb}
                title={asset.fileName}
                aria-label={t('images.picker.use', { name: asset.fileName })}
                disabled={uploading}
                onClick={() => onPick(asset)}
              >
                <img src={asset.url} alt="" loading="lazy" decoding="async" />
                <span>{formatBytes(asset.bytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {assets.data ? (
        <p className={styles.pickerHelp} data-testid="image-total">
          {t('images.picker.total', { size: formatBytes(total) })}
        </p>
      ) : null}
      {total > IMAGE_TOTAL_WARN_BYTES ? (
        <p role="alert" className={styles.pickerWarn}>
          {t('images.picker.warn')}
        </p>
      ) : null}
      <div className={uiStyles.actions}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
