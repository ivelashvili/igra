"""
Модуль для работы с базой данных
Использует SQLite как единый источник истины для состояния игры
"""
import sqlite3
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from contextlib import contextmanager
import os

# Путь к базе данных
DB_PATH = "royal_exchange.db"

@contextmanager
def get_db_connection():
    """Контекстный менеджер для работы с БД"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Для доступа к колонкам по имени
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_database():
    """Инициализация базы данных - создание всех таблиц"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Таблица игр
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                num_players INTEGER NOT NULL,
                current_round INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Таблица игроков
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                character_name TEXT,
                character_image TEXT,
                money REAL NOT NULL DEFAULT 2500,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        """)
        
        # Таблица ресурсов игроков
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS player_resources (
                player_id TEXT NOT NULL,
                resource_name TEXT NOT NULL,
                amount INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (player_id, resource_name),
                FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
            )
        """)
        
        # Таблица объектов игроков
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS buildings (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                started_round INTEGER NOT NULL,
                completed_round INTEGER NOT NULL,
                status TEXT NOT NULL,
                sale_round INTEGER,
                sale_price REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        """)
        
        # Таблица цен на ресурсы (история)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS resource_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                round_number INTEGER NOT NULL,
                resource_name TEXT NOT NULL,
                price REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id),
                UNIQUE(game_id, round_number, resource_name)
            )
        """)
        
        # Таблица текущих цен (для быстрого доступа)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS current_prices (
                game_id INTEGER NOT NULL,
                resource_name TEXT NOT NULL,
                price REAL NOT NULL,
                PRIMARY KEY (game_id, resource_name),
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        """)
        
        # Таблица событий раундов
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS round_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                round_number INTEGER NOT NULL,
                positive_event TEXT,
                negative_event TEXT,
                positive2_event TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id),
                UNIQUE(game_id, round_number)
            )
        """)
        
        # Таблица действий игроков (для расчета спроса/предложения)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS player_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                round_number INTEGER NOT NULL,
                player_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                resource_name TEXT NOT NULL,
                amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id),
                FOREIGN KEY (player_id) REFERENCES players(id)
            )
        """)
        
        # Таблица версии игры (для оптимистичных блокировок)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS game_version (
                game_id INTEGER PRIMARY KEY,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        """)
        
        # Таблица снимков состояния игры (для отката раундов)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS game_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                round_number INTEGER NOT NULL,
                snapshot_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id),
                UNIQUE(game_id, round_number)
            )
        """)
        
        # Индексы для ускорения запросов
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_buildings_player_id ON buildings(player_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_buildings_game_id ON buildings(game_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_resource_prices_game_round ON resource_prices(game_id, round_number)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_actions_game_round ON player_actions(game_id, round_number)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_snapshots_game_round ON game_snapshots(game_id, round_number)")
        
        conn.commit()

def create_game(num_players: int) -> int:
    """Создать новую игру в БД"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO games (num_players, current_round, status)
            VALUES (?, ?, 'active')
        """, (num_players, 1))
        game_id = cursor.lastrowid
        
        # Создаем запись версии
        cursor.execute("""
            INSERT INTO game_version (game_id, version)
            VALUES (?, 1)
        """, (game_id,))
        
        return game_id

def get_active_game_id() -> Optional[int]:
    """Получить ID активной игры"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM games WHERE status = 'active' ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        return row['id'] if row else None

def save_game_state(game_id: int, current_round: int):
    """Сохранить состояние игры"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE games 
            SET current_round = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (current_round, game_id))
        
        # Увеличиваем версию
        cursor.execute("""
            UPDATE game_version 
            SET version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE game_id = ?
        """, (game_id,))

def save_player(player_id: str, game_id: int, name: str, character_name: Optional[str] = None, 
                character_image: Optional[str] = None, money: float = 2500):
    """Сохранить/обновить игрока"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO players 
            (id, game_id, name, character_name, character_image, money)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (player_id, game_id, name, character_name, character_image, money))

def save_player_resources(player_id: str, resources: Dict[str, int]):
    """Сохранить ресурсы игрока"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Удаляем старые ресурсы
        cursor.execute("DELETE FROM player_resources WHERE player_id = ?", (player_id,))
        # Вставляем новые
        for resource_name, amount in resources.items():
            if amount > 0:  # Сохраняем только ненулевые ресурсы
                cursor.execute("""
                    INSERT INTO player_resources (player_id, resource_name, amount)
                    VALUES (?, ?, ?)
                """, (player_id, resource_name, amount))

def save_building(building_id: str, player_id: str, game_id: int, name: str, 
                  started_round: int, completed_round: int, status: str,
                  sale_round: Optional[int] = None, sale_price: Optional[float] = None):
    """Сохранить/обновить объект"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO buildings 
            (id, player_id, game_id, name, started_round, completed_round, status, sale_round, sale_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (building_id, player_id, game_id, name, started_round, completed_round, status, sale_round, sale_price))

def delete_building(building_id: str):
    """Удалить объект"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM buildings WHERE id = ?", (building_id,))

def save_current_prices(game_id: int, prices: Dict[str, float]):
    """Сохранить текущие цены"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Удаляем старые цены
        cursor.execute("DELETE FROM current_prices WHERE game_id = ?", (game_id,))
        # Вставляем новые
        for resource_name, price in prices.items():
            cursor.execute("""
                INSERT INTO current_prices (game_id, resource_name, price)
                VALUES (?, ?, ?)
            """, (game_id, resource_name, price))

