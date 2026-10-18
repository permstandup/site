/**
 * Настройки функции. Все секреты приходят только из переменных окружения
 * Yandex Cloud Function (в коде и в репозитории их нет).
 */
export interface Admin { id: number; login: string }

export interface Config {
  /** Адрес админки, например https://admin.permstandup.ru — единственный разрешённый Origin */
  origin: string;
  siteUrl: string;
  repo: { owner: string; name: string; branch: string };
  github: {
    appId: string;
    privateKey: string;
    installationId: string;
    clientId: string;
    clientSecret: string;
  };
  /** Белый список: только эти GitHub-аккаунты (по числовому id) могут войти */
  admins: Admin[];
  /** 32 байта ключа для шифрования cookie сессии */
  sessionKey: Buffer;
  sessionHours: number;
  require2fa: boolean;
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`Не задана переменная окружения ${k}`);
  return v;
}

/** ADMIN_GITHUB_USERS="12345:nikita,67890:anna" */
export function parseAdmins(raw: string): Admin[] {
  const list = raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [id, login] = p.split(':');
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0 || !login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) {
      throw new Error(`ADMIN_GITHUB_USERS: неверная запись «${p}»`);
    }
    return { id: n, login };
  });
  if (!list.length) throw new Error('ADMIN_GITHUB_USERS пуст — войти не сможет никто');
  return list;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const key = Buffer.from(need(env, 'SESSION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('SESSION_KEY должен быть 32 байта в base64 (openssl rand -base64 32)');
  const origin = need(env, 'ADMIN_ORIGIN');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin) && env.ADMIN_DEV !== '1') throw new Error('ADMIN_ORIGIN должен быть https://домен без слэша в конце');
  return {
    origin,
    siteUrl: env.SITE_URL ?? 'https://permstandup.ru',
    repo: { owner: need(env, 'REPO_OWNER'), name: need(env, 'REPO_NAME'), branch: env.REPO_BRANCH ?? 'main' },
    github: {
      appId: need(env, 'GITHUB_APP_ID'),
      privateKey: need(env, 'GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
      installationId: need(env, 'GITHUB_INSTALLATION_ID'),
      clientId: need(env, 'GITHUB_CLIENT_ID'),
      clientSecret: need(env, 'GITHUB_CLIENT_SECRET'),
    },
    admins: parseAdmins(need(env, 'ADMIN_GITHUB_USERS')),
    sessionKey: key,
    sessionHours: Math.min(Math.max(Number(env.SESSION_HOURS ?? 24), 1), 168),
    require2fa: env.REQUIRE_2FA !== '0',
  };
}
