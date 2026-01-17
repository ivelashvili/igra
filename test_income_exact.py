"""
Точный тест начисления доходов
Проверяет каждый шаг с детальным логированием
"""
from game_engine import Game
import database
import math

def test_exact_income():
    """Точный тест начисления доходов"""
    print("\n" + "="*60)
    print("ТОЧНЫЙ ТЕСТ НАЧИСЛЕНИЯ ДОХОДОВ")
    print("="*60)
    
    database.init_database()
    game = Game(num_players=1, load_from_db=False)
    game.add_player("exact_test1", "Точный Тест 1")
    
    player1 = game.get_player("exact_test1")
    
    # Строим Лесоповал (базовый доход: 3 дерева)
    print(f"\n1. Строим Лесоповал (базовый доход: 3 дерева)...")
    game.buy_resource("exact_test1", "железо", 5)
    game.buy_resource("exact_test1", "рабы", 3)
    game.start_building("exact_test1", "Лесоповал")
    print(f"   Ресурсы после покупки: {player1.resources}")
    
    # Раунд 1 -> 2
    print(f"\n2. Раунд 1 -> 2 (объект становится COMPLETED)...")
    game.process_round()
    player1 = game.get_player("exact_test1")
    for b in player1.buildings:
        print(f"   Объект: {b.name}, статус: {b.status.value}, completed_round: {b.completed_round}")
    print(f"   Ресурсы: {player1.resources}")
    
    # Раунд 2 -> 3 (объект становится ACTIVE и начисляется доход)
    print(f"\n3. Раунд 2 -> 3 (объект становится ACTIVE, начисляется первый доход)...")
    tree_before = player1.resources.get("дерево", 0)
    print(f"   Дерево до: {tree_before}")
    
    # Вручную проверяем, что будет рассчитано
    from market_dynamics import MarketDynamics
    market = MarketDynamics(1)
    building_counts = {"Лесоповал": 1}
    new_incomes = market.calculate_building_incomes(building_counts, game.current_prices, None)
    expected_income = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    expected_rounded = math.ceil(expected_income) if expected_income > 0 else int(round(expected_income))
    print(f"   Ожидаемый доход: {expected_income:.2f} -> округлено: {expected_rounded}")
    
    game.process_round()
    player1 = game.get_player("exact_test1")
    tree_after = player1.resources.get("дерево", 0)
    income_received = tree_after - tree_before
    print(f"   Дерево после: {tree_after}")
    print(f"   Получено: {income_received}")
    
    if income_received == expected_rounded:
        print(f"   ✅ Первый доход начислен правильно: {income_received}")
    else:
        print(f"   ❌ Первый доход начислен неправильно: ожидалось {expected_rounded}, получено {income_received}")
    
    # Раунд 3 -> 4 (начисляется второй доход)
    print(f"\n4. Раунд 3 -> 4 (начисляется второй доход)...")
    tree_before = player1.resources.get("дерево", 0)
    print(f"   Дерево до: {tree_before}")
    
    # Вручную проверяем, что будет рассчитано
    building_counts = {"Лесоповал": 1}
    new_incomes = market.calculate_building_incomes(building_counts, game.current_prices, None)
    expected_income = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    expected_rounded = math.ceil(expected_income) if expected_income > 0 else int(round(expected_income))
    print(f"   Ожидаемый доход: {expected_income:.2f} -> округлено: {expected_rounded}")
    
    game.process_round()
    player1 = game.get_player("exact_test1")
    tree_after = player1.resources.get("дерево", 0)
    income_received = tree_after - tree_before
    print(f"   Дерево после: {tree_after}")
    print(f"   Получено: {income_received}")
    
    if income_received == expected_rounded:
        print(f"   ✅ Второй доход начислен правильно: {income_received}")
    else:
        print(f"   ❌ Второй доход начислен неправильно: ожидалось {expected_rounded}, получено {income_received}")

if __name__ == "__main__":
    test_exact_income()

