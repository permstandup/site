import { h, icon } from '../dom';

const ERRORS: Record<string, string> = {
  state: 'Вход прервался или устарел. Попробуйте ещё раз.',
  github: 'GitHub не подтвердил вход. Попробуйте ещё раз.',
  not_allowed: 'У этого GitHub-аккаунта нет доступа к админке. Попросите владельца добавить вас.',
  no_2fa: 'Включите двухфакторную защиту в настройках GitHub (Settings → Password and authentication) и войдите снова.',
  rate: 'Слишком много попыток входа. Подождите 10 минут.',
};

export function loginView(err: string | null) {
  return h('div', { class: 'login' },
    h('div', { class: 'login-card' },
      h('div', { class: 'brand dark' }, h('img', { src: '/logo.svg', alt: '', width: 48, height: 48 }),
        h('div', null, h('div', { class: 'strong' }, 'Пермский стендап клуб'), h('div', { class: 'muted small' }, 'Админка сайта'))),
      h('h1', null, 'Вход'),
      err && ERRORS[err] ? h('div', { class: 'issues', role: 'alert' }, ERRORS[err]) : null,
      h('p', { class: 'muted' }, 'Войдите через GitHub-аккаунт, у которого есть доступ к сайту. Потребуется код из приложения-аутентификатора.'),
      // Обычная ссылка: вход начинается на сервере, пароль GitHub админка никогда не видит
      h('a', { class: 'btn btn-dark btn-lg', href: '/api/auth/login' }, icon('github'), 'Войти через GitHub'),
      h('div', { class: 'note' }, icon('lock', 18),
        h('span', null, 'Доступ только у аккаунтов из списка и только с двухфакторной защитой. Сессия действует сутки.')),
      h('a', { class: 'center small', href: 'https://permstandup.ru/' }, '← Вернуться на сайт')));
}
