import './styles.css';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import { h, clear, icon } from './dom';
import { api, type Content, type Session } from './api';
import { confirmBox, isDirty, markClean, showError } from './ui';
import { loginView } from './views/login';
import { showsView } from './views/shows';
import { showEditView } from './views/show-edit';
import { comicsView } from './views/comics';
import { photosView } from './views/photos';
import { settingsView } from './views/settings';
import { deployIndicator } from './status';

// Защита от встраивания в чужую страницу (дублирует заголовок frame-ancestors)
if (window.top !== window.self) { document.body.textContent = ''; throw new Error('framed'); }

export interface App {
  session: Session;
  content: Content;
  reload: () => Promise<void>;
  go: (hash: string) => void;
  siteUrl: string;
}

const root = document.getElementById('app')!;
let session: Session | null = null;
let content: Content | null = null;
let lastHash = location.hash;

const NAV = [
  { hash: '#/shows', label: 'Шоу', icon: 'shows' as const },
  { hash: '#/comics', label: 'Комики', icon: 'comics' as const },
  { hash: '#/photos', label: 'Фото и видео', icon: 'photos' as const },
  { hash: '#/settings', label: 'Настройки', icon: 'settings' as const },
];

async function reload() { content = await api.content(); }
function go(hash: string) { if (location.hash === hash) render(); else location.hash = hash; }

function layout(active: string, body: HTMLElement): HTMLElement {
  const link = (n: (typeof NAV)[number], cls: string) =>
    h('a', { href: n.hash, class: cls, 'aria-current': active === n.hash ? 'page' : undefined }, icon(n.icon, 22), h('span', null, n.label));
  return h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('img', { src: '/logo.svg', alt: '', width: 36, height: 36 }), h('span', null, 'Админка клуба')),
      h('nav', { 'aria-label': 'Разделы' }, NAV.map((n) => link(n, 'side-link'))),
      h('div', { class: 'grow' }),
      h('a', { class: 'side-link muted', href: 'https://permstandup.ru/', target: '_blank', rel: 'noopener noreferrer' }, icon('ext', 18), h('span', null, 'Открыть сайт')),
      h('div', { class: 'who' }, h('span', null, session?.login ?? ''),
        h('button', { type: 'button', class: 'link-btn light', onclick: logout }, 'Выйти'))),
    h('main', { class: 'main', id: 'main', tabindex: -1 }, h('div', { class: 'topbar' }, deployIndicator()), body),
    h('nav', { class: 'tabbar', 'aria-label': 'Разделы' }, NAV.map((n) => link(n, 'tab'))));
}

async function logout() {
  try { await api.logout(); } catch { /* всё равно выходим */ }
  session = null; content = null; markClean();
  location.hash = '#/login';
}

async function render() {
  const hash = location.hash || '#/shows';
  const [path, qs] = hash.slice(1).split('?');
  const query = new URLSearchParams(qs ?? '');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'login') { clear(root); root.appendChild(loginView(query.get('e'))); return; }

  try {
    if (!session) session = await api.session();
    if (!content) await reload();
  } catch (e) {
    showError(e);
    if (!session) { location.hash = '#/login'; }
    return;
  }
  const app: App = { session: session!, content: content!, reload: async () => { await reload(); app.content = content!; }, go, siteUrl: 'https://permstandup.ru' };

  let view: HTMLElement;
  let active = '#/shows';
  switch (parts[0]) {
    case 'shows':
      view = parts[1] ? showEditView(app, parts[1], query) : showsView(app, query);
      break;
    case 'comics': active = '#/comics'; view = comicsView(app, parts[1]); break;
    case 'photos': active = '#/photos'; view = photosView(app); break;
    case 'settings': active = '#/settings'; view = settingsView(app, logout); break;
    default: location.hash = '#/shows'; return;
  }
  clear(root);
  root.appendChild(layout(active, view));
  document.getElementById('main')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', async () => {
  if (isDirty() && !location.hash.startsWith('#/login')) {
    const leave = await confirmBox('Есть несохранённые изменения. Уйти без сохранения?', 'Уйти', true);
    if (!leave) { history.replaceState(null, '', lastHash); return; }
  }
  markClean();
  lastHash = location.hash;
  render();
});

render();
