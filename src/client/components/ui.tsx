import * as RadixDialog from '@radix-ui/react-dialog';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
}

export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  const variantClass =
    variant === 'primary' ? styles.primary : variant === 'danger' ? styles.danger : '';
  return (
    <button
      type={type}
      className={[styles.button, variantClass, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, title, description, wide, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={wide ? `${styles.content} ${styles.wide}` : styles.content}
          aria-describedby={undefined}
        >
          <RadixDialog.Title className={styles.dialogTitle}>{title}</RadixDialog.Title>
          {description ? <p className={styles.description}>{description}</p> : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className={styles.error} role="alert">
      {message}
    </p>
  ) : null;
}

export const uiStyles = styles;
