# Админка: запуск

## Посмотреть локально (без GitHub и облака)

```
npm.cmd run admin:dev
```

Откройте http://localhost:8787 и нажмите «Войти через GitHub» — в локальном режиме вход происходит сразу, без GitHub.
Правки пишутся **прямо в файлы проекта** (`src/content`, `public/uploads`) — их видно в `npm.cmd run dev`.
Сервер слушает только этот компьютер (127.0.0.1), из сети он недоступен.

Тесты защиты: `npm.cmd run admin:test`.

## Боевой запуск (шаг 5 плана)

Делается один раз, по шагам вместе с Claude. Секреты вводятся **только** в интерфейсах GitHub и Yandex Cloud — пересылать их никому не нужно.

### 1. GitHub App (доступ функции к репозиторию)

GitHub → аккаунт permstandup → Settings → Developer settings → GitHub Apps → New GitHub App:

- Name: `permstandup-admin`; Homepage: `https://permstandup.ru`
- Callback URL: `https://admin.permstandup.ru/api/auth/callback`
- Request user authorization (OAuth) during installation — **выключить**; Expire user authorization tokens — **включить**
- Webhook — **выкл**
- Repository permissions: **Contents: Read and write**, Metadata: Read-only. **Всё остальное — No access** (в т. ч. Workflows, Actions, Administration).
- Account permissions: ничего
- Where can this app be installed: **Only on this account**

Затем: Generate a private key (скачается .pem), Generate a client secret, Install App → Only select repositories → `site`.
Записать: App ID, Client ID, Installation ID (число в адресе страницы установки).

### 2. Функция в Yandex Cloud

- Cloud Functions → создать `admin`, среда **Node.js 22**, точка входа `index.handler`, память 256 МБ, таймаут 30 с.
- Код: файл `admin/dist/function/index.js` (собирается `npm.cmd run admin:build`).
- Сервисный аккаунт: без ролей (функции не нужен доступ к облаку).
- Переменные окружения (секреты лучше через Lockbox):

| Переменная | Значение |
| --- | --- |
| `ADMIN_ORIGIN` | `https://admin.permstandup.ru` |
| `SITE_URL` | `https://permstandup.ru` |
| `REPO_OWNER` / `REPO_NAME` / `REPO_BRANCH` | `permstandup` / `site` / `main` |
| `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_CLIENT_ID` | из шага 1 |
| `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` | из шага 1 (**секреты**) |
| `ADMIN_GITHUB_USERS` | `id:логин` через запятую, например `12345678:nikita` |
| `SESSION_KEY` | 32 случайных байта в base64 (**секрет**) |
| `SESSION_HOURS` | `24` |

Числовой id GitHub-аккаунта: `https://api.github.com/users/<логин>` → поле `id`.

### 3. API Gateway + домен

API Gateway с одним маршрутом `/{path+}` (любой метод) → функция `admin`, плюс корень `/`. Подключить домен `admin.permstandup.ru` с сертификатом из Certificate Manager (Let's Encrypt). В DNS — CNAME на адрес шлюза. Включить ограничение частоты запросов на шлюзе.

### Если ключи могли утечь

1. GitHub App → Private keys → удалить старый, создать новый; Client secrets → перевыпустить.
2. Новый `SESSION_KEY` — все сессии сразу станут недействительны.
3. Обновить переменные функции.
