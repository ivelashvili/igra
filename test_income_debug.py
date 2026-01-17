"""
Детальный тест начисления доходов
Проверяет каждый шаг начисления дохода
"""
from game_engine import Game
from market_dynamics import MarketDynamics
from game_config import BUILDING_INCOME
import database
import math

def test_income_debug():
    """Детальный тест начисления доходов"""
    print("\n" + "="*60)
    print("ДЕТАЛЬНЫЙ ТЕСТ НАЧИСЛЕНИЯ ДОХОДОВ")
    print("="*60)
    
    # Создаем игру
    database.init_database()
    game = Game(num_players=1, load_from_db=False)
    
    game.add_player("debug_test1", "Отладка Тест 1")
    
    player1 = game.get_player("debug_test1")
    
    # Строим Лесоповал
    print(f"\nСтроим Лесоповал...")
    game.buy_resource("debug_test1", "железо", 5)
    game.buy_resource("debug_test1", "рабы", 3)
    game.start_building("debug_test1", "Лесоповал")
    
    print(f"После строительства: {player1.money} монет, ресурсы: {player1.resources}")
    
    # Раунд 1 -> 2
    print(f"\nРаунд 1 -> 2...")
    game.process_round()
    player1 = game.get_player("debug_test1")
    print(f"После раунда 2: {player1.money} монет, ресурсы: {player1.resources}")
    for b in player1.buildings:
        print(f"  Объект: {b.name}, статус: {b.status.value}")
    
    # Раунд 2 -> 3 (объект становится ACTIVE)
    print(f"\nРаунд 2 -> 3 (объект становится ACTIVE)...")
    game.process_round()
    player1 = game.get_player("debug_test1")
    print(f"После раунда 3: {player1.money} монет, ресурсы: {player1.resources}")
    for b in player1.buildings:
        print(f"  Объект: {b.name}, статус: {b.status.value}")
    
    # Раунд 3 -> 4 (начисление дохода)
    print(f"\nРаунд 3 -> 4 (начисление дохода)...")
    tree_before = player1.resources.get("дерево", 0)
    print(f"Дерево до начисления: {tree_before}")
    
    # Проверяем, сколько объектов активных
    building_counts = {}
    for player in game.players:
        for building in player.buildings:
            if building.status.value == "active":
                building_counts[building.name] = building_counts.get(building.name, 0) + 1
    
    print(f"Активных объектов: {building_counts}")
    
    # Рассчитываем доходы
    market = MarketDynamics(1)
    new_incomes = market.calculate_building_incomes(
        building_counts,
        game.current_prices,
        None
    )
    
    print(f"\nРассчитанные доходы:")
    for name, income in new_incomes.items():
        if income.get("ресурсы"):
            for resource, amount in income["ресурсы"].items():
                base = BUILDING_INCOME[name]['ресурсы'].get(resource, 0)
                rounded = math.ceil(amount) if amount > 0 else int(round(amount))
                print(f"  {name}: базово={base}, с модификатором={amount:.2f}, округлено={rounded}")
    
    # Обрабатываем раунд
    game.process_round()
    
    player1 = game.get_player("debug_test1")
    tree_after = player1.resources.get("дерево", 0)
    income_received = tree_after - tree_before
    
    print(f"\nПосле начисления:")
    print(f"Дерево после: {tree_after}")
    print(f"Получено: {income_received}")
    
    expected = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    expected_rounded = math.ceil(expected) if expected > 0 else int(round(expected))
    
    print(f"\nОжидалось: {expected:.2f} -> {expected_rounded}")
    print(f"Получено: {income_received}")
    
    if income_received == expected_rounded:
        print("✅ Доход начислен правильно")
    else:
        print(f"❌ Доход начислен неправильно!")

if __name__ == "__main__":
    test_income_debug()

