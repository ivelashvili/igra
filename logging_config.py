"""
Конфигурация логирования для приложения
Настройка структурированного логирования с разными уровнями и форматами
"""
import logging
import logging.handlers
import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# Определяем директорию для логов
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# Определяем формат логирования (JSON для production, читаемый для dev)
LOG_FORMAT = os.getenv("LOG_FORMAT", "readable")  # "json" или "readable"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

class JSONFormatter(logging.Formatter):
    """Форматтер для JSON логов (удобно для production и парсинга)"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Добавляем дополнительные поля, если они есть
        if hasattr(record, "game_code"):
            log_data["game_code"] = record.game_code
        if hasattr(record, "player_id"):
            log_data["player_id"] = record.player_id
        if hasattr(record, "ip_address"):
            log_data["ip_address"] = record.ip_address
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "error_type"):
            log_data["error_type"] = record.error_type
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, ensure_ascii=False)

class ReadableFormatter(logging.Formatter):
    """Читаемый форматтер для разработки"""
    
    def __init__(self):
        super().__init__(
            fmt="%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    def format(self, record: logging.LogRecord) -> str:
        # Добавляем дополнительные поля в сообщение
        message = super().format(record)
        
        # Добавляем контекстную информацию
        context_parts = []
        if hasattr(record, "game_code"):
            context_parts.append(f"game_code={record.game_code}")
        if hasattr(record, "player_id"):
            context_parts.append(f"player_id={record.player_id}")
        if hasattr(record, "ip_address"):
            context_parts.append(f"ip={record.ip_address}")
        if hasattr(record, "endpoint"):
            context_parts.append(f"endpoint={record.endpoint}")
        if hasattr(record, "status_code"):
            context_parts.append(f"status={record.status_code}")
        if hasattr(record, "duration_ms"):
            context_parts.append(f"duration={record.duration_ms}ms")
        
        if context_parts:
            message += f" | {' | '.join(context_parts)}"
        
        return message

def setup_logging(log_format: Optional[str] = None, log_level: Optional[str] = None):
    """
    Настройка логирования для всего приложения
    
    Args:
        log_format: "json" или "readable" (по умолчанию из LOG_FORMAT env)
        log_level: Уровень логирования (по умолчанию из LOG_LEVEL env)
    """
    format_type = log_format or LOG_FORMAT
    level = log_level or LOG_LEVEL
    
    # Выбираем форматтер
    if format_type == "json":
        formatter = JSONFormatter()
    else:
        formatter = ReadableFormatter()
    
    # Настройка root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level, logging.INFO))
    
    # Удаляем существующие handlers
    root_logger.handlers.clear()
    
    # Console handler (всегда)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, level, logging.INFO))
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # File handler для всех логов (с ротацией)
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "app.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)  # В файл пишем все
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    
    # Отдельный файл для ошибок
    error_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "errors.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=10,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    root_logger.addHandler(error_handler)
    
    # Настройка уровней для внешних библиотек
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("fastapi").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    
    logging.info(f"Логирование настроено: формат={format_type}, уровень={level}")

def get_logger(name: str) -> logging.Logger:
    """
    Получить логгер для конкретного модуля
    
    Args:
        name: Имя модуля (обычно __name__)
        
    Returns:
        Настроенный логгер
    """
    return logging.getLogger(name)

# Создаем логгеры для разных компонентов
api_logger = get_logger("api")
security_logger = get_logger("security")
database_logger = get_logger("database")
game_logger = get_logger("game")
