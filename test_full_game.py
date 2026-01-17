"""
Тестовый скрипт для полноценного тестирования игры
Создает игру с несколькими игроками для тестирования через miniapp_test
"""
import uvicorn
from web_server import app, set_game, update_capitalization_history
from game_engine import Game
import database

def create_test_game_for_full_test():
    """Создает тестовую игру для полноценного тестирования"""
    # Инициализируем БД
    database.init_database()
    
    # Создаем новую игру с 5 игроками
    game = Game(num_players=5, load_from_db=False)
    
    # Добавляем игроков БЕЗ персонажей - они выберут сами через интерфейс
    # Используем ID вида tg_10001, tg_10002 и т.д. для совместимости с miniapp_test.html
    for i in range(5):
        player_id = f"tg_{10001 + i}"  # 10001, 10002, 10003, 10004, 10005
        player_name = f"Игрок {i+1}"
        game.add_player(player_id, player_name)
        # Персонажи НЕ назначаются - игроки выберут сами
    
    # Сохраняем игру
    game.save_to_database()
    
    # Инициализируем историю капитализации
    set_game(game)
    update_capitalization_history()
    
    print(f"\nИгра создана! Текущий раунд: {game.current_round}")
    print("Игроки:")
    leaderboard = game.get_leaderboard()
    for idx, player in enumerate(leaderboard, 1):
        p = game.get_player(player["player_id"])
        char_name = getattr(p, 'character_name', 'Без персонажа') if p else 'Не найден'
        print(f"  {idx}. {char_name} ({player['player_id']}): {int(player['total_value'])} монет")
    
    return game

if __name__ == "__main__":
    # Создаем тестовую игру
    game = create_test_game_for_full_test()
    
    print("\n" + "="*60)
    print("🎮 ТЕСТОВЫЙ СЕРВЕР ДЛЯ ПОЛНОЦЕННОГО ТЕСТИРОВАНИЯ")
    print("="*60)
    print("\n📱 Тестовые страницы Mini App для игроков:")
    print("   http://localhost:8000/miniapp_test?player=1")
    print("   http://localhost:8000/miniapp_test?player=2")
    print("   http://localhost:8000/miniapp_test?player=3")
    print("   http://localhost:8000/miniapp_test?player=4")
    print("   http://localhost:8000/miniapp_test?player=5")
    print("\n🌐 Основная страница (проектор):")
    print("   http://localhost:8000")
    print("\n💡 Управление игрой:")
    print("   - Используйте веб-интерфейс для управления раундами")
    print("   - Игроки управляются через miniapp_test")
    print("   - Все изменения сохраняются в базу данных")
    print("\n" + "="*60 + "\n")
    
    # Запускаем веб-сервер
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
