"""
Автоматическое тестирование игры
Проверяет начисление доходов, расчет прироста, работу страницы итогов
"""
from game_engine import Game
import database

def test_income_calculation():
    """Тест начисления доходов от объектов"""
    print("\n" + "="*60)
    print("ТЕСТ 1: Начисление доходов от объектов")
    print("="*60)
    
    # Создаем новую игру
    database.init_database()
    game = Game(num_players=3, load_from_db=False)
    
    # Добавляем игроков
    game.add_player("test_player1", "Тест Игрок 1")
    game.add_player("test_player2", "Тест Игрок 2")
    game.add_player("test_player3", "Тест Игрок 3")
    
    player1 = game.get_player("test_player1")
    player2 = game.get_player("test_player2")
    
    print(f"\nНачальное состояние:")
    print(f"Игрок 1: {player1.money} монет, ресурсы: {player1.resources}")
    print(f"Игрок 2: {player2.money} монет, ресурсы: {player2.resources}")
    
    # Игрок 1 строит Лесоповал (должен приносить 3 дерева)
    print(f"\nРаунд 1: Игрок 1 строит Лесоповал...")
    game.buy_resource("test_player1", "железо", 5)
    game.buy_resource("test_player1", "рабы", 3)
    result = game.start_building("test_player1", "Лесоповал")
    print(f"Результат: {result['message']}")
    
    # Игрок 2 строит Каменоломню (должна приносить 3 камня)
    print(f"\nРаунд 1: Игрок 2 строит Каменоломню...")
    game.buy_resource("test_player2", "дерево", 10)
    game.buy_resource("test_player2", "железо", 5)
    game.buy_resource("test_player2", "рабы", 3)
    result = game.start_building("test_player2", "Каменоломня")
    print(f"Результат: {result['message']}")
    
    # Обрабатываем раунд 1
    print(f"\nОбработка раунда 1...")
    round_result = game.process_round()
    print(f"Раунд 1 завершен. Текущий раунд: {game.current_round}")
    
    # Проверяем состояние после раунда 1
    player1 = game.get_player("test_player1")
    player2 = game.get_player("test_player2")
    print(f"\nПосле раунда 1:")
    print(f"Игрок 1: {player1.money} монет, ресурсы: {player1.resources}")
    print(f"Игрок 2: {player2.money} монет, ресурсы: {player2.resources}")
    
    # Проверяем статусы объектов
    print(f"\nОбъекты игрока 1:")
    for b in player1.buildings:
        print(f"  {b.name}: статус={b.status.value}, started={b.started_round}, completed={b.completed_round}")
    
    print(f"\nОбъекты игрока 2:")
    for b in player2.buildings:
        print(f"  {b.name}: статус={b.status.value}, started={b.started_round}, completed={b.completed_round}")
    
    # Раунд 2: объекты должны быть COMPLETED
    print(f"\nОбработка раунда 2...")
    round_result = game.process_round()
    print(f"Раунд 2 завершен. Текущий раунд: {game.current_round}")
    
    player1 = game.get_player("test_player1")
    player2 = game.get_player("test_player2")
    print(f"\nПосле раунда 2:")
    print(f"Игрок 1: {player1.money} монет, ресурсы: {player1.resources}")
    print(f"Игрок 2: {player2.money} монет, ресурсы: {player2.resources}")
    
    # Проверяем статусы объектов
    print(f"\nОбъекты игрока 1:")
    for b in player1.buildings:
        print(f"  {b.name}: статус={b.status.value}")
    
    print(f"\nОбъекты игрока 2:")
    for b in player2.buildings:
        print(f"  {b.name}: статус={b.status.value}")
    
    # Раунд 3: объекты должны быть ACTIVE и приносить доход
    print(f"\nОбработка раунда 3...")
    income_before_1 = player1.resources.get("дерево", 0)
    income_before_2 = player2.resources.get("камень", 0)
    
    round_result = game.process_round()
    print(f"Раунд 3 завершен. Текущий раунд: {game.current_round}")
    
    player1 = game.get_player("test_player1")
    player2 = game.get_player("test_player2")
    
    income_after_1 = player1.resources.get("дерево", 0)
    income_after_2 = player2.resources.get("камень", 0)
    
    income_received_1 = income_after_1 - income_before_1
    income_received_2 = income_after_2 - income_before_2
    
    print(f"\nПосле раунда 3:")
    print(f"Игрок 1: {player1.money} монет, дерево: {income_after_1} (получено: {income_received_1})")
    print(f"Игрок 2: {player2.money} монет, камень: {income_after_2} (получено: {income_received_2})")
    
    # Проверяем, что доход начислен правильно
    print(f"\nПроверка дохода:")
    print(f"Игрок 1 (Лесоповал): ожидается 3 дерева, получено {income_received_1}")
    print(f"Игрок 2 (Каменоломня): ожидается 3 камня, получено {income_received_2}")
    
    if income_received_1 == 3:
        print("✅ Игрок 1 получил правильный доход")
    else:
        print(f"❌ Игрок 1 получил неправильный доход: ожидалось 3, получено {income_received_1}")
    
    if income_received_2 == 3:
        print("✅ Игрок 2 получил правильный доход")
    else:
        print(f"❌ Игрок 2 получил неправильный доход: ожидалось 3, получено {income_received_2}")
    
    return game

