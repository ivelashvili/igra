"""
Тестовый скрипт для просмотра страницы итогов
Создает игру с 5 игроками, прогоняет несколько раундов
"""
import uvicorn
from web_server import app, set_game
from game_engine import Game
import database

def create_test_game_with_5_players():
    """Создает тестовую игру с 5 игроками"""
    # Инициализируем БД
    database.init_database()
    
    # Создаем новую игру с 5 игроками
    game = Game(num_players=5, load_from_db=False)
    
    # Список персонажей для тестирования
    characters = [
        {"name": "Алексей Пермский", "image": "Алексей Пермский.png"},
        {"name": "Анастасия Барабинская", "image": "Анастасия Барабинская.png"},
        {"name": "Арсений Жестокий", "image": "Арсений Жестокий.png"},
        {"name": "Виктория Мудрая", "image": "Виктория Мудрая.png"},
        {"name": "Кирилл Великолепный", "image": "Кирилл Великолепный.png"},
    ]
    
    # Добавляем игроков с персонажами
    for i in range(5):
        player_id = f"player{i+1}"
        player_name = f"Игрок {i+1}"
        game.add_player(player_id, player_name)
        
        player = game.get_player(player_id)
        if player and i < len(characters):
            player.character_name = characters[i]["name"]
            player.character_image = characters[i]["image"]
    
    # Раунд 1: Игроки покупают ресурсы и строят объекты
    print("Раунд 1: Игроки совершают действия...")
    
    # Игрок 1 строит Лесоповал
    game.buy_resource("player1", "железо", 5)
    game.buy_resource("player1", "рабы", 3)
    game.start_building("player1", "Лесоповал")
    
    # Игрок 2 строит Каменоломню
    game.buy_resource("player2", "дерево", 10)
    game.buy_resource("player2", "железо", 5)
    game.buy_resource("player2", "рабы", 3)
    game.start_building("player2", "Каменоломня")
    
    # Игрок 3 строит Трактир
    game.buy_resource("player3", "дерево", 14)
    game.buy_resource("player3", "камень", 10)
    game.buy_resource("player3", "железо", 3)
    game.buy_resource("player3", "золото", 1)
    game.start_building("player3", "Трактир")
    
    # Игрок 4 строит Золотой рудник (самый дорогой)
    game.buy_resource("player4", "камень", 20)
    game.buy_resource("player4", "железо", 10)
    game.buy_resource("player4", "рабы", 5)
    game.buy_resource("player4", "золото", 3)
    game.start_building("player4", "Золотой рудник")
    
    # Игрок 5 покупает много ресурсов
    game.buy_resource("player5", "дерево", 20)
    game.buy_resource("player5", "камень", 15)
    game.buy_resource("player5", "железо", 10)
    
    # Обрабатываем раунд 1
    game.process_round()
    print("Раунд 1 завершен")
    
    # Раунд 2: Продолжаем действия
    print("Раунд 2: Игроки продолжают...")
    
    # Игрок 1 строит еще один объект
    game.buy_resource("player1", "дерево", 18)
    game.buy_resource("player1", "железо", 6)
    game.buy_resource("player1", "камень", 5)
    game.start_building("player1", "Рыболовня")
    
    # Игрок 2 строит Ферму
    game.buy_resource("player2", "дерево", 16)
    game.buy_resource("player2", "камень", 10)
    game.buy_resource("player2", "скот", 4)
    game.buy_resource("player2", "зерно", 8)
    game.start_building("player2", "Ферма")
    
    # Игрок 3 строит Постоялый двор
    game.buy_resource("player3", "дерево", 20)
    game.buy_resource("player3", "камень", 14)
    game.buy_resource("player3", "железо", 5)
    game.buy_resource("player3", "золото", 2)
    game.start_building("player3", "Постоялый двор")
    
    # Игрок 4 покупает еще ресурсов
    game.buy_resource("player4", "дерево", 30)
    game.buy_resource("player4", "железо", 15)
    
    # Игрок 5 строит Кузнечную
    game.buy_resource("player5", "камень", 18)
    game.buy_resource("player5", "железо", 12)
    game.buy_resource("player5", "дерево", 10)
    game.buy_resource("player5", "золото", 2)
    game.start_building("player5", "Кузнечная")
    
    # Обрабатываем раунд 2
    game.process_round()
    print("Раунд 2 завершен")
    
    # Раунд 3: Еще действия для разнообразия капитализаций
    print("Раунд 3: Игроки продолжают...")
    
    # Игрок 1 строит Куртизанские палатки
    game.buy_resource("player1", "дерево", 14)
    game.buy_resource("player1", "золото", 5)
    game.buy_resource("player1", "рабы", 5)
    game.start_building("player1", "Куртизанские палатки")
    
    # Игрок 2 строит Посевные поля
    game.buy_resource("player2", "дерево", 10)
    game.buy_resource("player2", "зерно", 12)
    game.buy_resource("player2", "рабы", 2)
    game.start_building("player2", "Посевные поля")
    
    # Игрок 3 покупает много золота
    game.buy_resource("player3", "золото", 10)
    game.buy_resource("player3", "дерево", 20)
    
    # Игрок 4 строит еще один объект
    game.buy_resource("player4", "дерево", 16)
    game.buy_resource("player4", "железо", 5)
    game.buy_resource("player4", "овощи", 8)
    game.start_building("player4", "Теплицы")
    
    # Игрок 5 строит Трактир
    game.buy_resource("player5", "дерево", 14)
    game.buy_resource("player5", "камень", 10)
    game.buy_resource("player5", "железо", 3)
    game.buy_resource("player5", "золото", 1)
    game.start_building("player5", "Трактир")
    
    # Обрабатываем раунд 3
    game.process_round()
    print("Раунд 3 завершен")
    
    # Сохраняем игру
    game.save_to_database()
    
    # Инициализируем историю капитализации
    from web_server import update_capitalization_history, set_game
    set_game(game)
    update_capitalization_history()
    
    print(f"\nИгра создана! Текущий раунд: {game.current_round}")
    print("Игроки:")
    leaderboard = game.get_leaderboard()
    for idx, player in enumerate(leaderboard, 1):
        p = game.get_player(player["player_id"])
        char_name = getattr(p, 'character_name', 'Без персонажа') if p else 'Не найден'
        print(f"  {idx}. {char_name}: {int(player['total_value'])} монет")
    
    return game

if __name__ == "__main__":
    # Создаем тестовую игру
    game = create_test_game_with_5_players()
    
    # Игра уже установлена в create_test_game_with_5_players
    # Но убедимся, что она установлена
    from web_server import set_game
    set_game(game)
    
    print("\nЗапускаем веб-сервер на http://localhost:8000")
    print("Откройте в браузере и нажмите 'Подвести итоги' или выполните в консоли: showFinalResults()")
    
    # Запускаем сервер
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

