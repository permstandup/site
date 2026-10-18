import { h, setChildren } from '../dom';
import { api } from '../api';
import { card, confirmBox, fmtWhen, showError, toast } from '../ui';

/** Блок «История изменений» с возвратом прошлой версии файла */
export function historyCard(path: string, onRestored: () => Promise<void>) {
  const list = h('div', { class: 'history' }, h('div', { class: 'muted small' }, 'Загружаю…'));
  const load = async () => {
    try {
      const { items } = await api.history(path);
      if (!items.length) { setChildren(list, h('div', { class: 'muted small' }, 'Изменений пока нет.')); return; }
      setChildren(list, ...items.map((it, i) => h('div', { class: 'h-item' },
        h('div', null,
          h('div', { class: 'small' }, it.message.replace(/^Админка: /, '').replace(/\s*\([^)]*\)$/, '')),
          h('div', { class: 'muted small' }, `${fmtWhen(it.date)} · ${it.author}`)),
        i === 0 ? h('span', { class: 'muted small' }, 'сейчас') : h('button', {
          type: 'button', class: 'link-btn small',
          onclick: async () => {
            if (!(await confirmBox(`Вернуть версию от ${fmtWhen(it.date)}? Текущая версия останется в истории.`, 'Вернуть'))) return;
            try { await api.restore(path, it.sha); toast('Версия возвращена'); await onRestored(); } catch (e) { showError(e); }
          },
        }, 'Вернуть эту версию'))));
    } catch (e) { setChildren(list, h('div', { class: 'muted small' }, 'Историю сейчас не загрузить.')); showError(e); }
  };
  load();
  return card('История изменений', list);
}
