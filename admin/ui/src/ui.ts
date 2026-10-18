/** Общие элементы интерфейса админки */
import { h, icon, setChildren } from './dom';
import { ApiError, type Issue } from './api';

export function field(label: string, control: HTMLElement, opts: { hint?: string; counter?: () => string } = {}) {
  const counter = opts.counter ? h('span', { class: 'counter' }, opts.counter()) : null;
  if (counter) control.addEventListener('input', () => { counter.textContent = opts.counter!(); });
  return h('label', { class: 'field' },
    h('span', { class: 'label' }, h('span', null, label), counter),
    control,
    opts.hint ? h('span', { class: 'hint' }, opts.hint) : null);
}

type Bind<T> = { get: () => T; set: (v: T) => void };

export function textInput(b: Bind<string | undefined>, o: { type?: string; placeholder?: string; max?: number; required?: boolean } = {}) {
  const el = h('input', { type: o.type ?? 'text', value: b.get() ?? '', placeholder: o.placeholder, maxlength: o.max, required: o.required, autocomplete: 'off', spellcheck: o.type ? false : undefined });
  el.addEventListener('input', () => { b.set(el.value.trim() === '' ? undefined : el.value); markDirty(); });
  return el;
}

export function textArea(b: Bind<string | undefined>, o: { rows?: number; placeholder?: string; max?: number } = {}) {
  const el = h('textarea', { rows: o.rows ?? 4, placeholder: o.placeholder, maxlength: o.max });
  el.value = b.get() ?? '';
  el.addEventListener('input', () => { b.set(el.value); markDirty(); });
  return el;
}

export function numberInput(b: Bind<number | undefined>, o: { min?: number; max?: number; placeholder?: string } = {}) {
  const v = b.get();
  const el = h('input', { type: 'number', inputmode: 'numeric', value: v === undefined ? '' : String(v), min: o.min, max: o.max, placeholder: o.placeholder });
  el.addEventListener('input', () => { const n = el.value === '' ? undefined : Number(el.value); b.set(Number.isFinite(n) ? n : undefined); markDirty(); });
  return el;
}

export function select<T extends string>(options: Array<[T, string]>, b: Bind<T>) {
  const el = h('select', null, options.map(([v, l]) => h('option', { value: v, selected: v === b.get() }, l)));
  el.addEventListener('change', () => { b.set(el.value as T); markDirty(); });
  return el;
}

export function segmented<T extends string>(options: Array<[T, string, string?]>, value: T, onChange: (v: T) => void, label: string) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const render = (cur: T) => {
    setChildren(wrap, ...options.map(([v, l, tone]) => h('button', {
      type: 'button', 'aria-pressed': String(v === cur), class: ['seg-btn', v === cur && tone ? `tone-${tone}` : undefined],
      onclick: () => { if (v !== cur) { onChange(v); markDirty(); render(v); } },
    }, l)));
  };
  render(value);
  return wrap;
}

export function toggle(checked: boolean, onChange: (v: boolean) => void, label: string, hint?: (v: boolean) => string, disabled = false) {
  const hintEl = hint ? h('span', { class: 'hint' }, hint(checked)) : null;
  const btn = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-checked': String(checked), disabled },
    h('span', { class: 'toggle-text' }, h('span', { class: 'toggle-label' }, label), hintEl),
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span', { class: 'knob' })));
  btn.addEventListener('click', () => {
    checked = !checked;
    btn.setAttribute('aria-checked', String(checked));
    if (hintEl && hint) hintEl.textContent = hint(checked);
    onChange(checked);
    markDirty();
  });
  return btn;
}

