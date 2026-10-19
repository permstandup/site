# Запуск сайта и админки

## Сейчас: бесплатно на GitHub Pages

Пока нет бюджета на Yandex Cloud, сайт публикуется на GitHub Pages (`.github/workflows/pages.yml`), а правки делаются в локальной админке на компьютере и отправляются кнопкой «Опубликовать на сайт». Публикация в Yandex Cloud (`deploy.yml`) выключена и запускается только вручную.

1. **Репозиторий — публичный** (бесплатные Pages только для публичных): github.com/permstandup/site → Settings → General → Danger Zone → Change visibility → Public. Секретов в репозитории нет.
2. **Pages из Actions:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Свой домен:** Settings → Pages → Custom domain: `permstandup.ru` → Save (файл `public/CNAME` уже есть).
4. **Подтверждение домена** (чтобы никто другой не мог занять его на GitHub): аватар → Settings → Pages → Add a domain → `permstandup.ru` → GitHub покажет TXT-запись → добавить её в Reg.ru → Verify.
5. **DNS в Reg.ru** (Домены → permstandup.ru → DNS-серверы и управление зоной), DNS-серверы — Reg.ru:
   - `@` A → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (четыре записи; старые A/AAAA для `@` удалить);
   - `www` CNAME → `permstandup.github.io.`
6. Когда GitHub покажет «DNS check successful» → включить **Enforce HTTPS**.
7. Actions → «Публикация сайта (GitHub Pages)» → Run workflow. Дальше сайт собирается сам после каждой публикации и каждую ночь.

**Ограничения:** HTTP-заголовки безопасности на Pages не настраиваются (CSP задана внутри страниц); онлайн-админки нет — правки только с компьютера; из России GitHub иногда работает с перебоями. При переезде в Yandex Cloud — этапы ниже, затем в Reg.ru вернуть DNS на Yandex и включить `deploy.yml`.

---


Делается один раз, по этапам, вместе с Claude. **Секреты (ключи, пароли, коды) вводятся только в интерфейсах GitHub и Yandex Cloud — пересылать их никому не нужно, Claude тоже.**

- Этап А — сайт на permstandup.ru (Object Storage + автосборка)
- Этап Б — админка на admin.permstandup.ru
- Этап В — Метрика, Вебмастер, финальная проверка

---

## Этап А. Сайт

### А1. Каталог и бакет (Yandex Cloud)

1. Консоль Yandex Cloud → облако → **Создать каталог** `site`. В нём будет только сайт — так ключ публикации не даст доступа ни к чему другому.
2. В каталоге `site`: **Object Storage → Создать бакет**:
   - Имя: `permstandup.ru` (ровно как домен — это обязательно для своего домена)
   - Макс. размер: 1 ГБ
   - Доступ на чтение объектов: **Публичный**; к списку объектов и настройкам: **Ограниченный**
   - Класс хранилища: Стандартное
3. Бакет → **Веб-сайт** → Хостинг: главная страница `index.html`, страница ошибки `404.html` → Сохранить.

### А2. Ключ для публикации

1. Каталог `site` → **Сервисные аккаунты → Создать**: имя `site-deployer`, роль **`storage.editor`** (выдаётся на каталог `site`, других ролей не нужно).
2. Открыть `site-deployer` → **Создать новый ключ → Создать статический ключ доступа**. Появятся «Идентификатор ключа» и «Секретный ключ» — секрет показывается **один раз**. Не закрывайте окно, сразу переходите к А3.

### А3. Секреты в GitHub

1. github.com/permstandup/site → **Settings → Environments → production** (появится после первого запуска сборки; если нет — New environment `production`).
2. **Deployment branches and tags** → Selected branches → добавить `main` (секреты достанутся только сборке из основной ветки).
3. **Environment secrets → Add secret**:
   - `YC_S3_KEY_ID` — идентификатор ключа
   - `YC_S3_SECRET` — секретный ключ
4. Закрыть окно с ключом в Yandex Cloud. Нигде больше ключ не храните.
5. Settings → **Code security** → включить **Dependabot alerts** (GitHub будет предупреждать об уязвимостях в библиотеках).

### А4. Первая публикация

1. GitHub → **Actions → «Публикация сайта» → Run workflow**.
2. Через 2–3 минуты сайт откроется по служебному адресу `http://permstandup.ru.website.yandexcloud.net`.

### А5. Домен (Cloud DNS)

Для домена без www нужна запись ANAME — её поддерживает Cloud DNS (небольшая плата за зону и запросы).

1. Каталог `site` → **Cloud DNS → Создать зону**: `permstandup.ru.`, тип **публичная**.
2. В зоне → Создать запись: имя `@` (пусто), тип **ANAME**, значение `permstandup.ru.website.yandexcloud.net.`, TTL 600.
3. У регистратора домена → DNS-серверы домена → заменить на `ns1.yandexcloud.net` и `ns2.yandexcloud.net`. Обновление занимает от часа до суток.

### А6. HTTPS

1. **Certificate Manager → Добавить сертификат → Let's Encrypt**: домены `permstandup.ru`, `www.permstandup.ru`, `admin.permstandup.ru`; проверка — **DNS**.
2. В сертификате будут CNAME-записи для проверки — нажмите «Создать запись» (сами добавятся в Cloud DNS). Статус станет «Issued» через 10–30 минут.
3. Бакет `permstandup.ru` → **Безопасность → HTTPS** → источник Certificate Manager → выбрать сертификат. Переадресация http→https включится сама.

