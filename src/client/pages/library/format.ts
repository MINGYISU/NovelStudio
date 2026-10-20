const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

export function formatWords(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`;
}
