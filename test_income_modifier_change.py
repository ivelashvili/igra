"""
Тест изменения модификатора между раундами
Проверяет, не изменился ли модификатор насыщения
"""
from game_engine import Game
from market_dynamics import MarketDynamics
import database
import math

def test_modifier_change():
    """Тест изменения модификатора"""
    print("\n" + "="*60)
    print("ТЕСТ ИЗМЕНЕНИЯ МОДИФИКАТОРА")
    print("="*60)
    
    database.init_database()
    game = Game(num_players=1, load_from_db=False)
    game.add_player("modifier_test1", "Модификатор Тест 1")
    
    player1 = game.get_player("modifier_test1")
    
    # Строим Лесоповал
    print(f"\n1. Строим Лесоповал...")
    game.buy_resource("modifier_test1", "железо", 5)
    game.buy_resource("modifier_test1", "рабы", 3)
    game.start_building("modifier_test1", "Лесоповал")
    
    # Раунд 1 -> 2
    print(f"\n2. Раунд 1 -> 2...")
    game.process_round()
    
    # Раунд 2 -> 3 (объект становится ACTIVE)
    print(f"\n3. Раунд 2 -> 3 (объект становится ACTIVE)...")
    market = MarketDynamics(1)
    building_counts = {"Лесоповаl": 1}
    new_incomes = market.calculate_building_incomes(building_counts, game.current_prices, None)
    expected_income_1 = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    print(f"   Ожидаемый доход (раунд 3): {expected_income_1:.2f} -> {math.ceil(expected_income_1) if expected_income_1 > 0 else int(round(expected_income_1))}")
    
    game.process_round()
    player1 = game.get_player("modifier_test1")
    tree_after_1 = player1.resources.get("дерево", 0)
    print(f"   Получено дерева: {tree_after_1}")
    
    # Раунд 3 -> 4 (начисляется второй доход)
    print(f"\n4. Раунд 3 -> 4 (начисляется второй доход)...")
    building_counts = {"Лесоповал": 1}
    new_incomes = market.calculate_building_incomes(building_counts, game.current_prices, None)
    expected_income_2 = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    print(f"   Ожидаемый доход (раунд 4): {expected_income_2:.2f} -> {math.ceil(expected_income_2) if expected_income_2 > 0 else int(round(expected_income_2))}")
    
    # Проверяем модификаторы
    modifiers = market.calculate_building_income_modifiers(building_counts, None)
    modifier = modifiers.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 1.0)
    print(f"   Модификатор насыщения: {modifier:.4f}")
    print(f"   Базовый доход: 3")
    print(f"   Доход с модификатором: 3 * {modifier:.4f} = {3 * modifier:.2f}")
    
    tree_before = player1.resources.get("дерево", 0)
    game.process_round()
    player1 = game.get_player("modifier_test1")
    tree_after_2 = player1.resources.get("дерево", 0)
    income_received = tree_after_2 - tree_before
    
    print(f"   Дерево до: {tree_before}, после: {tree_after_2}, получено: {income_received}")
    
    if income_received == math.ceil(expected_income_2) if expected_income_2 > 0 else int(round(expected_income_2)):
        print(f"   ✅ Доход начислен правильно")
    else:
        print(f"   ❌ Доход начислен неправильно: ожидалось {math.ceil(expected_income_2) if expected_income_2 > 0 else int(round(expected_income_2))}, получено {income_received}")

if __name__ == "__main__":
    test_modifier_change()

