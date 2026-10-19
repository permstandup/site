import { h, icon, setChildren } from '../dom';
import type { App } from '../main';
import type { Entry } from '../api';
import type { EventData } from '../../../../shared/schema';
import { fmtShort, permNow } from '../ui';

const SEATS = { ok: ['Есть места', 'ok'], few: ['Мало мест', 'few'], out: ['Sold out', 'out'] } as const;

/** Шоу считается прошедшим через 2 часа после начала — как на сайте */
export function isPast(e: Entry<EventData>, now = permNow()) {
  const [d, t] = e.data.start.split('T');
  const end = new Date(`${d}T${t}:00Z`).getTime() + 2 * 3600_000;
  return end < new Date(`${now}:00Z`).getTime();
}

export function castLine(app: App, ids: string[]) {
  if (!ids.length) return 'Состав не выбран';
  const names = ids.map((id) => app.content.comedians.find((c) => c.id === id)?.data.name ?? id);
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

export function showsView(app: App, query: URLSearchParams) {
  const all = [...app.content.events].sort((a, b) => a.data.start.localeCompare(b.data.start));
  const upcoming = all.filter((e) => e.data.published && !isPast(e));
  const drafts = all.filter((e) => !e.data.published && !isPast(e));
  const past = all.filter((e) => isPast(e)).reverse();
  const tab = (query.get('tab') ?? 'upcoming') as 'upcoming' | 'drafts' | 'past';
  const lists = { upcoming, drafts, past };
  let q = '';

  const listBox = h('div', { class: 'rows' });
  const renderList = () => {
    const items = lists[tab].filter((e) => !q || `${e.data.title} ${castLine(app, e.data.comedians)}`.toLowerCase().includes(q));
    setChildren(listBox, 
      h('div', { class: 'row head', 'aria-hidden': 'true' }, h('div', null, 'Дата'), h('div', null, 'Шоу'), h('div', null, 'Состав'), h('div', null, 'Цена'), h('div', null, 'Места'), h('div', null, 'На сайте'), h('div')),
      ...items.map((e) => row(app, e)),
      items.length ? null : h('div', { class: 'empty' }, tab === 'drafts' ? 'Черновиков нет.' : tab === 'past' ? 'Прошедших шоу нет.' : 'Нет предстоящих шоу — нажмите «Новое шоу».'),
    );
  };
  renderList();

  const tabBtn = (id: typeof tab, label: string, n?: number, short?: string) =>
    h('a', { href: `#/shows?tab=${id}`, class: 'seg-btn', 'aria-pressed': String(tab === id) },
      short ? [h('span', { class: 'hide-sm' }, label), h('span', { class: 'show-sm' }, short)] : label, n !== undefined ? ` · ${n}` : '');
  const search = h('input', { type: 'search', placeholder: 'Поиск по названию или комику', 'aria-label': 'Поиск' });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); renderList(); });

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', null, 'Шоу'),
      h('a', { class: 'btn btn-primary', href: '#/shows/new' }, icon('plus', 18), h('span', { class: 'hide-sm' }, 'Новое шоу'))),
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, tabBtn('upcoming', 'Предстоящие', upcoming.length, 'Скоро'), tabBtn('drafts', 'Черновики', drafts.length), tabBtn('past', 'Прошедшие')),
      h('label', { class: 'search' }, icon('search', 18), search)),
    listBox,
    h('p', { class: 'muted small' }, 'Прошедшие шоу сами уходят во вкладку «Прошедшие» и пропадают из афиши на сайте. Изменения появляются на сайте через 2–3 минуты.'));
}

function row(app: App, e: Entry<EventData>) {
  const d = e.data;
  const f = fmtShort(d.start);
  const status = d.status === 'cancelled' ? h('span', { class: 'pill cancel' }, 'Отменено')
    : d.status === 'moved' ? h('span', { class: 'pill moved' }, 'Перенесено')
    : h('span', { class: ['pill', SEATS[d.seats][1]] }, SEATS[d.seats][0]);
  return h('div', { class: 'row' },
    h('div', { class: 'r-date' }, h('div', { class: 'strong' }, f.date), h('div', { class: 'muted small' }, f.time)),
    h('a', { class: 'r-title strong', href: `#/shows/${e.id}` }, d.title,
      app.content.settings.data.home?.featured === e.id ? h('span', { class: 'pill top', title: 'Главное мероприятие' }, ' ★ Топ') : null),
    h('div', { class: 'r-cast muted small' }, castLine(app, d.comedians)),
    h('div', { class: 'r-price' }, d.priceFrom ? `от ${d.priceFrom.toLocaleString('ru-RU')} ₽` : '—'),
    h('div', { class: 'r-seats' }, status),
    h('div', { class: ['r-pub', 'small', d.published ? 'on' : 'off'] }, d.published ? 'На сайте' : 'Черновик'),
    h('div', { class: 'r-act' },
      h('a', { class: 'btn btn-sm', href: `#/shows/${e.id}` }, 'Изменить'),
      h('a', { class: 'btn btn-sm', href: `#/shows/new?copy=${encodeURIComponent(e.id)}` }, 'Копия')));
}
