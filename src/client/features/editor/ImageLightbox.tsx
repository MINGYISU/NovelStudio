import * as RadixDialog from '@radix-ui/react-dialog';
import { useT } from '../../i18n/index.ts';
import styles from './editor.module.css';

/** IMG-13: the image full size over the page; `Esc` or a click closes it. */
export function ImageLightbox({
  url,
  caption,
  onClose,
}: {
  url: string;
  caption: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.lightboxOverlay} />
        <RadixDialog.Content
          className={styles.lightbox}
          aria-describedby={undefined}
          onClick={onClose}
        >
          <RadixDialog.Title className={styles.srOnly}>
            {caption || t('images.overlay.title')}
          </RadixDialog.Title>
          <img className={styles.lightboxImage} src={url} alt={caption} />
          {caption ? <p className={styles.lightboxCaption}>{caption}</p> : null}
          <RadixDialog.Close
            className={styles.lightboxClose}
            aria-label={t('images.overlay.close')}
          >
            ×
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