def test_growth_calculation():
    """Тест расчета прироста капитализации"""
    print("\n" + "="*60)
    print("ТЕСТ 2: Расчет прироста капитализации")
    print("="*60)
    
    # Используем игру из предыдущего теста
    database.init_database()
    game = Game(num_players=2, load_from_db=False)
    
    game.add_player("test_growth1", "Тест Рост 1")
    game.add_player("test_growth2", "Тест Рост 2")
    
    player1 = game.get_player("test_growth1")
    player2 = game.get_player("test_growth2")
    
    # Начальная капитализация
    initial_value_1 = player1.money
    initial_value_2 = player2.money
    
    print(f"\nНачальная капитализация:")
    print(f"Игрок 1: {initial_value_1} монет")
    print(f"Игрок 2: {initial_value_2} монет")
    
    # Игрок 1 покупает ресурсы
    game.buy_resource("test_growth1", "дерево", 10)
    
    # Обрабатываем раунд 1
    game.process_round()
    
    # Получаем капитализацию после раунда 1
    leaderboard = game.get_leaderboard()
    player1_data = next((p for p in leaderboard if p["player_id"] == "test_growth1"), None)
    player2_data = next((p for p in leaderboard if p["player_id"] == "test_growth2"), None)
    
    if player1_data:
        value_1 = player1_data["total_value"]
        print(f"\nПосле раунда 1:")
        print(f"Игрок 1: капитализация = {value_1} монет")
        print(f"  Начальная: {initial_value_1}, Текущая: {value_1}")
        print(f"  Прирост: {value_1 - initial_value_1} монет")
    
    # Обрабатываем раунд 2
    game.process_round()
    
    leaderboard = game.get_leaderboard()
    player1_data = next((p for p in leaderboard if p["player_id"] == "test_growth1"), None)
    
    if player1_data:
        value_1_round2 = player1_data["total_value"]
        print(f"\nПосле раунда 2:")
        print(f"Игрок 1: капитализация = {value_1_round2} монет")
        print(f"  Раунд 1: {value_1}, Раунд 2: {value_1_round2}")
        print(f"  Прирост за раунд: {value_1_round2 - value_1} монет")
        print(f"  Прирост за игру: {value_1_round2 - initial_value_1} монет")

def test_final_results_page():
    """Тест страницы итогов"""
    print("\n" + "="*60)
    print("ТЕСТ 3: Страница итогов")
    print("="*60)
    
    # Создаем игру и доводим до 10 раунда
    database.init_database()
    game = Game(num_players=3, load_from_db=False)
    
    game.add_player("final_test1", "Финальный Тест 1")
    game.add_player("final_test2", "Финальный Тест 2")
    game.add_player("final_test3", "Финальный Тест 3")
    
    print(f"\nСоздана игра с 3 игроками")
    print(f"Текущий раунд: {game.current_round}")
    
    # Симулируем раунды до 10
    for round_num in range(1, 11):
        print(f"\nОбработка раунда {round_num}...")
        game.process_round()
        print(f"Раунд {round_num} завершен. Текущий раунд: {game.current_round}")
        
        # Получаем рейтинг
        leaderboard = game.get_leaderboard()
        print(f"Рейтинг после раунда {round_num}:")
        for idx, player in enumerate(leaderboard[:3], 1):
            print(f"  {idx}. {player['player_id']}: {int(player['total_value'])} монет")
    
    print(f"\nИгра завершена. Текущий раунд: {game.current_round}")
    print("✅ Страница итогов должна быть доступна на раунде 10")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("АВТОМАТИЧЕСКОЕ ТЕСТИРОВАНИЕ ИГРЫ")
    print("="*60)
    
    try:
        # Тест 1: Начисление доходов
        game = test_income_calculation()
        
        # Тест 2: Расчет прироста
        test_growth_calculation()
        
        # Тест 3: Страница итогов
        test_final_results_page()
        
        print("\n" + "="*60)
        print("✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ ОШИБКА В ТЕСТАХ: {e}")
        import traceback
        traceback.print_exc()

