import { useState, type ReactNode } from 'react';
import { useNodeHeader, useSetHeaderImage } from '../../api/nodes.ts';
import { Button } from '../../components/ui.tsx';
import { apiErrorMessage, useT } from '../../i18n/index.ts';
import { useWorkspaceStore } from '../../stores/workspace.ts';
import { ImagePickerDialog } from './ImagePickerDialog.tsx';
import styles from './editor.module.css';

interface HeaderImageProps {
  bookId: string;
  nodeId: string;
}

/** Add, replace and remove buttons with the picker behind them (IMG-21). */
function HeaderImageButtons({ bookId, nodeId }: HeaderImageProps) {
  const t = useT();
  const header = useNodeHeader(nodeId);
  const set = useSetHeaderImage(bookId, nodeId);
  const [picking, setPicking] = useState(false);
  const has = header.data?.headerAssetId != null;

  const change = (assetId: string | null) =>
    set.mutateAsync(assetId).catch((error: unknown) =>
      useWorkspaceStore.getState().notify({
        tone: 'error',
        message: `${t('images.header.saveFailed')} ${apiErrorMessage(error)}`,
      }),
    );

  if (header.data === undefined) return null;
  return (
    <>
      {has ? (
        <>
          <Button onClick={() => setPicking(true)}>{t('images.header.replace')}</Button>
          <Button onClick={() => void change(null)}>{t('images.header.remove')}</Button>
        </>
      ) : (
        <Button onClick={() => setPicking(true)}>{t('images.header.add')}</Button>
      )}
      {picking ? (
        <ImagePickerDialog
          bookId={bookId}
          mode="header"
          onClose={() => setPicking(false)}
          onPick={(asset) => {
            setPicking(false);
            void change(asset.id);
          }}
        />
      ) : null}
    </>
  );
}

/** The image itself: the whole picture, centered; a missing file shows a slim bar (IMG-20, IMG-07). */
function HeaderPicture({ url, showImages }: { url: string; showImages: boolean }) {
  const t = useT();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!showImages) {
    return <div className={styles.headerHidden}>{t('images.placeholder')}</div>;
  }
  if (failedUrl === url) {
    return (
      <div className={styles.headerMissing} role="img" aria-label={t('images.missing')}>
        {t('images.missing')}
      </div>
    );
  }
  return (
    <div className={styles.headerImage} data-testid="header-image">
      <img key={url} src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />
    </div>
  );
}

/** Header image above the section title, with quiet controls while the title area is hovered (IMG-20, IMG-21). */
export function SectionHeader({
  bookId,
  nodeId,
  showImages,
  children,
}: HeaderImageProps & { showImages: boolean; children: ReactNode }) {
  const header = useNodeHeader(nodeId);
  return (
    <div className={styles.titleArea}>
      {header.data?.headerImageUrl ? (
        <HeaderPicture url={header.data.headerImageUrl} showImages={showImages} />
      ) : null}
      {children}
      <div className={styles.headerActions} data-testid="header-actions">
        <HeaderImageButtons bookId={bookId} nodeId={nodeId} />
      </div>
    </div>
  );
}

/** The same controls in the details panel, with a small preview. */
export function HeaderImageSection({ bookId, nodeId }: HeaderImageProps) {
  const t = useT();
  const header = useNodeHeader(nodeId);
  const url = header.data?.headerImageUrl ?? null;
  return (
    <section className={styles.detailsHeader} aria-label={t('images.header.label')}>
      <h3 className={styles.detailsHeaderHeading}>{t('images.header.label')}</h3>
      {url ? (
        <img className={styles.detailsHeaderPreview} src={url} alt="" loading="lazy" />
      ) : header.data ? (
        <p className={styles.detailsHeaderNone}>{t('images.header.none')}</p>
      ) : null}
      <div className={styles.detailsHeaderButtons}>
        <HeaderImageButtons bookId={bookId} nodeId={nodeId} />
      </div>
    </section>
  );
}
