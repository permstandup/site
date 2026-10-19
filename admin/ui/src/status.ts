/** Индикатор «что сейчас на сайте»: публикуется / на сайте / ошибка сборки */
import { h, setChildren } from './dom';
import { api, type DeployStatus } from './api';
import { publishButton } from './publish';

const LABEL: Record<DeployStatus['state'], [string, string]> = {
  deployed: ['Все изменения на сайте', 'ok'],
  building: ['Публикуется на сайт…', 'busy'],
  waiting: ['Изменения ждут публикации…', 'busy'],
  failed: ['Ошибка публикации — изменения не вышли', 'err'],
  unknown: ['Статус публикации неизвестен', 'off'],
  local: ['Локальный режим — правки на этом компьютере', 'off'],
};

const el = h('div', { class: 'deploy', role: 'status', 'aria-live': 'polite' });
const wrap = h('div', { class: 'deploy-wrap' }, el);
let pubBtn: HTMLElement | null = null;
let timer: number | undefined;
let last: DeployStatus['state'] | null = null;

async function tick() {
  window.clearTimeout(timer);
  if (document.hidden) { timer = window.setTimeout(tick, 30_000); return; }
  let st: DeployStatus = { state: 'unknown' };
  try { st = await api.deployStatus(); } catch { /* сеть — покажем «неизвестен» */ }
  last = st.state;
  const [text, tone] = LABEL[st.state];
  el.className = `deploy deploy-${tone}`;
  setChildren(el, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', null, text));
  // Локальная админка: публикация на сайт — отдельной кнопкой
  if (st.state === 'local' && !pubBtn) { pubBtn = publishButton(); wrap.appendChild(pubBtn); }
  // пока идёт публикация — проверяем чаще
  timer = window.setTimeout(tick, st.state === 'building' || st.state === 'waiting' ? 10_000 : 60_000);
}

/** Вызывается после каждого сохранения — сразу показать «публикуется» */
export function deployKick() { last = 'waiting'; window.setTimeout(tick, 1500); }
export function deployIndicator() {
  if (last === null) tick();
  return wrap;
}
window.addEventListener('admin:saved', deployKick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
