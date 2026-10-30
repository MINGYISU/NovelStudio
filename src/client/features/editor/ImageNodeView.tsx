import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useState, type KeyboardEvent } from 'react';
import { IMAGE_CAPTION_MAX, IMAGE_SIZES, type ImageSize } from '../../../shared/schemas/content.ts';
import { useT } from '../../i18n/index.ts';
import type { ImageHost } from './image-extension.ts';
import styles from './editor.module.css';

const SIZE_WIDTH: Record<ImageSize, string> = { small: '33%', medium: '66%', full: '100%' };

/** An image is a figure of its own, centered, at one of three widths (IMG-02, IMG-03). */
export function ImageNodeView({
  node,
  selected,
  editor,
  updateAttributes,
  deleteNode,
  host,
}: ReactNodeViewProps & { host: ImageHost }) {
  const t = useT();
  const assetId = String(node.attrs.assetId);
  const size = (IMAGE_SIZES as readonly string[]).includes(String(node.attrs.size))
    ? (node.attrs.size as ImageSize)
    : 'medium';
  const caption = typeof node.attrs.caption === 'string' ? node.attrs.caption : '';
  const url = `/assets/${host.bookId}/${assetId}`;
  const [failedId, setFailedId] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [draft, setDraft] = useState(caption);
  const failed = failedId === assetId;
  const editable = editor.isEditable;
  const width = { width: SIZE_WIDTH[size], maxWidth: naturalWidth ?? undefined };

  const commitCaption = () => {
    const next = draft.trim().slice(0, IMAGE_CAPTION_MAX);
    if (next !== caption) updateAttributes({ caption: next });
    setCaptionOpen(false);
  };
  const onCaptionKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCaption();
      editor.commands.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(caption);
      setCaptionOpen(false);
    }
  };

  return (
    <NodeViewWrapper className={styles.image} data-selected={selected ? 'true' : undefined}>
      <figure className={styles.imageFigure} data-size={size}>
        <div className={styles.imageMedia} style={width} data-drag-handle="">
          {failed ? (
            <div className={styles.imageMissing} role="img" aria-label={t('images.missing')}>
              {t('images.missing')}
            </div>
          ) : (
            <img
              key={assetId}
              className={styles.imagePicture}
              src={url}
              alt={caption}
              loading="lazy"
              // The figure is what is dragged (ProseMirror's own move), not the bare picture.
              draggable={false}
              decoding="async"
              onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
              onError={() => setFailedId(assetId)}
              onDoubleClick={() => host.zoom({ url, caption })}
            />
          )}
        </div>
        {caption ? <figcaption className={styles.imageCaption}>{caption}</figcaption> : null}
      </figure>
      <div className={styles.imageHidden} data-testid="image-placeholder">
        {caption ? t('images.placeholderCaption', { caption }) : t('images.placeholder')}
      </div>
      {selected && editable ? (
        <div className={styles.imageBar} role="toolbar" aria-label={t('images.bar.label')}>
          <div role="group" aria-label={t('images.bar.width')} className={styles.imageBarGroup}>
            {IMAGE_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.imageBarButton}
                aria-pressed={size === option}
                onClick={() => updateAttributes({ size: option })}
              >
                {t(`images.size.${option}`)}
              </button>
            ))}
          </div>
          {captionOpen ? (
            <input
              className={styles.imageCaptionInput}
              value={draft}
              maxLength={IMAGE_CAPTION_MAX}
              placeholder={t('images.bar.captionPlaceholder')}
              aria-label={t('images.bar.captionLabel')}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitCaption}
              onKeyDown={onCaptionKey}
            />
          ) : (
            <button
              type="button"
              className={styles.imageBarButton}
              onClick={() => {
                setDraft(caption);
                setCaptionOpen(true);
              }}
            >
              {t('images.bar.caption')}
            </button>
          )}
          <button
            type="button"
            className={styles.imageBarButton}
            onClick={() => host.pick('replace', (asset) => updateAttributes({ assetId: asset.id }))}
          >
            {t('images.bar.replace')}
          </button>
          <button type="button" className={styles.imageBarButton} onClick={() => deleteNode()}>
            {t('images.bar.remove')}
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
