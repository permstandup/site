/**
 * Подготовка фото в браузере перед загрузкой:
 *  - уменьшаем до 2000 px по длинной стороне и пересжимаем в JPEG;
 *  - при перерисовке пропадают все метаданные (EXIF, GPS-координаты, модель телефона) —
 *    в открытый доступ не утечёт, где и чем снимали.
 */
const MAX_SIDE = 2000;
const MAX_BYTES = 2_400_000;

export async function prepareImage(file: File): Promise<string> {
  if (file.size > 40_000_000) throw new Error('Файл больше 40 МБ');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Этот формат браузер не открывает. Сохраните фото как JPG и попробуйте снова.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const hgt = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hgt;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(bmp, 0, 0, w, hgt);
  bmp.close();
  for (const q of [0.86, 0.78, 0.68, 0.58]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_BYTES) return toBase64(blob);
  }
  throw new Error('Не получилось сжать фото — попробуйте другое');
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
