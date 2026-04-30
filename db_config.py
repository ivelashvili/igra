"""
Конфигурация базы данных
Поддерживает PostgreSQL и SQLite (для обратной совместимости)
"""
import os
from typing import Optional
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# URL базы данных из переменной окружения
DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")

# Если DATABASE_URL не задан, используем SQLite по умолчанию
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///royal_exchange.db"

# Определяем тип БД по URL
def is_postgresql() -> bool:
    """Проверяет, используется ли PostgreSQL"""
    return DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

def is_sqlite() -> bool:
    """Проверяет, используется ли SQLite"""
    return DATABASE_URL.startswith("sqlite://")

def get_postgresql_dsn() -> str:
    """Получает DSN для asyncpg из PostgreSQL URL"""
    if not is_postgresql():
        raise ValueError("Not a PostgreSQL database URL")
    
    # Преобразуем postgresql://user:pass@host:port/db в формат для asyncpg
    # asyncpg использует формат: postgresql://user:password@host:port/database
    # Но может потребоваться преобразование
    url = DATABASE_URL
    
    # Если уже в правильном формате, возвращаем
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        # Заменяем postgres:// на postgresql:// для asyncpg
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url
    
    return url

def get_sqlite_path() -> str:
    """Получает путь к SQLite файлу"""
    if not is_sqlite():
        raise ValueError("Not a SQLite database URL")
    
    # Убираем префикс sqlite:///
    path = DATABASE_URL.replace("sqlite:///", "")
    return path

# Настройки пула соединений для PostgreSQL
DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "5"))
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "20"))
