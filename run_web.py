"""
Запуск веб-сервера
"""
import os
import uvicorn
from dotenv import load_dotenv
from logging_config import setup_logging

# Загружаем переменные окружения из .env
load_dotenv()

from web_server import app

if __name__ == "__main__":
    # Настройка логирования (должна быть первой)
    setup_logging()
    
    # Инициализация БД происходит в startup event web_server.py
    # Игра будет загружена автоматически при старте сервера (в startup event)
    # или создана при первом запросе
    
    # Запускаем сервер
    # Railway передает порт через переменную окружения PORT
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

