import { h, icon, setChildren } from '../dom';
import type { App } from '../main';
import { api, imageUrl } from '../api';
import type { EventData } from '../../../../shared/schema';
import {
  busy, card, confirmBox, field, markClean, numberInput, segmented, select, showError, stringList,
  textArea, textInput, toast, toggle, fmtShort, markDirty, isDirty,
} from '../ui';
import { prepareImage } from '../image';
import { slugify, uniqueId } from '../slug';
import { historyCard } from './history';

type Draft = EventData & { body: string };

const FORMATS: Array<[EventData['format'], string]> = [['standup', 'Стендап-шоу'], ['openmic', 'Открытый микрофон'], ['test', 'Проверочный концерт'], ['solo', 'Сольный концерт']];

export function showEditView(app: App, id: string, query: URLSearchParams, prefill?: Draft): HTMLElement {
  const isNew = id === 'new';
  const src = isNew ? app.content.events.find((e) => e.id === query.get('copy')) : app.content.events.find((e) => e.id === id);
  if (!isNew && !src) return h('div', { class: 'page' }, h('p', null, 'Такого шоу нет. '), h('a', { href: '#/shows' }, '← Все шоу'));

  const base: Draft = src
    ? { ...structuredClone(src.data), body: src.body }
    : { title: '', format: 'standup', start: '', age: '18+', seats: 'ok', status: 'plan', comedians: [], published: false, body: '' };
  if (isNew && src && !prefill) { base.title = `${base.title} (копия)`; base.published = false; base.status = 'plan'; delete base.movedFrom; delete base.cancelReason; }
  const d: Draft = prefill ?? base;
  const rerender = () => { page.replaceWith(showEditView(app, id, query, d)); };
  const sha = isNew ? null : src!.sha;
  const issuesBox = h('div');

  // ----- дата и время -----
  const [d0, t0] = (d.start || 'T').split('T');
  let date = d0; let time = t0 || '19:00';
  const setStart = () => { d.start = date && time ? `${date}T${time}` : ''; };
  const dateIn = h('input', { type: 'date', value: date, required: true });
  dateIn.addEventListener('input', () => { date = dateIn.value; setStart(); markDirty(); });
  const timeIn = h('input', { type: 'time', value: time, required: true, step: 300 });
  timeIn.addEventListener('input', () => { time = timeIn.value; setStart(); markDirty(); });
  setStart();

  // ----- статус -----
  const statusExtra = h('div');
  const renderStatusExtra = () => {
    if (d.status === 'moved') {
      if (!d.movedFrom && src && src.data.status !== 'moved') d.movedFrom = src.data.start;
      const fromIn = h('input', { type: 'datetime-local', value: d.movedFrom ?? '' });
      fromIn.addEventListener('input', () => { d.movedFrom = fromIn.value || undefined; markDirty(); });
      setChildren(statusExtra, h('div', { class: 'panel moved' },
        field('Исходная дата (с какой перенесли)', fromIn),
        h('p', { class: 'small' }, 'Новую дату и время укажите выше, в полях «Дата» и «Начало». На сайте появится плашка «Перенесено с …», билеты действуют на новую дату.')));
    } else if (d.status === 'cancelled') {
      setChildren(statusExtra, h('div', { class: 'panel cancel' },
        field('Причина (необязательно)', textInput({ get: () => d.cancelReason, set: (v) => { d.cancelReason = v; } }, { placeholder: 'Например, болезнь комика', max: 200 })),
        h('p', { class: 'small' }, 'Кнопка покупки пропадёт, на сайте появится плашка «Отменено» и подсказка про возврат через Qtickets. Не забудьте отменить событие и в самом Qtickets.')));
    } else setChildren(statusExtra, );
  };
  renderStatusExtra();

  // ----- состав -----
  const castBox = h('div', { class: 'cast' });
  const castCount = h('span', { class: 'muted small' });
  const comics = [...app.content.comedians].sort((a, b) => (a.data.order ?? 100) - (b.data.order ?? 100));
  const renderCast = () => {
    castCount.textContent = `Выбрано: ${d.comedians.length}`;
    setChildren(castBox, ...comics.map((c) => {
      const pos = d.comedians.indexOf(c.id);
      const on = pos >= 0;
      return h('button', {
        type: 'button', class: ['cast-item', on && 'on'], 'aria-pressed': String(on),
        onclick: () => { d.comedians = on ? d.comedians.filter((x) => x !== c.id) : [...d.comedians, c.id]; markDirty(); renderCast(); },
      },
      c.data.photo ? h('img', { class: 'ava', src: imageUrl(c.data.photo), alt: '' }) : h('span', { class: 'ava' }),
      h('span', { class: 'grow' }, h('span', { class: 'strong block' }, c.data.name), h('span', { class: 'muted small block' }, c.data.role === 'resident' ? 'Резидент' : `Гость${c.data.city ? ` · ${c.data.city}` : ''}${c.data.visible ? '' : ' · скрыт'}`)),
      h('span', { class: 'check' }, on ? String(pos + 1) : ''));
    }));
  };
  renderCast();

  // ----- «Важно знать» -----
  const impBox = h('div');
  const renderImportant = () => {
    const custom = Array.isArray(d.important);
    setChildren(impBox, 
      toggle(custom, (v) => { d.important = v ? [...app.content.settings.data.importantDefault] : undefined; renderImportant(); }, 'Свой список для этого шоу', (v) => v ? 'Ниже — пункты только для этого шоу' : 'Берётся из настроек клуба'),
      custom
        ? stringList({ get: () => d.important ?? [], set: (v) => { d.important = v; } }, { max: 10, addLabel: '+ Добавить пункт', maxLen: 200 })
        : h('ol', { class: 'muted small default-list' }, app.content.settings.data.importantDefault.map((t) => h('li', null, t))),
    );
  };
  renderImportant();

  // ----- обложка -----
  const coverBox = h('div', { class: 'cover' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'cover-file' });
  const renderCover = () => {
    const url = imageUrl(d.cover);
    setChildren(coverBox, url ? h('img', { src: url, alt: 'Обложка шоу' }) : h('span', { class: 'muted small' }, 'Обложки нет — на сайте будет фирменный фон'));
  };
  renderCover();
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    setChildren(coverBox, h('span', { class: 'muted small' }, 'Загружаю…'));
    try { d.cover = (await api.upload(await prepareImage(f))).src; markDirty(); toast('Фото загружено — не забудьте сохранить шоу'); } catch (e) { showError(e); }
    renderCover();
  });

  // ----- данные из Qtickets -----
  const importBtn = h('button', { type: 'button', class: 'btn' }, 'Заполнить из Qtickets');
  importBtn.addEventListener('click', () => busy(importBtn, async () => {
    if (!d.ticketUrl) { toast('Сначала вставьте ссылку на шоу в Qtickets', 'err'); return; }
    const q = await api.importQtickets(d.ticketUrl);
    const filled: string[] = [];
    const take = <K extends keyof Draft>(k: K, v: Draft[K] | undefined, label: string) => {
      if (v === undefined || v === '') return;
      const empty = d[k] === undefined || d[k] === '' || (k === 'body' && !d.body.trim());
      if (isNew || empty) { d[k] = v; filled.push(label); }
    };
    take('title', q.title, 'название');
    take('start', q.start, 'дата и время');
    take('priceFrom', q.priceFrom, 'цена');
    take('age', q.age, 'возраст');
    take('body', q.description, 'описание');
    markDirty();
    rerender();
    toast(filled.length ? `Заполнено из Qtickets: ${filled.join(', ')}. Проверьте перед сохранением.` : 'Новых данных на странице не нашлось');
  }));

  // ----- повтор (только для нового шоу) -----
  let repeat: 'none' | '1' | '2' = 'none';
  let repeatUntil = '';
  const repeatInfo = h('p', { class: 'muted small' });
  const seriesDates = (): string[] => {
    if (repeat === 'none' || !d.start || !repeatUntil) return [];
    const [dd, tt] = d.start.split('T');
    const out: string[] = [];
    let t = Date.UTC(+dd.slice(0, 4), +dd.slice(5, 7) - 1, +dd.slice(8, 10));
    const end = Date.UTC(+repeatUntil.slice(0, 4), +repeatUntil.slice(5, 7) - 1, +repeatUntil.slice(8, 10));
    while (t <= end && out.length < 52) { out.push(`${new Date(t).toISOString().slice(0, 10)}T${tt}`); t += Number(repeat) * 7 * 86400_000; }
    return out;
  };
  const renderRepeatInfo = () => {
    const list = seriesDates();
    repeatInfo.textContent = repeat === 'none' ? '' : !repeatUntil ? 'Укажите, до какой даты повторять.'
      : `Будет создано ${list.length} шоу: ${list.slice(0, 6).map((x) => fmtShort(x).date).join('; ')}${list.length > 6 ? ' …' : ''}${list.length >= 52 ? ' (не больше 52 за раз)' : ''}`;
  };
  const untilIn = h('input', { type: 'date' });
  untilIn.addEventListener('input', () => { repeatUntil = untilIn.value; renderRepeatInfo(); });
  dateIn.addEventListener('input', renderRepeatInfo);
  const untilWrap = field('До какой даты (включительно)', untilIn, { hint: 'Создадутся отдельные шоу на каждую дату — потом любое можно поменять или отменить отдельно.' });
  untilWrap.hidden = true;
  timeIn.addEventListener('input', renderRepeatInfo);

  // ----- главное шоу недели -----
  const settingsData = app.content.settings.data;
  const isFeatured = !isNew && settingsData.home.featured === id;
  const featureBtn = h('button', { type: 'button', class: ['btn', 'btn-block', isFeatured && 'btn-primary-soft'] }, isFeatured ? '★ Главное шоу недели — убрать' : '☆ Сделать главным шоу недели');
  featureBtn.addEventListener('click', () => busy(featureBtn, async () => {
    if (isDirty()) { toast('Сначала сохраните изменения шоу', 'err'); return; }
    const next = { ...settingsData, home: { ...settingsData.home, featured: isFeatured ? '' : id } };
    await api.saveList('settings', next, app.content.settings.sha);
    toast(isFeatured ? 'Шоу больше не выделено на главной' : 'Шоу выделено на главной. На сайте — через 2–3 минуты.');
    await app.reload(); app.go(`#/shows/${id}`);
  }));

  // ----- сохранение -----
  const save = async () => {
    setChildren(issuesBox, );
    const { body, ...data } = d;
    const clean: Record<string, unknown> = { ...data };
    for (const k of Object.keys(clean)) if (clean[k] === undefined || clean[k] === '') delete clean[k];
    if (Array.isArray(clean.important)) clean.important = (clean.important as string[]).map((s) => s.trim()).filter(Boolean);
    let targetId = id;
    const series = isNew ? seriesDates() : [];
    if (series.length > 1) {
      const taken = new Set(app.content.events.map((e) => e.id));
      const items = series.map((start) => {
        const sid = uniqueId(`${start.slice(0, 10)}-${slugify(d.title || 'show', 40)}`, taken);
        taken.add(sid);
        return { id: sid, data: { ...clean, start }, body };
      });
      try {
        await api.saveSeries(items);
        markClean();
        toast(`Создано ${items.length} шоу${d.published ? '. На сайте — через 2–3 минуты.' : ' (черновики)'}`);
        await app.reload();
        app.go('#/shows');
      } catch (e) { showError(e, issuesBox); }
      return;
    }
    if (isNew) {
      if (!d.start) { toast('Укажите дату и время', 'err'); return; }
      targetId = uniqueId(`${d.start.slice(0, 10)}-${slugify(d.title || 'show', 40)}`, new Set(app.content.events.map((e) => e.id)));
    }
    try {
      await api.saveEntry('events', targetId, clean, body, sha);
      markClean();
      toast(d.published ? 'Сохранено. На сайте — через 2–3 минуты.' : 'Сохранено как черновик');
      await app.reload();
      app.go(`#/shows/${targetId}`);
    } catch (e) { showError(e, issuesBox); }
  };
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Сохранить');
  saveBtn.addEventListener('click', () => busy(saveBtn, save));

  const del = async () => {
    if (!sha || !(await confirmBox(`Удалить шоу «${d.title}» насовсем? Если шоу просто не состоится — лучше поставьте статус «Отменено».`, 'Удалить', true))) return;
    try { await api.deleteEntry('events', id, sha); markClean(); toast('Шоу удалено'); await app.reload(); app.go('#/shows'); } catch (e) { showError(e); }
  };

  const f = d.start ? fmtShort(d.start) : null;
  const page: HTMLElement = h('div', { class: 'page' },
    h('a', { class: 'back', href: '#/shows' }, icon('back', 16), 'Все шоу'),
    h('h1', null, isNew ? (src ? 'Копия шоу' : 'Новое шоу') : d.title),
    !isNew && f ? h('p', { class: 'muted' }, `${f.long}, ${f.time}`) : null,
    issuesBox,
    h('div', { class: 'edit-grid' },
      h('div', { class: 'col' },
        card('Основное',
          field('Название', textInput({ get: () => d.title, set: (v) => { d.title = v ?? ''; } }, { max: 120, required: true })),
          h('div', { class: 'grid2' },
            field('Формат', select(FORMATS, { get: () => d.format, set: (v) => { d.format = v; } })),
            field('Возраст', select([['18+', '18+'], ['16+', '16+']], { get: () => d.age, set: (v) => { d.age = v; } }))),
          field('Описание', textArea({ get: () => d.body, set: (v) => { d.body = v ?? ''; } }, { rows: 6, max: 3000, placeholder: 'Формат, чего ждать зрителю, кто ведёт. Абзацы — через пустую строку.' }),
            { counter: () => `${d.body.length} / 3000` })),
        card('Дата и билеты',
          h('div', { class: 'grid3' },
            field('Дата', dateIn),
            field('Начало (время Перми)', timeIn),
            field('Цена от, ₽', numberInput({ get: () => d.priceFrom, set: (v) => { d.priceFrom = v; } }, { min: 0, max: 100000 }))),
          h('div', { class: 'import' },
            field('Ссылка на билеты (Qtickets)', textInput({ get: () => d.ticketUrl, set: (v) => { d.ticketUrl = v; } }, { type: 'url', placeholder: 'https://perm.qtickets.events/…', max: 500 })),
            importBtn),
          h('p', { class: 'muted small' }, 'Вставьте ссылку и нажмите «Заполнить» — название, дата, время и описание подтянутся со страницы Qtickets.'),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Места'),
            segmented([['ok', 'Есть места'], ['few', 'Мало мест'], ['out', 'Sold out']], d.seats, (v) => { d.seats = v; }, 'Места')),
          h('div', { class: 'field sep' }, h('span', { class: 'label' }, 'Статус шоу'),
            segmented([['plan', 'По плану'], ['moved', 'Перенесено', 'moved'], ['cancelled', 'Отменено', 'cancel']], d.status, (v) => { d.status = v; renderStatusExtra(); }, 'Статус шоу')),
          statusExtra,
          isNew ? h('div', { class: 'repeat' },
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Повторять'),
              segmented([['none', 'Нет'], ['1', 'Каждую неделю'], ['2', 'Раз в 2 недели']], repeat, (v) => { repeat = v; untilWrap.hidden = v === 'none'; renderRepeatInfo(); }, 'Повторять')),
            untilWrap,
            repeatInfo) : null),
        card(null, h('div', { class: 'card-head' }, h('h2', null, 'Состав'), castCount), castBox,
          h('p', { class: 'muted small' }, 'Порядок на сайте — как выбраны (цифра на карточке). Нового комика добавьте в разделе «Комики».')),
        card('Важно знать', impBox),
        card('Для поисковиков',
          field('Короткое описание для Яндекса', textInput({ get: () => d.seoDescription, set: (v) => { d.seoDescription = v; } }, { max: 200, placeholder: 'Если пусто — соберётся само из названия, даты и цены' })))),
      h('div', { class: 'col side-col' },
        h('section', { class: 'card sticky' },
          toggle(d.published, (v) => { d.published = v; }, 'Показывать на сайте', (v) => v ? 'Шоу видно в афише' : 'Черновик — на сайте не видно'),
          saveBtn,
          !isNew && d.published && d.status !== 'cancelled' ? featureBtn : null,
          !isNew && d.published ? h('a', { class: 'btn btn-block', href: `${app.siteUrl}/shows/${id}/`, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть на сайте') : null,
          !isNew ? h('div', { class: 'row' },
            h('a', { class: 'btn grow', href: `#/shows/new?copy=${encodeURIComponent(id)}` }, 'Сделать копию'),
            h('button', { type: 'button', class: 'btn btn-danger-outline grow', onclick: del }, 'Удалить')) : null),
        card('Обложка', coverBox, fileIn,
          h('div', { class: 'row' },
            h('label', { class: 'btn grow', for: 'cover-file' }, icon('upload', 16), d.cover ? 'Заменить фото' : 'Загрузить фото'),
            h('button', { type: 'button', class: 'btn', onclick: () => { d.cover = undefined; markDirty(); renderCover(); } }, 'Убрать'))),
        !isNew ? historyCard(`src/content/events/${id}.md`, async () => { await app.reload(); app.go(`#/shows/${id}`); }) : null)));
  return page;
}
