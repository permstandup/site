import { h, icon, setChildren } from '../dom';
import type { App } from '../main';
import { api, imageUrl } from '../api';
import type { GalleryItem, VideoItem } from '../../../../shared/schema';
import { busy, card, confirmBox, field, markClean, markDirty, showError, toast } from '../ui';
import { prepareImage } from '../image';
import { historyCard } from './history';

const rid = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function photosView(app: App) {
  return h('div', { class: 'page' }, photosBlock(app), videosBlock(app));
}

function photosBlock(app: App) {
  let items: GalleryItem[] = structuredClone(app.content.gallery.data ?? []);
  const issuesBox = h('div');
  const grid = h('div', { class: 'pgrid' });
  const countEl = h('div', { class: 'muted' });

  const render = () => {
    countEl.textContent = `${items.length} фото · первые 7 видны в блоке «Как у нас в клубе» на главной, остальные — в просмотре на весь экран`;
    setChildren(grid, ...items.map((p, i) => {
      const url = imageUrl(p.src);
      const cap = h('input', { type: 'text', value: p.caption, maxlength: 120, 'aria-label': `Подпись к фото ${i + 1}` });
      cap.addEventListener('input', () => { p.caption = cap.value; if (!p.alt || p.alt === p.caption) p.alt = cap.value; markDirty(); });
      const author = h('input', { type: 'text', value: p.author ?? '', maxlength: 80, placeholder: 'Автор фото', 'aria-label': `Автор фото ${i + 1}` });
      author.addEventListener('input', () => { p.author = author.value || undefined; markDirty(); });
      return h('div', { class: ['pcard', i < 7 && 'top'] },
        h('div', { class: 'pimg' },
          url ? h('img', { src: url, alt: p.alt, loading: 'lazy' }) : h('span', { class: 'muted small' }, 'нет файла'),
          h('span', { class: 'pnum' }, String(i + 1)),
          h('button', { type: 'button', class: 'pdel', 'aria-label': `Удалить фото ${i + 1}`, onclick: async () => {
            if (!(await confirmBox('Убрать это фото с сайта?', 'Убрать', true))) return;
            items = items.filter((x) => x !== p); markDirty(); render();
          } }, icon('x', 14))),
        h('div', { class: 'pmeta' },
          cap, author,
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Левее', disabled: i === 0, onclick: () => move(i, -1) }, icon('up', 16)),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Правее', disabled: i === items.length - 1, onclick: () => move(i, 1) }, icon('down', 16)))));
    }));
  };
  const move = (i: number, dir: number) => { const j = i + dir; [items[i], items[j]] = [items[j], items[i]]; markDirty(); render(); };
  render();

  const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'gallery-files' });
  const status = h('span', { class: 'muted small' });
  fileIn.addEventListener('change', async () => {
    const files = [...(fileIn.files ?? [])].slice(0, 20);
    fileIn.value = '';
    for (const [n, f] of files.entries()) {
      status.textContent = `Загружаю ${n + 1} из ${files.length}…`;
      try {
        const { src } = await api.upload(await prepareImage(f));
        items.push({ id: rid(), src, caption: 'Фото из клуба', alt: 'Фото из Пермского стендап клуба', order: 100 });
        markDirty(); render();
      } catch (e) { showError(e); }
    }
    status.textContent = files.length ? 'Готово — нажмите «Сохранить», чтобы фото появились на сайте' : '';
  });

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Сохранить');
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    setChildren(issuesBox, );
    const data = items.map((p, i) => ({ ...p, order: i + 1, caption: p.caption.trim() || 'Фото из клуба', alt: (p.alt || p.caption).trim() || 'Фото из клуба' }));
    try {
      await api.saveList('gallery', data, app.content.gallery.sha);
      markClean(); toast('Сохранено. На сайте — через 2–3 минуты.'); await app.reload(); app.go('#/photos');
    } catch (e) { showError(e, issuesBox); }
  }));

  return h('div', { class: 'col' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Фото из клуба'), countEl), saveBtn),
    issuesBox,
    h('label', { class: 'drop', for: 'gallery-files' }, icon('upload', 28),
      h('span', { class: 'strong' }, 'Нажмите, чтобы выбрать фото'),
      h('span', { class: 'muted small' }, 'JPG, PNG, WebP · можно сразу несколько · размер подберётся сам, данные о месте съёмки удаляются'),
      status),
    fileIn,
    grid,
    h('p', { class: 'muted small' }, 'Стрелками меняйте порядок. Зрителей крупным планом — только с их согласия.'),
    historyCard('src/content/gallery.json', async () => { await app.reload(); app.go('#/photos'); }));
}

function videosBlock(app: App) {
  let items: VideoItem[] = structuredClone(app.content.videos.data ?? []);
  const issuesBox = h('div');
  const box = h('div', { class: 'col' });
  const render = () => {
    setChildren(box, ...items.map((v, i) => {
      const t = h('input', { type: 'text', value: v.title, maxlength: 120, placeholder: 'Название ролика' });
      t.addEventListener('input', () => { v.title = t.value; markDirty(); });
      const u = h('input', { type: 'url', value: v.url, maxlength: 300, placeholder: 'https://vkvideo.ru/…' });
      u.addEventListener('input', () => { v.url = u.value.trim(); markDirty(); });
      const c = h('input', { type: 'text', value: v.comedian ?? '', maxlength: 80, placeholder: 'Комик (точно как в разделе «Комики»)' });
      c.addEventListener('input', () => { v.comedian = c.value || undefined; markDirty(); });
      return h('div', { class: 'vrow' },
        h('div', { class: 'grid3 grow' }, field('Название', t), field('Ссылка', u), field('Комик', c)),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; markDirty(); render(); } }, icon('up', 16)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Удалить видео', onclick: () => { items = items.filter((x) => x !== v); markDirty(); render(); } }, icon('x', 16))));
    }), items.length < 50 ? h('button', { type: 'button', class: 'link-btn', onclick: () => { items.push({ id: rid().replace('p-', 'v-'), title: '', url: '', order: 100 }); markDirty(); render(); } }, '+ Добавить видео') : null);
  };
  render();
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Сохранить видео');
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    setChildren(issuesBox, );
    const data = items.map((v, i) => ({ ...v, order: i + 1 }));
    try { await api.saveList('videos', data, app.content.videos.sha); markClean(); toast('Сохранено'); await app.reload(); app.go('#/photos'); } catch (e) { showError(e, issuesBox); }
  }));
  return card(null,
    h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Видео на главной'), h('div', { class: 'muted small' }, 'Первые 6. Только VK Видео, Rutube или YouTube.')), saveBtn),
    issuesBox, box);
}
