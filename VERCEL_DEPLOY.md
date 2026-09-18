# Публикация Pathwise на Vercel

Проект уже подготовлен к Vercel. Переменные окружения и внешняя база данных сейчас не нужны.

## 1. Передайте проект в GitHub

В Lovable откройте меню **+** рядом с полем сообщения:

1. Выберите **GitHub** → **Connect project**.
2. Авторизуйте Lovable GitHub App.
3. Выберите свой аккаунт или организацию.
4. Нажмите **Create Repository**.

После этого изменения Lovable и GitHub будут синхронизироваться автоматически.

## 2. Импортируйте репозиторий в Vercel

1. Откройте [vercel.com/new](https://vercel.com/new).
2. Войдите через GitHub и разрешите Vercel доступ к созданному репозиторию.
3. Нажмите **Import** напротив репозитория Pathwise.
4. В форме **Configure Project** заполните:

| Поле | Значение |
| --- | --- |
| Project Name | `pathwise` или любое свободное имя |
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build Command | оставить значение из проекта: `bun run build` |
| Output Directory | не указывать |
| Install Command | оставить значение из проекта: `bun install --frozen-lockfile` |

Раздел **Environment Variables** оставьте пустым.

5. Нажмите **Deploy**.

## 3. После публикации

- Vercel выдаст адрес вида `https://pathwise.vercel.app`.
- Для своего домена откройте в проекте Vercel **Settings → Domains**, добавьте домен и выполните показанные там DNS-инструкции.
- Каждый следующий push в основную ветку GitHub автоматически обновит production-сайт.
- Другие ветки и pull request автоматически получают отдельные Preview-ссылки.

## Если Vercel показывает старую версию

Откройте **Deployments**, выберите последний deployment и нажмите **Redeploy**. Для обычных обновлений это не требуется: синхронизация GitHub запускает deployment автоматически.