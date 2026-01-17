"""
Тест стартового капитала после изменений
Проверяет, что все игроки получают 2500 монет
"""
from game_engine import Game
from game_config import STARTING_MONEY
import database

def test_starting_money():
    """Тест стартового капитала"""
    print("\n" + "="*60)
    print("ТЕСТ СТАРТОВОГО КАПИТАЛА")
    print("="*60)
    
    # Проверяем конфигурацию
    print(f"\n1. Проверка конфигурации:")
    print(f"   STARTING_MONEY = {STARTING_MONEY}")
    if STARTING_MONEY == 2500:
        print("   ✅ Конфигурация корректна (2500 монет)")
    else:
        print(f"   ❌ Ошибка: ожидалось 2500, получено {STARTING_MONEY}")
        return False
    
    # Создаем игру и добавляем игроков
    database.init_database()
    game = Game(num_players=5, load_from_db=False)
    
    print(f"\n2. Создание игроков:")
    for i in range(5):
        player_id = f"money_test{i+1}"
        game.add_player(player_id, f"Тест {i+1}")
        player = game.get_player(player_id)
        
        if player.money == 2500:
            print(f"   ✅ Игрок {i+1}: {player.money} монет")
        else:
            print(f"   ❌ Игрок {i+1}: ожидалось 2500, получено {player.money}")
            return False
    
    # Проверяем загрузку из БД
    print(f"\n3. Проверка загрузки из БД:")
    game.save_to_database()
    
    # Загружаем игру заново
    game_id = game.game_id
    loaded_game = Game(num_players=5, game_id=game_id, load_from_db=True)
    
    for i in range(5):
        player_id = f"money_test{i+1}"
        player = loaded_game.get_player(player_id)
        
        if player and player.money == 2500:
            print(f"   ✅ Игрок {i+1} загружен: {player.money} монет")
        else:
            print(f"   ❌ Игрок {i+1}: ошибка загрузки или неправильная сумма")
            return False
    
    print(f"\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ")
    print(f"   Все игроки получают {STARTING_MONEY} монет при создании")
    return True

if __name__ == "__main__":
    success = test_starting_money()
    exit(0 if success else 1)

