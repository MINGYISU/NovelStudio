import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useCreateBook, useUpdateBook } from '../../api/books.ts';
import { Button, Dialog, Field, FormError, uiStyles } from '../../components/ui.tsx';
import { AUTHOR_MAX, DESCRIPTION_MAX, TITLE_MAX, type Book } from '../../../shared/schemas/book.ts';
import { BookCover } from './BookCover.tsx';
import styles from './library.module.css';

interface DialogProps {
  onClose: () => void;
}

/** Create blank (LIB-03): only the title is needed. */
export function CreateBookDialog({
  onClose,
  onCreated,
}: DialogProps & { onCreated?: (book: Book) => void }) {
  const [title, setTitle] = useState('');
  const create = useCreateBook();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { title },
      {
        onSuccess: (book) => {
          onClose();
          onCreated?.(book);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="New book">
      <form onSubmit={submit}>
        <Field label="Title">
          <input
            className={uiStyles.input}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <FormError message={create.error?.message ?? null} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

/** Edit metadata and cover (LIB-05). The server decides which files are valid covers. */
export function EditBookDialog({ book, onClose }: DialogProps & { book: Book }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [description, setDescription] = useState(book.description);
  // undefined = keep, null = remove, File = replace
  const [cover, setCover] = useState<File | null | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const update = useUpdateBook();

  const previewUrl = useMemo(
    () => (cover instanceof File ? URL.createObjectURL(cover) : cover === null ? null : undefined),
    [cover],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { id: book.id, patch: { title, author, description }, cover },
      { onSuccess: onClose },
    );
  };

  const hasCover = cover === undefined ? book.coverUrl !== null : cover !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Edit book">
      <form onSubmit={submit}>
        <Field label="Title">
          <input
            className={uiStyles.input}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>
        <Field label="Author">
          <input
            className={uiStyles.input}
            value={author}
            maxLength={AUTHOR_MAX}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={uiStyles.input}
            rows={4}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className={styles.coverEditor}>
          <div className={styles.coverPreview}>
            <BookCover
              book={{ id: book.id, title, coverUrl: book.coverUrl }}
              previewUrl={previewUrl}
            />
          </div>
          <div className={styles.coverButtons}>
            <input
              ref={fileInput}
              className={styles.hiddenInput}
              type="file"
              accept={IMAGE_TYPES}
              aria-label="Cover image file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCover(file);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileInput.current?.click()}>
              {hasCover ? 'Replace cover…' : 'Upload cover…'}
            </Button>
            {hasCover ? <Button onClick={() => setCover(null)}>Remove cover</Button> : null}
          </div>
        </div>
        <FormError message={update.error?.message ?? null} />
        <div className={uiStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
