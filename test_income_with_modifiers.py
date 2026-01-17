"""
Тест начисления доходов с модификаторами
Проверяет, что доходы правильно начисляются при различных модификаторах
"""
from game_engine import Game
from market_dynamics import MarketDynamics
from game_config import BUILDING_INCOME
import database

def test_income_with_modifiers():
    """Тест начисления доходов с модификаторами насыщения и событий"""
    print("\n" + "="*60)
    print("ТЕСТ: Начисление доходов с модификаторами")
    print("="*60)
    
    # Создаем игру
    database.init_database()
    game = Game(num_players=5, load_from_db=False)
    
    # Добавляем игроков
    for i in range(5):
        game.add_player(f"mod_test{i+1}", f"Модификатор Тест {i+1}")
    
    # Все игроки строят Лесоповал (должен приносить 3 дерева базово)
    print(f"\nВсе игроки строят Лесоповал...")
    for i in range(5):
        player_id = f"mod_test{i+1}"
        game.buy_resource(player_id, "железо", 5)
        game.buy_resource(player_id, "рабы", 3)
        game.start_building(player_id, "Лесоповал")
    
    # Обрабатываем раунды до активации объектов
    print(f"\nОбработка раундов до активации...")
    game.process_round()  # Раунд 1 -> 2
    game.process_round()  # Раунд 2 -> 3 (объекты становятся ACTIVE)
    
    # Проверяем доходы до начисления
    player1 = game.get_player("mod_test1")
    tree_before = player1.resources.get("дерево", 0)
    print(f"\nДо начисления дохода:")
    print(f"Игрок 1: дерево = {tree_before}")
    
    # Проверяем, сколько объектов построено
    building_counts = {}
    for player in game.players:
        for building in player.buildings:
            if building.status.value == "active":
                building_counts[building.name] = building_counts.get(building.name, 0) + 1
    
    print(f"\nАктивных объектов:")
    for name, count in building_counts.items():
        print(f"  {name}: {count}")
    
    # Рассчитываем доходы вручную
    market = MarketDynamics(5)
    new_incomes = market.calculate_building_incomes(
        building_counts,
        game.current_prices,
        None  # Без модификаторов событий
    )
    
    print(f"\nРассчитанные доходы:")
    for name, income in new_incomes.items():
        if income.get("ресурсы"):
            for resource, amount in income["ресурсы"].items():
                print(f"  {name}: {amount} {resource} (базово: {BUILDING_INCOME[name]['ресурсы'].get(resource, 0)})")
    
    # Обрабатываем раунд 3 -> 4 (начисление дохода)
    print(f"\nОбработка раунда 4 (начисление дохода)...")
    game.process_round()
    
    # Проверяем доходы после начисления
    player1 = game.get_player("mod_test1")
    tree_after = player1.resources.get("дерево", 0)
    income_received = tree_after - tree_before
    
    print(f"\nПосле начисления дохода:")
    print(f"Игрок 1: дерево = {tree_after} (получено: {income_received})")
    
    # Проверяем ожидаемый доход
    expected_income = new_incomes.get("Лесоповал", {}).get("ресурсы", {}).get("дерево", 0)
    expected_rounded = int(expected_income) if expected_income <= 0 else __import__('math').ceil(expected_income)
    
    print(f"\nОжидаемый доход: {expected_income} -> округлено: {expected_rounded}")
    print(f"Полученный доход: {income_received}")
    
    if income_received == expected_rounded:
        print("✅ Доход начислен правильно")
    else:
        print(f"❌ Доход начислен неправильно: ожидалось {expected_rounded}, получено {income_received}")

if __name__ == "__main__":
    test_income_with_modifiers()

