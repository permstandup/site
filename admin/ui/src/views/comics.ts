import { h, icon, setChildren } from '../dom';
import type { App } from '../main';
import { api, imageUrl } from '../api';
import type { ComedianData } from '../../../../shared/schema';
import { busy, card, confirmBox, field, markClean, markDirty, segmented, showError, textArea, textInput, toast, toggle } from '../ui';
import { prepareImage } from '../image';
import { slugify, uniqueId } from '../slug';
import { historyCard } from './history';

type Draft = ComedianData & { body: string };

export function comicsView(app: App, selected?: string) {
  const list = [...app.content.comedians].sort((a, b) => (a.data.order ?? 100) - (b.data.order ?? 100));
  const cur = selected === 'new' ? null : list.find((c) => c.id === selected) ?? (selected ? null : list[0] ?? null);
  const isNew = selected === 'new' || !cur;

  // ----- список с порядком -----
  let order = list.map((c) => c.id);
  const orderBtn = h('button', { type: 'button', class: 'btn btn-sm', hidden: true, 'data-save': '' }, 'Сохранить порядок');
  const listBox = h('div', { class: 'clist' });
  const renderList = () => {
    setChildren(listBox, ...order.map((id, i) => {
      const c = list.find((x) => x.id === id)!;
      return h('div', { class: ['citem', cur?.id === id && 'on'] },
        h('div', { class: 'updown' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Выше: ${c.data.name}`, disabled: i === 0, onclick: () => move(i, -1) }, icon('up', 16)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Ниже: ${c.data.name}`, disabled: i === order.length - 1, onclick: () => move(i, 1) }, icon('down', 16))),
        c.data.photo ? h('img', { class: 'ava', src: imageUrl(c.data.photo), alt: '' }) : h('span', { class: 'ava' }),
        h('a', { class: 'grow', href: `#/comics/${id}` }, h('span', { class: 'strong block' }, c.data.name), h('span', { class: 'muted small block' }, c.data.role === 'resident' ? 'Резидент' : 'Гость')),
        h('span', { class: ['pill', c.data.visible ? 'ok' : 'off'] }, c.data.visible ? 'На сайте' : 'Скрыт'));
    }));
  };
  const move = (i: number, dir: number) => {
    const j = i + dir;
    [order[i], order[j]] = [order[j], order[i]];
    orderBtn.hidden = false;
    markDirty();
    renderList();
  };
  orderBtn.addEventListener('click', () => busy(orderBtn, async () => {
    await api.saveOrder(order.map((id) => ({ id, baseSha: list.find((c) => c.id === id)!.sha })));
    markClean(); toast('Порядок сохранён'); await app.reload(); app.go(location.hash);
  }));
  renderList();

  // ----- редактор -----
  const d: Draft = cur
    ? { ...structuredClone(cur.data), body: cur.body }
    : { name: '', role: 'resident', videos: [], order: (list.length + 1) * 10, visible: true, body: '' };
  const issuesBox = h('div');
  const photoBox = h('div', { class: 'portrait' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-file' });
  const renderPhoto = () => {
    const u = imageUrl(d.photo);
    setChildren(photoBox, u ? h('img', { src: u, alt: d.name }) : h('span', { class: 'muted small' }, 'Портрет'));
  };
  renderPhoto();
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    setChildren(photoBox, h('span', { class: 'muted small' }, 'Загружаю…'));
    try { d.photo = (await api.upload(await prepareImage(f))).src; markDirty(); toast('Фото загружено — не забудьте сохранить'); } catch (e) { showError(e); }
    renderPhoto();
  });

  const videosArea = textArea({ get: () => d.videos.join('\n'), set: (v) => { d.videos = (v ?? '').split('\n').map((s) => s.trim()).filter(Boolean); } }, { rows: 3, placeholder: 'https://vkvideo.ru/…' });

  const save = async () => {
    setChildren(issuesBox, );
    const { body, ...data } = d;
    const clean: Record<string, unknown> = { ...data };
    for (const k of Object.keys(clean)) if (clean[k] === undefined || clean[k] === '') delete clean[k];
    if (d.role === 'resident') delete clean.city;
    const id = isNew ? uniqueId(slugify(d.name || 'comic', 40), new Set(list.map((c) => c.id))) : cur!.id;
    try {
      await api.saveEntry('comedians', id, clean, body, isNew ? null : cur!.sha);
      markClean(); toast('Сохранено. На сайте — через 2–3 минуты.');
      await app.reload(); app.go(`#/comics/${id}`);
    } catch (e) { showError(e, issuesBox); }
  };
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-save': '' }, 'Сохранить');
  saveBtn.addEventListener('click', () => busy(saveBtn, save));
  const del = async () => {
    if (!cur || !(await confirmBox(`Удалить комика «${cur.data.name}»? Если он просто временно не выступает — лучше скройте его.`, 'Удалить', true))) return;
    try { await api.deleteEntry('comedians', cur.id, cur.sha); markClean(); toast('Удалено'); await app.reload(); app.go('#/comics'); } catch (e) { showError(e); }
  };

  const cityField = field('Город (для гостей)', textInput({ get: () => d.city, set: (v) => { d.city = v; } }, { placeholder: 'Например, Екатеринбург', max: 60 }));
  cityField.hidden = d.role === 'resident';

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', null, 'Комики'),
      h('a', { class: 'btn btn-primary', href: '#/comics/new' }, icon('plus', 18), h('span', { class: 'hide-sm' }, 'Новый комик'))),
    h('div', { class: 'comics-grid' },
      h('section', { class: 'card flush', 'data-save-scope': '' },
        h('div', { class: 'card-head pad' }, h('span', { class: 'muted small' }, 'Порядок на сайте — стрелками'), orderBtn),
        list.length ? listBox : h('p', { class: 'muted pad' }, 'Комиков пока нет.')),
      h('div', { class: 'col' },
        issuesBox,
        card(isNew ? 'Новый комик' : null,
          h('div', { class: 'comic-top' },
            h('div', { class: 'portrait-col' }, photoBox, fileIn, h('label', { class: 'btn btn-sm', for: 'photo-file' }, icon('upload', 16), d.photo ? 'Заменить' : 'Загрузить')),
            h('div', { class: 'col grow' },
              field('Имя и фамилия', textInput({ get: () => d.name, set: (v) => { d.name = v ?? ''; } }, { max: 80, required: true })),
              h('div', { class: 'field' }, h('span', { class: 'label' }, 'Статус'),
                segmented([['resident', 'Резидент'], ['guest', 'Гость']], d.role, (v) => { d.role = v; cityField.hidden = v === 'resident'; }, 'Статус')),
              cityField,
              field('Строка под именем', textInput({ get: () => d.tagline, set: (v) => { d.tagline = v; } }, { max: 120, placeholder: 'Коротко, в одну строку' })))),
          field('Био', textArea({ get: () => d.body, set: (v) => { d.body = v ?? ''; } }, { rows: 4, max: 600, placeholder: 'Откуда, сколько лет в стендапе, о чём шутит' }), { counter: () => `${d.body.length} / 300` }),
          h('div', { class: 'grid2' },
            field('Telegram', textInput({ get: () => d.telegram, set: (v) => { d.telegram = v; } }, { type: 'url', placeholder: 'https://t.me/…', max: 300 })),
            field('ВКонтакте', textInput({ get: () => d.vk, set: (v) => { d.vk = v; } }, { type: 'url', placeholder: 'https://vk.ru/…', max: 300 }))),
          field('Сайт (необязательно)', textInput({ get: () => d.website, set: (v) => { d.website = v?.trim() || undefined; } }, { type: 'url', placeholder: 'https://…', max: 500 }), { hint: 'Личная страница комика. Пусто — кнопки «Сайт» не будет.' }),
          field('Видео — ссылки на VK Видео, Rutube или YouTube, по одной в строке', videosArea),
          h('div', { class: 'card-foot' },
            toggle(d.visible, (v) => { d.visible = v; }, 'Показывать на сайте', (v) => v ? 'Виден в списке и на главной' : 'Скрыт — данные сохранятся'),
            h('div', { class: 'row' },
              !isNew ? h('button', { type: 'button', class: 'btn btn-danger-outline', onclick: del }, 'Удалить') : null,
              !isNew && d.visible ? h('a', { class: 'btn', href: `${app.siteUrl}/comics/${cur!.id}/`, target: '_blank', rel: 'noopener noreferrer' }, 'На сайте') : null,
              saveBtn))),
        !isNew ? historyCard(`src/content/comedians/${cur!.id}.md`, async () => { await app.reload(); app.go(location.hash); }) : null)));
}
