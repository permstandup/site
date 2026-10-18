/**
 * Описания шоу и био комиков хранятся как обычный текст (не Markdown/HTML):
 * так в них физически нельзя вставить скрипт или подменную ссылку.
 * Абзацы разделяются пустой строкой.
 */
export function paragraphs(body: string | undefined): string[] {
  return (body ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
