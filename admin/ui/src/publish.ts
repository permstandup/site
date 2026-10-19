/**
 * Локальная админка: кнопка «Опубликовать на сайт».
 * Показывает, какие файлы изменились по сравнению с сайтом, и отправляет их в GitHub одним коммитом.
 */
import { h, setChildren } from './dom';
import { api, ApiError } from './api';
import { isDirty, toast } from './ui';

const NAMES: Record<string, string> = {
  'src/content/settings.json': 'Настройки и тексты',
  'src/content/gallery.json': 'Фото из клуба',
  'src/content/videos.json': 'Видео',
};
const KIND = { added: 'новое', changed: 'изменено', deleted: 'удалено' } as const;

function label(path: string): string {
  if (NAMES[path]) return NAMES[path];
  const m = /^src\/content\/(events|comedians)\/(.+)\.md$/.exec(path);
  if (m) return `${m[1] === 'events' ? 'Шоу' : 'Комик'}: ${m[2]}`;
  if (path.startsWith('public/uploads/')) return `Картинка ${path.slice(15)}`;
  return path;
}

export function publishButton(): HTMLElement {
  const btn = h('button', { type: 'button', class: 'btn btn-primary btn-sm publish-btn' }, 'Опубликовать на сайт');
  btn.addEventListener('click', () => { void openDialog(); });
  return btn;
}

async function openDialog() {
  if (isDirty()) { toast('Сначала сохраните изменения на этой странице', 'err'); return; }
  const body = h('div', { class: 'col' }, h('p', null, 'Сравниваю с сайтом…'));
  const dlg = h('dialog', { class: 'confirm publish-dlg' }, h('h2', null, 'Публикация на сайт'), body);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  const close = h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Закрыть');

  const showConnect = (msg?: string) => {
    const input = h('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Ключ GitHub' });
    const err = h('p', { class: 'small', role: 'alert' }, msg ?? '');
    const save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Подключить');
    save.addEventListener('click', async () => {
      save.disabled = true; save.textContent = 'Проверяю…';
      try { await api.saveToken(input.value); toast('GitHub подключён'); await load(); }
      catch (e) { err.textContent = e instanceof ApiError ? e.message : 'Не получилось'; save.disabled = false; save.textContent = 'Подключить'; }
    });
    setChildren(body,
      h('p', null, 'Чтобы публиковать с этого компьютера, один раз подключите GitHub ключом доступа.'),
      h('ol', { class: 'small steps-list' },
        h('li', null, 'github.com → аватар → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
        h('li', null, 'Name: «админка сайта», Expiration: 1 год. Repository access: Only select repositories → site.'),
        h('li', null, 'Permissions → Repository → Contents: Read and write. Больше ничего не включайте.'),
        h('li', null, 'Generate token → скопируйте ключ и вставьте ниже.')),
      input, err,
      h('p', { class: 'muted small' }, 'Ключ хранится только на этом компьютере (папка admin/.local) и никуда, кроме GitHub, не отправляется. Никому его не пересылайте.'),
      h('div', { class: 'row' }, close, save));
    input.focus();
  };

  const load = async () => {
    setChildren(body, h('p', null, 'Сравниваю с сайтом…'));
    let st;
    try { st = await api.publishStatus(); } catch (e) {
      if (e instanceof ApiError && e.status === 412) { showConnect(e.message); return; }
      setChildren(body, h('p', { role: 'alert' }, e instanceof Error ? e.message : 'Ошибка'), h('div', { class: 'row' }, close));
      return;
    }
    if (!st.connected) { showConnect(); return; }
    if (!st.changes.length) {
      setChildren(body, h('p', null, 'Всё уже на сайте — новых изменений нет.'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'link-btn small', onclick: async () => { await api.forgetToken(); toast('GitHub отключён'); dlg.close(); } }, 'Отключить GitHub'), close));
      return;
    }
    const go = h('button', { type: 'button', class: 'btn btn-primary' }, `Опубликовать (${st.changes.length})`);
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = 'Публикую…';
      try {
        const r = await api.publish();
        dlg.close();
        toast(r.count ? 'Опубликовано. Сайт обновится через 2–3 минуты.' : 'Всё уже на сайте');
      } catch (e) {
        if (e instanceof ApiError && e.status === 412) { showConnect(e.message); return; }
        toast(e instanceof Error ? e.message : 'Ошибка', 'err');
        go.disabled = false; go.textContent = 'Попробовать ещё раз';
      }
    });
    setChildren(body,
      h('p', null, 'Эти изменения уйдут на сайт:'),
      h('ul', { class: 'changes' }, st.changes.map((c) => h('li', null, h('span', { class: `pill ${c.kind === 'deleted' ? 'cancel' : c.kind === 'added' ? 'ok' : 'off'}` }, KIND[c.kind]), ' ', label(c.path)))),
      h('div', { class: 'row' }, close, go));
  };
  await load();
}