### А7. www → без www (по желанию)

Бакет `www.permstandup.ru` → Веб-сайт → **Переадресация** на `permstandup.ru`, протокол https. В Cloud DNS — запись CNAME `www` → `www.permstandup.ru.website.yandexcloud.net.` HTTPS — тот же сертификат.

---

## Этап Б. Админка

### Б1. GitHub App

GitHub (под permstandup) → Settings → Developer settings → **GitHub Apps → New GitHub App**:

- Name: `permstandup-admin`; Homepage: `https://permstandup.ru`
- Callback URL: `https://admin.permstandup.ru/api/auth/callback`
- Request user authorization (OAuth) during installation — **выключить**; Expire user authorization tokens — **включить**
- Webhook — **выключить**
- Repository permissions: **Contents: Read and write**, **Actions: Read-only**, Metadata: Read-only. **Всё остальное — No access** (в т. ч. Workflows, Administration, Secrets)
- Account permissions: ничего
- Where can this app be installed: **Only on this account**

Затем: **Generate a private key** (скачается .pem), **Generate a new client secret**, **Install App → Only select repositories → site**. Записать (это не секреты): App ID, Client ID, Installation ID (число в адресе страницы установки).

### Б2. Каталог, секреты, функция

1. Новый каталог `admin` (отдельно от сайта).
2. **Lockbox → Создать секрет** `admin-secrets` с ключами:
   - `GITHUB_APP_PRIVATE_KEY` — содержимое .pem целиком
   - `GITHUB_CLIENT_SECRET`
   - `SESSION_KEY` — сгенерировать на своём компьютере: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

   После этого .pem-файл удалить с компьютера.
3. Сервисный аккаунт `admin-function` с ролью **`lockbox.payloadViewer`** только на секрет `admin-secrets`.
4. Архив функции: GitHub → Actions → «Сборка админки» → последний успешный запуск → Artifacts → `admin-function` (внутри `function.zip`).
5. **Cloud Functions → Создать функцию** `admin` → версия: среда **Node.js 22**, способ — ZIP-архив, точка входа `index.handler`, таймаут 30 с, память 256 МБ, сервисный аккаунт `admin-function`.
   - Переменные окружения:

| Переменная | Значение |
| --- | --- |
| `ADMIN_ORIGIN` | `https://admin.permstandup.ru` |
| `SITE_URL` | `https://permstandup.ru` |
| `REPO_OWNER` / `REPO_NAME` / `REPO_BRANCH` | `permstandup` / `site` / `main` |
| `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_CLIENT_ID` | из Б1 |
| `ADMIN_GITHUB_USERS` | `id:логин` через запятую, например `12345678:nikita` |
| `SESSION_HOURS` | `24` |

   - Секреты Lockbox → переменные `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_SECRET`, `SESSION_KEY` из `admin-secrets`.
   - Функцию **не** делать публичной.

Числовой id GitHub-аккаунта: открыть `https://api.github.com/users/<логин>` → поле `id`.

### Б3. API Gateway и домен

1. Сервисный аккаунт `admin-gateway` с ролью **`functions.functionInvoker`** на функцию `admin`.
2. **API Gateway → Создать**: спецификация — `admin/gateway.yaml`, подставить ID функции и ID `admin-gateway`.
3. Шлюз → **Домены → Подключить**: `admin.permstandup.ru`, сертификат из А6.
4. Cloud DNS → запись CNAME `admin` → служебный домен шлюза (вида `d5d….apigw.yandexcloud.net.`).
5. Открыть `https://admin.permstandup.ru`, войти через GitHub.

### Обновление админки

После изменений в `admin/` GitHub сам соберёт новый `function.zip` (Actions → «Сборка админки»). Загрузить его новой версией функции в консоли. У сборки специально нет доступа к Yandex Cloud.

---

## Этап В. Метрика, Вебмастер, проверка

1. metrika.yandex.ru → создать счётчик для `permstandup.ru` (вебвизор не включать) → номер счётчика вписать в админке: Настройки → SEO.
2. webmaster.yandex.ru → добавить сайт → способ «Meta-тег» → код из `content="…"` вписать в админке: Настройки → SEO → подождать публикации → «Проверить». Затем добавить карту сайта `https://permstandup.ru/sitemap-index.xml`.
3. Проверка: телефоны и компьютер, все страницы, покупка билета по ссылкам, вход в админку, правка шоу → появление на сайте.

---

## Локальная проверка админки

```
npm.cmd run admin:dev
```

http://localhost:8787 — вход сразу, без GitHub. Правки пишутся **в файлы проекта**. Тесты защиты: `npm.cmd run admin:test`.

## Если ключи могли утечь

- **Ключ публикации сайта:** Yandex Cloud → `site-deployer` → удалить статический ключ, создать новый → заменить секреты в GitHub (А3).
- **GitHub App:** Private keys → удалить старый, создать новый; Client secrets → перевыпустить → обновить Lockbox.
- **Сессии админки:** новый `SESSION_KEY` в Lockbox — все входы сразу станут недействительны. Или кнопка «Выйти на всех устройствах» в админке.
