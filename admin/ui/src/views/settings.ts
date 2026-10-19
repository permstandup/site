import { h, icon, setChildren } from '../dom';
import type { App } from '../main';
import { api, imageUrl } from '../api';
import { prepareImage } from '../image';
import { HOME_BLOCKS, type Settings } from '../../../../shared/schema';
import { THEME_VALUES, BG_VALUES } from '../../../../shared/themes';
import { isPast } from './shows';
import { busy, card, confirmBox, field, fmtShort, markClean, markDirty, segmented, showError, stringList, textArea, textInput, toast, toggle } from '../ui';
import { historyCard } from './history';

const SECTIONS: Array<[keyof Settings['sections'], string, string]> = [
  ['comics', 'Комики', 'Меню, главная, страницы комиков'],
  ['photos', 'Фото из клуба', 'Меню, блок на главной'],
  ['openmic', 'Open mic', 'Меню, блок на главной, страница'],
  ['facts', 'Факты о клубе', 'Четыре карточки на главной'],
  ['video', 'Видео', 'Блок на главной'],
  ['venue', 'Мероприятия', 'Меню, страница «Ваше мероприятие»'],
];

export function settingsView(app: App, logout: () => void) {
  const s: Settings = structuredClone(app.content.settings.data);
  const issuesBox = h('div');
  const str = (get: () => string, set: (v: string) => void) => ({ get, set: (v: string | undefined) => set(v ?? '') });

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Сохранить');
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    setChildren(issuesBox, );
    s.importantDefault = s.importantDefault.map((x) => x.trim()).filter(Boolean);
    s.openMic.rules = s.openMic.rules.map((x) => x.trim()).filter(Boolean);
    s.about.paragraphs = s.about.paragraphs.map((x) => x.trim()).filter(Boolean);
    try { await api.saveList('settings', s, app.content.settings.sha); markClean(); toast('Сохранено. На сайте — через 2–3 минуты.'); await app.reload(); app.go('#/settings'); } catch (e) { showError(e, issuesBox); }
  }));

  const steps = h('div', { class: 'col' }, s.openMic.steps.map((st, i) => h('div', { class: 'grid2' },
    field(`Шаг ${i + 1} — заголовок`, textInput(str(() => st.title, (v) => { st.title = v; }), { max: 60 })),
    field('Текст', textInput(str(() => st.text, (v) => { st.text = v; }), { max: 200 })))));

  const faqBox = h('div', { class: 'col' });
  const renderFaq = () => setChildren(faqBox, ...s.openMic.faq.map((f, i) => h('div', { class: 'faq-edit' },
    field('Вопрос', textInput(str(() => f.q, (v) => { f.q = v; }), { max: 150 })),
    field('Ответ', textArea(str(() => f.a, (v) => { f.a = v; }), { rows: 2, max: 800 })),
    h('button', { type: 'button', class: 'link-btn danger', onclick: () => { s.openMic.faq.splice(i, 1); markDirty(); renderFaq(); } }, 'Удалить вопрос'))),
  s.openMic.faq.length < 12 ? h('button', { type: 'button', class: 'link-btn', onclick: () => { s.openMic.faq.push({ q: '', a: '' }); markDirty(); renderFaq(); } }, '+ Добавить вопрос') : null);
  renderFaq();

  const facts = h('div', { class: 'grid2' }, s.facts.map((f, i) => h('div', { class: 'col' },
    field(`Карточка ${i + 1} — крупно`, textInput(str(() => f.title, (v) => { f.title = v; }), { max: 30 })),
    field('Текст', textInput(str(() => f.text, (v) => { f.text = v; }), { max: 120 })))));

  const logoutAll = async () => {
    if (!(await confirmBox('Выйти на всех устройствах? Всем администраторам, включая вас, придётся войти заново.', 'Выйти везде', true))) return;
    try { await api.logoutAll(); toast('Все сессии завершены'); logout(); } catch (e) { showError(e); }
  };

  // ----- главная страница -----
  const BLOCK_NAMES: Record<(typeof HOME_BLOCKS)[number], [string, string, keyof Settings['sections'] | null]> = {
    afisha: ['Афиша', 'Афиша', null], facts: ['Факты о клубе', '(без заголовка)', 'facts'], comics: ['Комики', 'Комики', 'comics'],
    video: ['Видео', 'Видео', 'video'], photos: ['Фото из клуба', 'Как у нас в клубе', 'photos'], openmic: ['Open mic', 'Хочешь на сцену?', 'openmic'],
  };
  for (const id of HOME_BLOCKS) if (!s.home.blocks.some((b) => b.id === id)) s.home.blocks.push({ id, title: '' });
  const blocksBox = h('div', { class: 'blocks' });
  const renderBlocks = () => setChildren(blocksBox, ...s.home.blocks.map((b, i) => {
    const [name, def, sec] = BLOCK_NAMES[b.id];
    const t = h('input', { type: 'text', value: b.title, maxlength: 60, placeholder: `Заголовок: ${def}`, 'aria-label': `Заголовок блока ${name}` });
    t.addEventListener('input', () => { b.title = t.value; markDirty(); });
    return h('div', { class: 'block-row' },
      h('div', { class: 'updown' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Выше: ${name}`, disabled: i === 0, onclick: () => { [s.home.blocks[i - 1], s.home.blocks[i]] = [s.home.blocks[i], s.home.blocks[i - 1]]; markDirty(); renderBlocks(); } }, icon('up', 16)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Ниже: ${name}`, disabled: i === s.home.blocks.length - 1, onclick: () => { [s.home.blocks[i + 1], s.home.blocks[i]] = [s.home.blocks[i], s.home.blocks[i + 1]]; markDirty(); renderBlocks(); } }, icon('down', 16))),
      h('span', { class: 'name' }, name, sec && !s.sections[sec] ? h('span', { class: 'off' }, 'выключен в «Разделах»') : null),
      t);
  }));
  renderBlocks();

  const upcoming = app.content.events.filter((e) => e.data.published && !isPast(e) && e.data.status !== 'cancelled')
    .sort((a, b) => a.data.start.localeCompare(b.data.start));
  const featSel = h('select', null,
    h('option', { value: '', selected: !s.home.featured }, 'Нет — показывать ближайшее шоу'),
    upcoming.map((e) => { const f = fmtShort(e.data.start); return h('option', { value: e.id, selected: s.home.featured === e.id }, `${f.date}, ${f.time} — ${e.data.title}`); }));
  featSel.addEventListener('change', () => { s.home.featured = featSel.value; markDirty(); });
  const featuredGone = s.home.featured && !upcoming.some((e) => e.id === s.home.featured);

  // ----- внешний вид -----
  const themesBox = h('div', { class: 'themes', role: 'radiogroup', 'aria-label': 'Цветовая тема' });
  const renderThemes = () => setChildren(themesBox, ...(Object.keys(THEME_VALUES) as Array<keyof typeof THEME_VALUES>).map((k) => {
    const t = THEME_VALUES[k];
    const prev = h('span', { class: 'theme-prev' }, h('span', { class: 'b' }), h('span', { class: 't' }));
    prev.style.background = BG_VALUES[s.background].bg;
    (prev.querySelector('.b') as HTMLElement).style.background = t.accent;
    (prev.querySelector('.t') as HTMLElement).style.background = t.hover;
    return h('button', { type: 'button', class: 'theme-opt', role: 'radio', 'aria-checked': String(s.theme === k), onclick: () => { s.theme = k; markDirty(); renderThemes(); renderBgs(); renderBannerPrev(); } },
      prev, h('span', { class: 'strong' }, t.label));
  }));
  renderThemes();
  const bgBox = h('div', { class: 'themes', role: 'radiogroup', 'aria-label': 'Цвет фона' });
  const renderBgs = () => setChildren(bgBox, ...(Object.keys(BG_VALUES) as Array<keyof typeof BG_VALUES>).map((k) => {
    const b = BG_VALUES[k];
    const th = THEME_VALUES[s.theme];
    const prev = h('span', { class: 'theme-prev' }, h('span', { class: 'card-mini' }), h('span', { class: 'b' }));
    prev.style.background = b.bg;
    (prev.querySelector('.card-mini') as HTMLElement).style.background = b.surface2;
    (prev.querySelector('.b') as HTMLElement).style.background = th.accent;
    return h('button', { type: 'button', class: 'theme-opt', role: 'radio', 'aria-checked': String(s.background === k), onclick: () => { s.background = k; markDirty(); renderBgs(); renderThemes(); } },
      prev, h('span', { class: 'strong' }, b.label));
  }));
  renderBgs();

  // ----- плашка -----
  const bannerPrev = h('div', { class: 'banner-prev' });
  const renderBannerPrev = () => {
    bannerPrev.className = `banner-prev ${s.banner.tone}`;
    const th = THEME_VALUES[s.theme];
    bannerPrev.style.background = s.banner.tone === 'accent' ? th.accent : '#ffc56b';
    bannerPrev.style.color = s.banner.tone === 'accent' ? th.onAccent : '#2a1a00';
    setChildren(bannerPrev, s.banner.text || 'Текст плашки', s.banner.link ? ` · ${s.banner.linkLabel || 'Подробнее'} →` : '');
  };
  renderBannerPrev();
  const untilIn = h('input', { type: 'date', value: s.banner.until });
  untilIn.addEventListener('input', () => { s.banner.until = untilIn.value; markDirty(); });
  const bannerText = textInput(str(() => s.banner.text, (v) => { s.banner.text = v; }), { max: 160, placeholder: 'Например: 31 декабря — новогодний стендап, билеты уже в продаже' });
  bannerText.addEventListener('input', renderBannerPrev);
  const bannerLabel = textInput(str(() => s.banner.linkLabel, (v) => { s.banner.linkLabel = v; }), { max: 40, placeholder: 'Подробнее' });
  bannerLabel.addEventListener('input', renderBannerPrev);
  const bannerLink = textInput(str(() => s.banner.link, (v) => { s.banner.link = v.trim(); }), { max: 300, placeholder: '/afisha/ или https://…' });
  bannerLink.addEventListener('input', renderBannerPrev);

  // ----- SEO -----
  const SEO_PAGES: Array<[keyof Settings['seo']['pages'], string]> = [['home', 'Главная'], ['afisha', 'Афиша'], ['comics', 'Комики'], ['openmic', 'Open mic'], ['contacts', 'Контакты']];
  const seoBox = h('div', { class: 'col' }, SEO_PAGES.map(([k, name]) => {
    const pg = s.seo.pages[k];
    return h('div', { class: 'faq-edit' },
      h('div', { class: 'strong' }, name),
      field('Заголовок в поиске', textInput(str(() => pg.title, (v) => { pg.title = v; }), { max: 70, placeholder: 'Пусто — по умолчанию' }), { counter: () => `${pg.title.length} / 70` }),
      field('Описание в поиске', textArea(str(() => pg.description, (v) => { pg.description = v; }), { rows: 2, max: 200, placeholder: 'Пусто — по умолчанию' }), { counter: () => `${pg.description.length} / 200` }));
  }));

  // ----- мероприятия (аренда зала) -----
  const venuePhotos = h('div', { class: 'pgrid' });
  const renderVenuePhotos = () => setChildren(venuePhotos, ...s.venue.photos.map((src, i) => h('div', { class: ['pcard', i === 0 && 'top'] },
    h('div', { class: 'pimg' },
      h('img', { src: imageUrl(src), alt: '' }),
      h('span', { class: 'pnum' }, i === 0 ? '1 · главное' : String(i + 1)),
      h('button', { type: 'button', class: 'pdel', 'aria-label': `Убрать фото ${i + 1}`, onclick: () => { s.venue.photos.splice(i, 1); markDirty(); renderVenuePhotos(); } }, icon('x', 14))),
    h('div', { class: 'pmeta' }, h('div', { class: 'row' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Левее', disabled: i === 0, onclick: () => { [s.venue.photos[i - 1], s.venue.photos[i]] = [s.venue.photos[i], s.venue.photos[i - 1]]; markDirty(); renderVenuePhotos(); } }, icon('up', 16)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Правее', disabled: i === s.venue.photos.length - 1, onclick: () => { [s.venue.photos[i + 1], s.venue.photos[i]] = [s.venue.photos[i], s.venue.photos[i + 1]]; markDirty(); renderVenuePhotos(); } }, icon('down', 16)))))));
  renderVenuePhotos();
  const venueFiles = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'venue-files' });
  const venueStatus = h('span', { class: 'muted small' });
  venueFiles.addEventListener('change', async () => {
    const files = [...(venueFiles.files ?? [])].slice(0, 8 - s.venue.photos.length);
    venueFiles.value = '';
    for (const [n, f] of files.entries()) {
      venueStatus.textContent = `Загружаю ${n + 1} из ${files.length}…`;
      try { s.venue.photos.push((await api.upload(await prepareImage(f))).src); markDirty(); renderVenuePhotos(); } catch (e) { showError(e); }
    }
    venueStatus.textContent = files.length ? 'Готово — нажмите «Сохранить» вверху страницы' : '';
  });

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', null, 'Настройки клуба'), saveBtn),
    issuesBox,
    card('Разделы сайта',
      h('p', { class: 'muted small' }, 'Выключенный раздел пропадает из меню и с главной. Тексты и фото сохраняются — его можно включить обратно в любой момент.'),
      h('div', { class: 'sections' },
        toggle(true, () => undefined, 'Афиша', () => 'Всегда включена', true),
        SECTIONS.map(([k, name, hint]) => toggle(s.sections[k], (v) => { s.sections[k] = v; }, name, (v) => v ? hint : 'Выключен — на сайте не виден')))),
    card('Главная страница',
      h('div', { class: 'featured-box' },
        field('Главное мероприятие', featSel, { hint: 'Выделяется крупно на первом экране и меткой в афише. После даты шоу выделение пропадёт само.' }),
        featuredGone ? h('p', { class: 'small' }, 'Выбранное раньше шоу уже прошло или отменено — на сайте показывается ближайшее.') : null,
        h('div', { class: 'grid2' },
          field('Метка', textInput(str(() => s.home.featuredLabel, (v) => { s.home.featuredLabel = v; }), { max: 40, placeholder: 'Главное мероприятие' })),
          field('Короткий текст (необязательно)', textInput(str(() => s.home.featuredText, (v) => { s.home.featuredText = v; }), { max: 200, placeholder: 'Почему стоит прийти' })))),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Порядок блоков и заголовки'),
        h('span', { class: 'hint' }, 'Первый экран с ближайшим шоу всегда сверху. Пустой заголовок — стандартный.'), blocksBox)),
    card('Мероприятия — аренда зала',
      h('p', { class: 'muted small' }, 'Страница «Ваше мероприятие в клубе» (/arenda/). Включается и выключается в «Разделах сайта» выше.'),
      field('Заголовок', textInput(str(() => s.venue.title, (v) => { s.venue.title = v; }), { max: 80 })),
      field('Текст', textArea(str(() => s.venue.lead, (v) => { s.venue.lead = v; }), { rows: 3, max: 600 })),
      field('Заголовок списка', textInput(str(() => s.venue.servicesTitle, (v) => { s.venue.servicesTitle = v; }), { max: 80 })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Что можно заказать'),
        stringList({ get: () => s.venue.services, set: (v) => { s.venue.services = v; } }, { max: 12, addLabel: '+ Пункт', maxLen: 120 })),
      field('Строка под списком', textInput(str(() => s.venue.note, (v) => { s.venue.note = v; }), { max: 200, placeholder: 'Свет, звук, кухня, бар — работают.' })),
      field('Куда писать по мероприятиям (Telegram или VK)', textInput(str(() => s.venue.contact, (v) => { s.venue.contact = v.trim(); }), { type: 'url', max: 300, placeholder: 'Пусто — Telegram-канал клуба' })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Фото зала (до 8, первое — крупно)'),
        h('label', { class: 'drop', for: 'venue-files' }, icon('upload', 24), h('span', { class: 'strong' }, 'Добавить фото'), venueStatus),
        venueFiles, venuePhotos)),
    card('Внешний вид',
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Акцентный цвет'),
        h('span', { class: 'hint' }, 'Кнопки, метки, подсветка.'), themesBox),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Цвет фона'),
        h('span', { class: 'hint' }, 'Фон страниц, карточек и подвала. Все варианты тёмные и проверены на читаемость с любым акцентом.'), bgBox)),
    card('Плашка-объявление',
      toggle(s.banner.enabled, (v) => { s.banner.enabled = v; }, 'Показывать плашку над шапкой сайта', (v) => v ? 'Видна на всех страницах' : 'Выключена'),
      bannerPrev,
      field('Текст', bannerText),
      h('div', { class: 'grid2' }, field('Ссылка (необязательно)', bannerLink), field('Текст ссылки', bannerLabel)),
      h('div', { class: 'grid2' },
        field('Показывать до (включительно)', untilIn, { hint: 'Пусто — пока не выключите. После даты плашка пропадёт сама.' }),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Цвет'),
          segmented([['accent', 'Акцентный'], ['warning', 'Предупреждение']], s.banner.tone, (v) => { s.banner.tone = v; renderBannerPrev(); }, 'Цвет плашки')))),
    h('div', { class: 'grid2 top' },
      h('div', { class: 'col' },
        card('Контакты',
          field('Адрес', textInput(str(() => s.address, (v) => { s.address = v; }), { max: 120 })),
          field('Как добраться', textArea(str(() => s.howToGet, (v) => { s.howToGet = v; }), { rows: 2, max: 400, placeholder: 'Ориентиры, остановки, парковка' })),
          field('Телефон', textInput(str(() => s.phone, (v) => { s.phone = v; }), { type: 'tel', max: 30 }))),
        card('Ссылки',
          field('Telegram-канал', textInput(str(() => s.links.telegram, (v) => { s.links.telegram = v; }), { type: 'url', max: 300 })),
          field('Запись на open mic (Telegram или VK ведущего)', textInput(str(() => s.links.openMicHost, (v) => { s.links.openMicHost = v; }), { type: 'url', max: 300, placeholder: 'https://t.me/…' }),
            { hint: 'Ведущий сменился — поменяйте ссылку здесь. Пусто — кнопка ведёт в Telegram-канал клуба.' }),
          field('ВКонтакте', textInput(str(() => s.links.vk, (v) => { s.links.vk = v; }), { type: 'url', max: 300 })),
          field('Qtickets — все шоу клуба', textInput(str(() => s.links.qtickets, (v) => { s.links.qtickets = v; }), { type: 'url', max: 500 })),
          field('Яндекс Афиша', textInput(str(() => s.links.yandexAfisha, (v) => { s.links.yandexAfisha = v; }), { type: 'url', max: 500 }))),
        card('О клубе (страница «Контакты»)',
          stringList({ get: () => s.about.paragraphs, set: (v) => { s.about.paragraphs = v; } }, { max: 6, addLabel: '+ Абзац', maxLen: 1200 }),
          field('Реквизиты', textInput(str(() => s.about.requisites, (v) => { s.about.requisites = v; }), { max: 300, placeholder: 'ИП / ООО, ИНН, ОГРН' })))),
      h('div', { class: 'col' },
        card('Тексты',
          field('Подзаголовок на главной', textArea(str(() => s.texts.heroLead, (v) => { s.texts.heroLead = v; }), { rows: 3, max: 400 })),
          field('Блок «Хочешь на сцену?» на главной', textArea(str(() => s.texts.openMic, (v) => { s.texts.openMic = v; }), { rows: 2, max: 400 })),
          h('div', { class: 'field' }, h('span', { class: 'label' }, '«Важно знать» по умолчанию для шоу'),
            stringList({ get: () => s.importantDefault, set: (v) => { s.importantDefault = v; } }, { max: 10, addLabel: '+ Пункт', maxLen: 200 }))),
        card('Факты на главной', facts),
        card('Безопасность',
          h('p', { class: 'small' }, 'Войти в админку могут только эти GitHub-аккаунты (с двухфакторной защитой):'),
          h('ul', { class: 'admins' }, app.session.admins.map((a) => h('li', null, h('span', { class: 'strong' }, a), a === app.session.login ? h('span', { class: 'pill ok' }, 'Это вы') : null))),
          h('p', { class: 'muted small' }, 'Добавить или убрать человека можно только в настройках сервера (Yandex Cloud) — из админки этого сделать нельзя специально: даже если кто-то получит доступ к админке, он не сможет пустить туда себя.'),
          h('p', { class: 'muted small' }, 'Вся история изменений хранится в GitHub — любую прошлую версию можно вернуть в карточке шоу, комика или фото.'),
          h('button', { type: 'button', class: 'btn btn-danger-outline', onclick: logoutAll }, 'Выйти на всех устройствах')))),
    card('Страница Open mic',
      field('Когда проходят', textInput(str(() => s.openMic.schedule, (v) => { s.openMic.schedule = v; }), { max: 60, placeholder: 'по будням' })),
      field('Подпись под кнопкой записи', textInput(str(() => s.openMic.contactNote, (v) => { s.openMic.contactNote = v; }), { max: 200 })),
      steps,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Правила'),
        stringList({ get: () => s.openMic.rules, set: (v) => { s.openMic.rules = v; } }, { max: 12, addLabel: '+ Правило', maxLen: 200 })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Частые вопросы'), faqBox)),
    card('SEO — как сайт выглядит в Яндексе',
      field('Код подтверждения Яндекс Вебмастера', textInput(str(() => s.seo.yandexVerification, (v) => { s.seo.yandexVerification = v.trim(); }), { max: 16, placeholder: 'например 1a2b3c4d5e6f7a8b' }),
        { hint: 'Из meta-тега yandex-verification в Вебмастере — только сам код из 16 символов.' }),
      field('Номер счётчика Яндекс Метрики', textInput(str(() => s.seo.metrikaId, (v) => { s.seo.metrikaId = v.trim(); }), { max: 12, placeholder: 'например 98765432' }),
        { hint: 'Только цифры. Пусто — Метрика выключена. Вебвизор (запись действий посетителей) не используется.' }),
      seoBox),
    historyCard('src/content/settings.json', async () => { await app.reload(); app.go('#/settings'); }));
}
