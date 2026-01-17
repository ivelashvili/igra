"""
Запуск веб-сервера
"""
import os
import uvicorn
from web_server import app
import database

if __name__ == "__main__":
    # Инициализируем БД (если еще не инициализирована)
    database.init_database()
    
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