/** Список строк: поле на каждую строку + «добавить» / «удалить» */
export function stringList(b: Bind<string[]>, o: { max: number; addLabel: string; placeholder?: string; maxLen?: number }) {
  const wrap = h('div', { class: 'list' });
  const render = () => {
    const items = b.get();
    setChildren(wrap, 
      ...items.map((v, i) => {
        const inp = h('input', { type: 'text', value: v, placeholder: o.placeholder, maxlength: o.maxLen, 'aria-label': `Пункт ${i + 1}` });
        inp.addEventListener('input', () => { const a = [...b.get()]; a[i] = inp.value; b.set(a); markDirty(); });
        return h('div', { class: 'list-row' }, inp,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Удалить пункт ${i + 1}`, onclick: () => { b.set(b.get().filter((_, j) => j !== i)); markDirty(); render(); } }, icon('x', 16)));
      }),
      items.length < o.max ? h('button', { type: 'button', class: 'link-btn', onclick: () => { b.set([...b.get(), '']); markDirty(); render(); } }, o.addLabel) : null,
    );
  };
  render();
  return wrap;
}

export const card = (title: string | null, ...children: Array<Node | null | false>) =>
  h('section', { class: 'card' }, title ? h('h2', null, title) : null, ...children);

// ---------- уведомления и подтверждения ----------

let toastEl: HTMLElement | null = null;
export function toast(message: string, kind: 'ok' | 'err' = 'ok') {
  toastEl?.remove();
  toastEl = h('div', { class: ['toast', `toast-${kind}`], role: kind === 'err' ? 'alert' : 'status' }, message);
  document.body.appendChild(toastEl);
  const el = toastEl;
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 4000);
}

export function confirmBox(text: string, ok: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'confirm' },
      h('p', null, text),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); resolve(false); } }, 'Отмена'),
        h('button', { type: 'button', class: ['btn', danger ? 'btn-danger' : 'btn-primary'], onclick: () => { dlg.close(); resolve(true); } }, ok)));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(false); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/** Кнопка, которая блокируется на время запроса */
export async function busy(btn: HTMLButtonElement, fn: () => Promise<void>) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Сохраняю…';
  try { await fn(); } catch (e) { showError(e); } finally { btn.disabled = false; btn.textContent = label; }
}

export function showError(e: unknown, issuesBox?: HTMLElement) {
  if (e instanceof ApiError) {
    if (e.status === 401) return;
    if (e.issues.length && issuesBox) renderIssues(issuesBox, e.issues);
    toast(e.message, 'err');
  } else {
    toast(e instanceof Error ? e.message : 'Что-то пошло не так', 'err');
  }
}

const FIELD_NAMES: Record<string, string> = {
  title: 'Название', start: 'Дата и время', ticketUrl: 'Ссылка на билеты', priceFrom: 'Цена', movedFrom: 'Исходная дата',
  cancelReason: 'Причина отмены', comedians: 'Состав', important: 'Важно знать', body: 'Описание', name: 'Имя', tagline: 'Строка под именем',
  city: 'Город', telegram: 'Telegram', vk: 'ВКонтакте', videos: 'Видео', cover: 'Обложка', photo: 'Фото', phone: 'Телефон', address: 'Адрес',
};
export function renderIssues(box: HTMLElement, issues: Issue[]) {
  setChildren(box, h('div', { class: 'issues', role: 'alert' },
    h('strong', null, 'Не сохранено — проверьте:'),
    h('ul', null, issues.map((i) => {
      const key = i.path.split('.').filter((p) => p !== 'data' && !/^\d+$/.test(p))[0] ?? '';
      return h('li', null, `${FIELD_NAMES[key] ?? key}: ${i.message}`);
    }))));
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- несохранённые изменения ----------
let dirty = false;
export function markDirty() { dirty = true; }
export function markClean() { dirty = false; }
export const isDirty = () => dirty;
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

// ---------- даты ----------
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_LONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** Даты в данных — время Перми, разбираем без перевода часовых поясов */
export function fmtShort(local: string) {
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { date: `${day} ${MONTHS[m - 1]}, ${DOW[dow]}`, time: t, long: `${day} ${MONTHS_LONG[m - 1]}` };
}
export function permNow(): string {
  const p = new Date(Date.now() + 5 * 3600_000).toISOString();
  return p.slice(0, 16);
}
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
