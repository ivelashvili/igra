# Инструкция по загрузке видео на сервер

## ⚠️ ВАЖНО: Видео не включены в Git репозиторий

Видео файлы слишком большие для GitHub (>100MB), поэтому они исключены из репозитория через `.gitignore`.

## Необходимые видео файлы:

1. `static/videos/Введение.mp4`
2. `static/videos/Раунд 1.mp4`
3. `static/videos/Раунд 2.mp4`
4. `static/videos/Раунд 3.mp4`
5. `static/videos/Раунд 4.mp4`
6. `static/videos/Раунд 5.mp4`
7. `static/videos/Раунд 6.mp4`
8. `static/videos/Раунд 7.mp4`
9. `static/videos/Раунд 8.mp4`
10. `static/videos/Раунд 9.mp4`
11. `static/videos/Раунд 10.mp4`

## Способы загрузки на Railway:

### Способ 1: Через Railway CLI (рекомендуется)

1. Установите Railway CLI: https://docs.railway.app/develop/cli
2. Войдите: `railway login`
3. Подключитесь к проекту: `railway link`
4. Загрузите видео:
   ```bash
   cd "/Users/ivelashvili/Desktop/Пректы курсора/игра"
   railway up static/videos/
   ```

### Способ 2: Через SSH (если доступен)

1. Получите SSH доступ к контейнеру через Railway Dashboard
2. Создайте папку: `mkdir -p static/videos`
3. Загрузите файлы через SCP или SFTP

### Способ 3: Через Railway Volume (постоянное хранилище)

1. В Railway Dashboard создайте Volume
2. Подключите его к сервису
3. Смонтируйте в `/app/static/videos`
4. Загрузите файлы через CLI или SSH

### Способ 4: Через внешнее хранилище (S3, Cloudflare R2)

1. Загрузите видео в облачное хранилище
2. Обновите пути в `static/script.js`:
   ```javascript
   const videoPath = `https://ваш-домен.com/videos/${encodedFilename}`;
   ```

## Проверка после загрузки:

1. Откройте веб-интерфейс: `https://ваш-домен.railway.app`
2. Проверьте, что видео загружаются:
   - Введение должно проигрываться при первом открытии
   - Видео раундов должны проигрываться при переходе к раундам
3. Проверьте консоль браузера (F12) на наличие ошибок 404

## Текущие пути к видео в коде:

- `static/script.js` строка 914: `/static/videos/${encodedFilename}`
- Видео должны быть доступны по URL: `https://ваш-домен.railway.app/static/videos/Введение.mp4`

## Размеры файлов (для справки):

- Введение.mp4: ~53.70 MB
- Раунд 1.mp4: ~66.95 MB
- Раунд 2.mp4: ~75.64 MB
- Раунд 3.mp4: ~65.61 MB
- Раунд 4.mp4: ~71.95 MB
- Раунд 5.mp4: ~61.10 MB
- Раунд 6.mp4: ~79.36 MB
- Раунд 7.mp4: ~67.72 MB
- Раунд 8.mp4: ~81.29 MB
- Раунд 9.mp4: ~119.43 MB ⚠️
- Раунд 10.mp4: ~123.63 MB ⚠️

**Общий размер: ~886 MB**