def save_round_prices(game_id: int, round_number: int, prices: Dict[str, float]):
    """Сохранить цены для конкретного раунда (история)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for resource_name, price in prices.items():
            cursor.execute("""
                INSERT OR REPLACE INTO resource_prices 
                (game_id, round_number, resource_name, price)
                VALUES (?, ?, ?, ?)
            """, (game_id, round_number, resource_name, price))

def save_round_events(game_id: int, round_number: int, events: Dict):
    """Сохранить события раунда"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO round_events 
            (game_id, round_number, positive_event, negative_event, positive2_event)
            VALUES (?, ?, ?, ?, ?)
        """, (game_id, round_number, 
              events.get('positive'), events.get('negative'), events.get('positive2')))

def save_player_action(game_id: int, round_number: int, player_id: str, 
                       action_type: str, resource_name: str, amount: int):
    """Сохранить действие игрока"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO player_actions 
            (game_id, round_number, player_id, action_type, resource_name, amount)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (game_id, round_number, player_id, action_type, resource_name, amount))

def clear_round_actions(game_id: int, round_number: int):
    """Очистить действия для раунда (перед новым раундом)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM player_actions 
            WHERE game_id = ? AND round_number = ?
        """, (game_id, round_number))

# ========== МЕТОДЫ ЗАГРУЗКИ ==========

def load_game(game_id: int) -> Optional[Dict]:
    """Загрузить информацию об игре"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

def load_all_players(game_id: int) -> List[Dict]:
    """Загрузить всех игроков игры"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM players WHERE game_id = ?", (game_id,))
        return [dict(row) for row in cursor.fetchall()]

def load_player_resources(player_id: str) -> Dict[str, int]:
    """Загрузить ресурсы игрока"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT resource_name, amount FROM player_resources WHERE player_id = ?", (player_id,))
        return {row['resource_name']: row['amount'] for row in cursor.fetchall()}

def load_player_buildings(player_id: str, game_id: int) -> List[Dict]:
    """Загрузить объекты игрока для конкретной игры"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM buildings WHERE player_id = ? AND game_id = ?", (player_id, game_id))
        return [dict(row) for row in cursor.fetchall()]

def load_current_prices(game_id: int) -> Dict[str, float]:
    """Загрузить текущие цены"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT resource_name, price FROM current_prices WHERE game_id = ?", (game_id,))
        return {row['resource_name']: row['price'] for row in cursor.fetchall()}

def load_round_prices(game_id: int, round_number: int) -> Optional[Dict[str, float]]:
    """Загрузить цены для конкретного раунда"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT resource_name, price 
            FROM resource_prices 
            WHERE game_id = ? AND round_number = ?
        """, (game_id, round_number))
        rows = cursor.fetchall()
        if rows:
            return {row['resource_name']: row['price'] for row in rows}
        return None

def load_round_events(game_id: int, round_number: int) -> Optional[Dict]:
    """Загрузить события раунда"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT positive_event, negative_event, positive2_event 
            FROM round_events 
            WHERE game_id = ? AND round_number = ?
        """, (game_id, round_number))
        row = cursor.fetchone()
        if row:
            return {
                'positive': row['positive_event'],
                'negative': row['negative_event'],
                'positive2': row['positive2_event']
            }
        return None

def load_round_actions(game_id: int, round_number: int) -> Tuple[Dict[str, int], Dict[str, int]]:
    """Загрузить действия игроков для расчета спроса/предложения"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT action_type, resource_name, COUNT(DISTINCT player_id) as player_count
            FROM player_actions
            WHERE game_id = ? AND round_number = ?
            GROUP BY action_type, resource_name
        """, (game_id, round_number))
        
        players_bought = {}
        players_sold = {}
        
        for row in cursor.fetchall():
            resource = row['resource_name']
            count = row['player_count']
            if row['action_type'] == 'buy':
                players_bought[resource] = count
            elif row['action_type'] == 'sell':
                players_sold[resource] = count
        
        return players_bought, players_sold

def save_game_snapshot(game_id: int, round_number: int, snapshot_data: Dict):
    """Сохранить снимок состояния игры"""
    import json
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO game_snapshots 
            (game_id, round_number, snapshot_data)
            VALUES (?, ?, ?)
        """, (game_id, round_number, json.dumps(snapshot_data, ensure_ascii=False)))

def load_game_snapshot(game_id: int, round_number: int) -> Optional[Dict]:
    """Загрузить снимок состояния игры"""
    import json
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT snapshot_data 
            FROM game_snapshots 
            WHERE game_id = ? AND round_number = ?
        """, (game_id, round_number))
        row = cursor.fetchone()
        if row:
            return json.loads(row['snapshot_data'])
        return None

def get_available_snapshots(game_id: int) -> List[int]:
    """Получить список доступных раундов со снимками"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT round_number 
            FROM game_snapshots 
            WHERE game_id = ? 
            ORDER BY round_number DESC
        """, (game_id,))
        return [row['round_number'] for row in cursor.fetchall()]

def get_game_version(game_id: int) -> int:
    """Получить версию игры (для оптимистичных блокировок)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT version FROM game_version WHERE game_id = ?", (game_id,))
        row = cursor.fetchone()
        return row['version'] if row else 1

