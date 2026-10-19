/**
 * «Тексты сайта»: все постоянные надписи — заголовки, кнопки, подписи — по страницам.
 * Хранятся только изменённые (settings.copy); остальные — стандартные из shared/copy.ts.
 */
import { h, setChildren } from '../dom';
import type { App } from '../main';
import { api } from '../api';
import type { Settings } from '../../../../shared/schema';
import { COPY_GROUPS, type CopyDef } from '../../../../shared/copy';
import { busy, card, markClean, markDirty, showError, toast } from '../ui';

/** Тексты, которые уже были в настройках раньше: показываем их здесь же, в своей группе */
interface Extra { label: string; max: number; multi?: boolean; hint?: string; get: (s: Settings) => string; set: (s: Settings, v: string) => void }
const EXTRAS: Record<string, Extra[]> = {
  home: [
    { label: 'Текст под заголовком', max: 400, multi: true, get: (s) => s.texts.heroLead, set: (s, v) => { s.texts.heroLead = v; } },
    { label: 'Блок открытого микрофона: текст', max: 400, multi: true, get: (s) => s.texts.openMic, set: (s, v) => { s.texts.openMic = v; } },
  ],
  openmic: [
    { label: 'Когда проходят', max: 60, hint: 'Добавляется к строке над заголовком и в разделе «Комики». Пусто — не показывается.', get: (s) => s.openMic.schedule, set: (s, v) => { s.openMic.schedule = v; } },
    { label: 'Подпись под карточкой записи', max: 200, get: (s) => s.openMic.contactNote, set: (s, v) => { s.openMic.contactNote = v; } },
  ],
  comics: [
    { label: 'Текст под заголовком', max: 200, get: (s) => s.comicsLead, set: (s, v) => { s.comicsLead = v; } },
  ],
};
const NOTES: Record<string, string> = {
  home: 'Заголовки блоков (Афиша, Комики, Видео…) и их порядок — в Настройках → Главная страница. Тексты карточек-фактов — там же.',
  openmic: 'Шаги, правила и частые вопросы — в Настройках → Страница открытого микрофона.',
  contacts: 'Абзацы «О клубе», адрес, телефон и «Как добраться» — в Настройках.',
  venue: 'Заголовок, текст, список услуг и фото — в Настройках → Мероприятия.',
};

export function textsView(app: App) {
  const s: Settings = structuredClone(app.content.settings.data);
  s.copy = { ...(s.copy ?? {}) };
  const copy = s.copy as Record<string, string | undefined>;
  const issuesBox = h('div');
  const rows: Array<{ el: HTMLElement; text: string }> = [];

  const control = (multi: boolean | undefined, max: number, value: string, placeholder?: string) => {
    if (multi) {
      const el = h('textarea', { rows: Math.min(5, Math.max(2, Math.ceil(value.length / 70))), maxlength: max, placeholder });
      el.value = value;
      return el;
    }
    return h('input', { type: 'text', value, maxlength: max, placeholder, autocomplete: 'off' });
  };

  const copyRow = (key: string, def: CopyDef) => {
    const changed = h('span', { class: 'pill top', hidden: copy[key] === undefined }, 'изменено');
    const el = control(def.multi, def.max, copy[key] ?? def.def, def.optional ? 'Пусто — не показывать' : def.def);
    const reset = h('button', { type: 'button', class: 'link-btn small', hidden: copy[key] === undefined }, 'Вернуть стандартный');
    const sync = () => { changed.hidden = reset.hidden = copy[key] === undefined; };
    el.addEventListener('input', () => {
      const v = el.value;
      if (v === def.def || (v.trim() === '' && !def.optional)) delete copy[key];
      else copy[key] = v.trim() === '' ? '' : v;
      sync(); markDirty();
    });
    reset.addEventListener('click', () => { delete copy[key]; el.value = def.def; sync(); markDirty(); });
    const hint = [def.hint, def.optional && !def.hint ? 'Можно оставить пустым — тогда не показывается.' : null].filter(Boolean).join(' ');
    const row = h('label', { class: 'field text-row' },
      h('span', { class: 'label' }, h('span', null, def.label), changed),
      el,
      hint || copy[key] !== undefined ? h('span', { class: 'hint' }, hint, hint ? ' ' : '', reset) : reset);
    rows.push({ el: row, text: `${def.label} ${def.def} ${copy[key] ?? ''}`.toLowerCase() });
    return row;
  };

  const extraRow = (x: Extra) => {
    const el = control(x.multi, x.max, x.get(s));
    el.addEventListener('input', () => { x.set(s, el.value); markDirty(); });
    const row = h('label', { class: 'field text-row' }, h('span', { class: 'label' }, x.label), el, x.hint ? h('span', { class: 'hint' }, x.hint) : null);
    rows.push({ el: row, text: `${x.label} ${x.get(s)}`.toLowerCase() });
    return row;
  };

  const groups = COPY_GROUPS.map((g) => {
    const items = [...(EXTRAS[g.id] ?? []).map(extraRow), ...Object.entries(g.items as Record<string, CopyDef>).map(([k, def]) => copyRow(k, def))];
    const box = card(g.title, NOTES[g.id] ? h('p', { class: 'muted small' }, NOTES[g.id]) : null, h('div', { class: 'text-grid' }, items));
    return { box, items };
  });

  // Поиск по надписям: «билет», «Хочешь на сцену» и т. п.
  const search = h('input', { type: 'search', placeholder: 'Найти надпись: например, «на сцену» или «билет»', autocomplete: 'off', 'aria-label': 'Поиск по текстам' });
  const nothing = h('p', { class: 'muted', hidden: true }, 'Ничего не нашлось — попробуйте другое слово.');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const r of rows) r.el.hidden = q !== '' && !r.text.includes(q);
    let any = false;
    for (const g of groups) { const vis = g.items.some((i) => !i.hidden); g.box.hidden = !vis; any ||= vis; }
    nothing.hidden = any;
  });

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-save': '' }, 'Сохранить');
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    setChildren(issuesBox);
    try {
      await api.saveList('settings', s, app.content.settings.sha);
      markClean(); toast('Сохранено. На сайте — через 2–3 минуты.');
      await app.reload(); app.go('#/texts');
    } catch (e) { showError(e, issuesBox); }
  }));

  const changedCount = Object.keys(copy).length;
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Тексты сайта'),
        h('div', { class: 'muted' }, 'Все надписи сайта по страницам. Если очистить поле — вернётся стандартный текст.', changedCount ? ` Изменено: ${changedCount}.` : '')),
      saveBtn),
    search, nothing, issuesBox,
    groups.map((g) => g.box));
}
