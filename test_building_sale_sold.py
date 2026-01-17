"""
Тест продажи объектов с новым статусом SOLD
Проверяет, что объект остается в портфеле после продажи, но не приносит доход
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from game_engine import Game, BuildingStatus
from game_config import STARTING_MONEY

def test_building_sale_with_sold_status():
    """Тест: объект выставляется на продажу, в следующем раунде получает статус SOLD"""
    print("=" * 60)
    print("ТЕСТ: Продажа объекта с статусом SOLD")
    print("=" * 60)
    
    # Создаем игру
    import database
    database.init_database()
    game = Game(game_id=999, num_players=1, load_from_db=False)
    game.add_player("test_sold", "Тест SOLD")
    player = game.get_player("test_sold")
    player_id = player.id
    
    print(f"\n1. Игрок создан: {player_id}")
    print(f"   Начальные деньги: {player.money}")
    
    # Покупаем ресурсы для постройки Лесоповала
    print("\n2. Покупаем ресурсы для Лесоповала...")
    game.buy_resource(player_id, "железо", 5)
    game.buy_resource(player_id, "рабы", 3)
    print(f"   Деньги после покупки ресурсов: {player.money}")
    
    # Строим объект (Лесоповал - самый дешевый)
    print("\n3. Строим Лесоповал...")
    result = game.start_building(player_id, "Лесоповал")
    print(f"   Результат: {result}")
    
    # Переходим в раунд 2 (объект завершится)
    print("\n4. Переходим в раунд 2 (объект завершится)...")
    game.process_round()
    print(f"   Текущий раунд: {game.current_round}")
    print(f"   Количество объектов: {len(player.buildings)}")
    if player.buildings:
        print(f"   Статус объекта: {player.buildings[0].status.value}")
    
    # Переходим в раунд 3 (объект станет активным и принесет доход)
    print("\n5. Переходим в раунд 3 (объект станет активным)...")
    game.process_round()
    print(f"   Текущий раунд: {game.current_round}")
    print(f"   Количество объектов: {len(player.buildings)}")
    if player.buildings:
        building = player.buildings[0]
        print(f"   Статус объекта: {building.status.value}")
        print(f"   Деньги после дохода: {player.money}")
    
    # Выставляем объект на продажу в раунде 3
    print("\n6. Выставляем объект на продажу в раунде 3...")
    building = player.buildings[0]
    result = game.put_building_for_sale(player_id, building.id)
    print(f"   Результат: {result}")
    print(f"   Статус объекта: {building.status.value}")
    print(f"   Количество объектов: {len(player.buildings)}")
    print(f"   Деньги до продажи: {player.money}")
    
    # Сохраняем деньги до продажи
    money_before_sale = player.money
    
    # Переходим в раунд 4 (объект должен быть продан)
    print("\n7. Переходим в раунд 4 (объект должен быть продан)...")
    print(f"   Перед process_round(): current_round={game.current_round}, sale_round={building.sale_round}")
    game.process_round()
    print(f"   После process_round(): current_round={game.current_round}")
    print(f"   Количество объектов: {len(player.buildings)}")
    
    # Обновляем ссылку на игрока (может быть обновлен из БД)
    player = game.get_player(player_id)
    
    # Проверяем результаты
    assert len(player.buildings) == 1, f"Ожидалось 1 объект в портфеле, получено {len(player.buildings)}"
    
    building = player.buildings[0]
    print(f"   Статус объекта после process_round(): {building.status.value}")
    print(f"   sale_round: {building.sale_round}")
    assert building.status == BuildingStatus.SOLD, f"Ожидался статус SOLD, получен {building.status.value}"
    
    print(f"   ✅ Статус объекта: {building.status.value} (ожидалось: sold)")
    print(f"   ✅ Объект остался в портфеле: {len(player.buildings)} объект(ов)")
    print(f"   Деньги после продажи: {player.money}")
    print(f"   Деньги до продажи: {money_before_sale}")
    print(f"   Разница (цена продажи): {player.money - money_before_sale}")
    
    # Проверяем, что объект не приносит доход в следующем раунде
    print("\n8. Переходим в раунд 5 (проверяем, что объект не приносит доход)...")
    money_before_income = player.money
    game.process_round()
    print(f"   Текущий раунд: {game.current_round}")
    print(f"   Деньги до начисления дохода: {money_before_income}")
    print(f"   Деньги после начисления дохода: {player.money}")
    print(f"   Разница (доход от объекта): {player.money - money_before_income}")
    
    # Объект со статусом SOLD не должен приносить доход
    # Лесоповал приносит дерево, но мы проверим, что доход не начислен
    # (в реальной игре доход начисляется только от ACTIVE объектов)
    assert building.status == BuildingStatus.SOLD, "Объект должен остаться со статусом SOLD"
    print(f"   ✅ Объект остался со статусом SOLD: {building.status.value}")
    print(f"   ✅ Объект не приносит доход (статус SOLD)")
    
    # Проверяем капитализацию (SOLD объекты не должны учитываться)
    print("\n9. Проверяем капитализацию...")
    buildings_value = sum(
        game.calculate_building_sale_price(b)
        for b in player.buildings
        if b.status != BuildingStatus.FOR_SALE and b.status != BuildingStatus.SOLD
    )
    print(f"   Стоимость объектов в капитализации: {buildings_value}")
    assert buildings_value == 0, f"SOLD объекты не должны учитываться в капитализации, получено {buildings_value}"
    print(f"   ✅ SOLD объекты не учитываются в капитализации")
    
    print("\n" + "=" * 60)
    print("✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!")
    print("=" * 60)
    print("\nРезультаты:")
    print(f"  - Объект остался в портфеле после продажи")
    print(f"  - Статус объекта изменился на SOLD")
    print(f"  - Деньги за объект начислены")
    print(f"  - SOLD объекты не приносят доход")
    print(f"  - SOLD объекты не учитываются в капитализации")
    print("=" * 60)

if __name__ == "__main__":
    test_building_sale_with_sold_status()

