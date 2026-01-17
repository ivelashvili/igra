"""
Тестовый скрипт для Mini App
Создает тестовую игру и запускает веб-сервер для тестирования Mini App
"""
import uvicorn
from web_server import app, set_game
from game_engine import Game

def create_test_game():
    """Создает тестовую игру для Mini App"""
    game = Game(num_players=30)
    
    # Добавляем тестового игрока
    game.add_player("tg_12345", "Тестовый Игрок")
    test_player = game.get_player("tg_12345")
    if test_player:
        test_player.nickname = "Тестовый Игрок"
        test_player.photo_url = "https://via.placeholder.com/200"
        # Даем немного ресурсов для тестирования
        test_player.add_resource("дерево", 10)
        test_player.add_resource("камень", 10)
        test_player.add_resource("железо", 5)
        test_player.money = 2000  # Больше денег для тестирования
    
    # Добавляем еще несколько игроков для реалистичности
    for i in range(2, 6):
        game.add_player(f"player{i}", f"Игрок {i}")
    
    # Раунд 1: Игроки совершают действия
    print("Раунд 1: Игроки совершают действия...")
    
    # Тестовый игрок строит Лесоповал
    if test_player:
        game.buy_resource("tg_12345", "железо", 5)
        game.buy_resource("tg_12345", "рабы", 3)
        game.start_building("tg_12345", "Лесоповал")
    
    # Другие игроки тоже действуют
    game.buy_resource("player2", "дерево", 10)
    game.buy_resource("player2", "железо", 5)
    game.buy_resource("player2", "рабы", 3)
    game.start_building("player2", "Каменоломня")
    
    # Обрабатываем раунд 1
    game.process_round()
    print("Раунд 1 завершен")
    
    return game

if __name__ == "__main__":
    # Создаем тестовую игру
    game = create_test_game()
    set_game(game)
    
    print("\n" + "="*60)
    print("🧪 ТЕСТОВЫЙ СЕРВЕР ДЛЯ MINI APP")
    print("="*60)
    print("\n📱 Тестовая страница Mini App:")
    print("   http://localhost:8000/miniapp_test")
    print("\n🌐 Основная страница (проектор):")
    print("   http://localhost:8000")
    print("\n💡 В тестовом режиме доступны:")
    print("   - Имитация Telegram WebApp API")
    print("   - Тестовая панель с кнопками управления")
    print("   - Возможность сброса и изменения данных")
    print("\n" + "="*60 + "\n")
    
    # Запускаем веб-сервер
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

