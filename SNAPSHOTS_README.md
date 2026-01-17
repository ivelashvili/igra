# Система снимков состояния игры

## Описание

Система снимков позволяет сохранять полное состояние игры на каждый раунд и откатываться к предыдущим раундам при необходимости.

## Как это работает

### Автоматическое создание снимков

1. **Начальный снимок (раунд 0)**: Создается автоматически при создании новой игры (состояние на начало раунда 1)
2. **Снимки раундов**: Создаются автоматически ПЕРЕД обработкой каждого раунда (в начале `process_round()`)
   - Снимок раунда N содержит состояние на начало раунда N
   - При откате на раунд N восстанавливается состояние на начало раунда N

### Что сохраняется в снимке

- Текущий раунд
- Цены на все ресурсы
- Состояние всех игроков:
  - ID, имя, деньги
  - Персонаж (имя и изображение)
  - Все ресурсы
  - Все объекты (со статусами, датами постройки, ценами продажи)

## API Endpoints

### Получить список доступных снимков

```http
GET /api/game/snapshots
```

**Ответ:**
```json
{
  "snapshots": [0, 1, 2, 3],
  "current_round": 4
}
```

### Откатить игру на предыдущий раунд

```http
POST /api/game/rollback
Content-Type: application/json

{
  "round_number": 2
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Игра откачена на раунд 2",
  "current_round": 2
}
```

**Ошибки:**
- `400`: Нельзя откатиться на раунд >= текущего
- `404`: Снимок для указанного раунда не найден

## Использование в коде

### Создание снимка вручную

```python
from game_engine import Game

game = Game(num_players=30)
snapshot = game.create_snapshot()
database.save_game_snapshot(game.game_id, round_number, snapshot)
```

### Восстановление из снимка

```python
snapshot = database.load_game_snapshot(game_id, round_number)
if snapshot:
    game.restore_from_snapshot(snapshot)
    game.save_to_database()  # Сохранить восстановленное состояние
```

### Получение списка снимков

```python
snapshots = database.get_available_snapshots(game_id)
# Возвращает список номеров раундов: [0, 1, 2, 3, ...]
```

## Пример использования

### Откат через API (curl)

```bash
# Получить список снимков
curl http://localhost:8000/api/game/snapshots

# Откатиться на раунд 2
curl -X POST http://localhost:8000/api/game/rollback \
  -H "Content-Type: application/json" \
  -d '{"round_number": 2}'
```

### Откат в Python

```python
import database
from game_engine import Game

# Загружаем игру
game_id = database.get_active_game_id()
game = Game(num_players=30, game_id=game_id, load_from_db=True)

# Откатываемся на раунд 2
snapshot = database.load_game_snapshot(game.game_id, 2)
if snapshot:
    game.restore_from_snapshot(snapshot)
    game.save_to_database()
    print(f"Игра откачена на раунд {game.current_round}")
```

## Производительность

- **Создание снимка**: ~50-150ms (в зависимости от количества игроков)
- **Восстановление**: ~50-150ms
- **Размер снимка**: ~5-20 KB на раунд (для 30 игроков)

## Важные замечания

1. **Откат удаляет все данные после указанного раунда**: Если откатиться на раунд 2, все данные раундов 3, 4, 5 и т.д. будут потеряны
2. **Снимки создаются ПЕРЕД обработкой раунда**: Снимок раунда N создается в начале обработки раунда N и содержит состояние на начало раунда N
3. **Начальный снимок (раунд 0)**: Содержит состояние игры на начало раунда 1 (после создания игры, но до обработки первого раунда)
4. **Автоматическое сохранение**: После восстановления из снимка нужно вызвать `save_to_database()` для сохранения состояния
5. **Логика отката**: При откате на раунд N восстанавливается состояние на начало раунда N, и можно продолжить игру с этого момента

## Структура БД

Таблица `game_snapshots`:
- `id`: Уникальный ID снимка
- `game_id`: ID игры
- `round_number`: Номер раунда
- `snapshot_data`: JSON с полным состоянием игры
- `created_at`: Время создания снимка

## Очистка старых снимков

Если нужно удалить старые снимки:

```python
import database

with database.get_db_connection() as conn:
    cursor = conn.cursor()
    # Удалить снимки старше раунда 5
    cursor.execute("DELETE FROM game_snapshots WHERE game_id = ? AND round_number < ?", 
                   (game_id, 5))
    conn.commit()
```

