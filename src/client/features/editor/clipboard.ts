/** Puts plain text on the clipboard; rejects when the browser refuses (ED-12 rescue copies). */
export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error('The clipboard is not available.');
  await navigator.clipboard.writeText(text);
}
