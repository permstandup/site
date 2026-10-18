import { h, setChildren } from '../dom';
import type { App } from '../main';
import { api } from '../api';
import type { Settings } from '../../../../shared/schema';
import { busy, card, confirmBox, field, markClean, markDirty, showError, stringList, textArea, textInput, toast, toggle } from '../ui';
import { historyCard } from './history';

const SECTIONS: Array<[keyof Settings['sections'], string, string]> = [
  ['comics', 'Комики', 'Меню, главная, страницы комиков'],
  ['photos', 'Фото из клуба', 'Меню, блок на главной'],
  ['openmic', 'Open mic', 'Меню, блок на главной, страница'],
  ['facts', 'Факты о клубе', 'Четыре карточки на главной'],
  ['video', 'Видео', 'Блок на главной'],
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

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', null, 'Настройки клуба'), saveBtn),
    issuesBox,
    card('Разделы сайта',
      h('p', { class: 'muted small' }, 'Выключенный раздел пропадает из меню и с главной. Тексты и фото сохраняются — его можно включить обратно в любой момент.'),
      h('div', { class: 'sections' },
        toggle(true, () => undefined, 'Афиша', () => 'Всегда включена', true),
        SECTIONS.map(([k, name, hint]) => toggle(s.sections[k], (v) => { s.sections[k] = v; }, name, (v) => v ? hint : 'Выключен — на сайте не виден')))),
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
    historyCard('src/content/settings.json', async () => { await app.reload(); app.go('#/settings'); }));
}
