"""
Мониторинг и метрики приложения
Health checks, метрики производительности, состояние БД
"""
import time
import asyncio
from typing import Dict, Optional, Any
from datetime import datetime
from logging_config import api_logger, database_logger
import database
from db_config import is_postgresql, is_sqlite

# Опциональный импорт psutil для системных метрик
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    api_logger.warning("psutil не установлен, системные метрики будут недоступны")

# Глобальные метрики
_metrics = {
    "requests_total": 0,
    "requests_by_endpoint": {},
    "requests_by_status": {},
    "response_times": [],
    "errors_total": 0,
    "errors_by_type": {},
    "active_games": 0,
    "websocket_connections": 0,
    "start_time": datetime.now().isoformat(),
}

def record_request(endpoint: str, method: str, status_code: int, duration_ms: float):
    """Записать метрику запроса"""
    _metrics["requests_total"] += 1
    
    # Метрики по эндпоинтам
    endpoint_key = f"{method} {endpoint}"
    _metrics["requests_by_endpoint"][endpoint_key] = _metrics["requests_by_endpoint"].get(endpoint_key, 0) + 1
    
    # Метрики по статусам
    status_group = f"{status_code // 100}xx"
    _metrics["requests_by_status"][status_group] = _metrics["requests_by_status"].get(status_group, 0) + 1
    
    # Время ответа (храним последние 1000)
    _metrics["response_times"].append(duration_ms)
    if len(_metrics["response_times"]) > 1000:
        _metrics["response_times"] = _metrics["response_times"][-1000:]
    
    # Ошибки
    if status_code >= 400:
        _metrics["errors_total"] += 1
        error_type = "client_error" if 400 <= status_code < 500 else "server_error"
        _metrics["errors_by_type"][error_type] = _metrics["errors_by_type"].get(error_type, 0) + 1

def record_error(error_type: str, error_message: str):
    """Записать метрику ошибки"""
    _metrics["errors_total"] += 1
    _metrics["errors_by_type"][error_type] = _metrics["errors_by_type"].get(error_type, 0) + 1

def update_active_games(count: int):
    """Обновить количество активных игр"""
    _metrics["active_games"] = count

def update_websocket_connections(count: int):
    """Обновить количество WebSocket подключений"""
    _metrics["websocket_connections"] = count

def get_metrics() -> Dict[str, Any]:
    """Получить все метрики"""
    # Вычисляем статистику времени ответа
    response_times = _metrics["response_times"]
    response_stats = {}
    if response_times:
        response_stats = {
            "min": min(response_times),
            "max": max(response_times),
            "avg": sum(response_times) / len(response_times),
            "p50": sorted(response_times)[len(response_times) // 2] if response_times else 0,
            "p95": sorted(response_times)[int(len(response_times) * 0.95)] if response_times else 0,
            "p99": sorted(response_times)[int(len(response_times) * 0.99)] if response_times else 0,
        }
    
    # Вычисляем uptime
    start_time = datetime.fromisoformat(_metrics["start_time"])
    uptime_seconds = (datetime.now() - start_time).total_seconds()
    
    return {
        "requests": {
            "total": _metrics["requests_total"],
            "by_endpoint": _metrics["requests_by_endpoint"].copy(),
            "by_status": _metrics["requests_by_status"].copy(),
            "response_time_stats": response_stats,
        },
        "errors": {
            "total": _metrics["errors_total"],
            "by_type": _metrics["errors_by_type"].copy(),
        },
        "application": {
            "active_games": _metrics["active_games"],
            "websocket_connections": _metrics["websocket_connections"],
            "uptime_seconds": uptime_seconds,
            "start_time": _metrics["start_time"],
        },
        "system": get_system_metrics(),
    }

def get_system_metrics() -> Dict[str, Any]:
    """Получить системные метрики"""
    if not HAS_PSUTIL:
        return {
            "cpu_percent": 0,
            "memory_mb": 0,
            "memory_percent": 0,
            "threads": 0,
            "open_files": 0,
            "note": "psutil not installed"
        }
    
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        
        return {
            "cpu_percent": process.cpu_percent(interval=0.1),
            "memory_mb": memory_info.rss / 1024 / 1024,
            "memory_percent": process.memory_percent(),
            "threads": process.num_threads(),
            "open_files": len(process.open_files()),
        }
    except Exception as e:
        api_logger.warning(f"Ошибка получения системных метрик: {e}")
        return {
            "cpu_percent": 0,
            "memory_mb": 0,
            "memory_percent": 0,
            "threads": 0,
            "open_files": 0,
        }

async def check_database_health() -> Dict[str, Any]:
    """Проверить состояние базы данных"""
    health = {
        "status": "unknown",
        "type": "unknown",
        "response_time_ms": 0,
        "pool_size": 0,
        "error": None,
    }
    
    try:
        start_time = time.time()
        
        if is_postgresql():
            health["type"] = "postgresql"
            pool = await database.init_pool()
            if pool:
                async with pool.acquire() as conn:
                    # Простой запрос для проверки
                    await conn.fetchval("SELECT 1")
                    health["status"] = "healthy"
                    health["pool_size"] = pool.get_size()
                    health["idle_size"] = pool.get_idle_size()
            else:
                health["status"] = "unhealthy"
                health["error"] = "Pool не инициализирован"
        
        elif is_sqlite():
            health["type"] = "sqlite"
            from db_config import get_sqlite_path
            import aiosqlite
            async with aiosqlite.connect(get_sqlite_path()) as conn:
                await conn.execute("SELECT 1")
                health["status"] = "healthy"
        else:
            health["status"] = "unhealthy"
            health["error"] = "Тип БД не определен"
        
        health["response_time_ms"] = (time.time() - start_time) * 1000
        
    except Exception as e:
        health["status"] = "unhealthy"
        health["error"] = str(e)
        database_logger.error(f"Ошибка проверки здоровья БД: {e}", exc_info=True)
    
    return health

async def get_health_status() -> Dict[str, Any]:
    """Получить общий статус здоровья приложения"""
    db_health = await check_database_health()
    
    # Определяем общий статус
    overall_status = "healthy"
    if db_health["status"] != "healthy":
        overall_status = "unhealthy"
    
    # Проверяем системные ресурсы
    system_metrics = get_system_metrics()
    if system_metrics["memory_percent"] > 90:
        overall_status = "degraded"
    if system_metrics["cpu_percent"] > 95:
        overall_status = "degraded"
    
    return {
        "status": overall_status,
        "timestamp": datetime.now().isoformat(),
        "database": db_health,
        "system": system_metrics,
        "application": {
            "uptime_seconds": (datetime.now() - datetime.fromisoformat(_metrics["start_time"])).total_seconds(),
        },
    }

def reset_metrics():
    """Сбросить метрики (для тестирования)"""
    global _metrics
    _metrics = {
        "requests_total": 0,
        "requests_by_endpoint": {},
        "requests_by_status": {},
        "response_times": [],
        "errors_total": 0,
        "errors_by_type": {},
        "active_games": 0,
        "websocket_connections": 0,
        "start_time": datetime.now().isoformat(),
    }
