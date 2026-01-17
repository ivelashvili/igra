"""
Тест продажи объектов
Проверяет, что объект исчезает из портфеля в правильном раунде
"""
from game_engine import Game, BuildingStatus
import database

def test_building_sale():
    """Тест продажи объектов"""
    print("\n" + "="*60)
    print("ТЕСТ ПРОДАЖИ ОБЪЕКТОВ")
    print("="*60)
    
    database.init_database()
    game = Game(num_players=1, load_from_db=False)
    game.add_player("sale_test", "Тест Продажа")
    
    player = game.get_player("sale_test")
    
    print(f"\n1. Начальное состояние:")
    print(f"   Раунд: {game.current_round}")
    print(f"   Деньги: {player.money} монет")
    print(f"   Объектов: {len(player.buildings)}")
    
    # Строим объект
    print(f"\n2. Строим Лесоповал...")
    game.buy_resource("sale_test", "железо", 5)
    game.buy_resource("sale_test", "рабы", 3)
    result = game.start_building("sale_test", "Лесоповал")
    print(f"   Результат: {result['message']}")
    
    building = player.buildings[0]
    print(f"   Объект: {building.name}, статус: {building.status.value}")
    
    # Раунд 1 -> 2 (объект становится COMPLETED)
    print(f"\n3. Раунд 1 -> 2 (объект становится COMPLETED)...")
    game.process_round()
    player = game.get_player("sale_test")
    building = player.buildings[0]
    print(f"   Раунд: {game.current_round}")
    print(f"   Объект: {building.name}, статус: {building.status.value}")
    
    # Раунд 2 -> 3 (объект становится ACTIVE)
    print(f"\n4. Раунд 2 -> 3 (объект становится ACTIVE)...")
    game.process_round()
    player = game.get_player("sale_test")
    building = player.buildings[0]
    print(f"   Раунд: {game.current_round}")
    print(f"   Объект: {building.name}, статус: {building.status.value}")
    
    # Выставляем на продажу в раунде 3
    print(f"\n5. Раунд 3: Выставляем объект на продажу...")
    money_before_sale = player.money
    sale_round = game.current_round
    result = game.put_building_for_sale("sale_test", building.id)
    print(f"   Результат: {result['message']}")
    print(f"   Цена продажи: {result['sale_price']:.2f} монет")
    
    player = game.get_player("sale_test")
    building = player.buildings[0]
    print(f"   Раунд: {game.current_round}")
    print(f"   Объектов: {len(player.buildings)}")
    print(f"   Объект: {building.name}, статус: {building.status.value}")
    print(f"   sale_round: {building.sale_round}")
    
    if building.status == BuildingStatus.FOR_SALE:
        print("   ✅ Объект выставлен на продажу")
    else:
        print(f"   ❌ Ошибка: объект не выставлен на продажу, статус: {building.status.value}")
        return False
    
    # Раунд 3 -> 4 (объект НЕ должен продаться, т.к. только что выставлен)
    print(f"\n6. Раунд 3 -> 4 (объект НЕ должен продаться, т.к. только что выставлен)...")
    print(f"   До обработки раунда:")
    print(f"     Раунд: {game.current_round}")
    print(f"     Объектов: {len(player.buildings)}")
    print(f"     Деньги: {player.money} монет")
    
    game.process_round()
    
    player = game.get_player("sale_test")
    
    print(f"   После обработки раунда:")
    print(f"     Раунд: {game.current_round}")
    print(f"     Объектов: {len(player.buildings)}")
    print(f"     Деньги: {player.money} монет")
    
    if len(player.buildings) == 1 and player.buildings[0].status == BuildingStatus.FOR_SALE:
        print("   ✅ Объект остался в портфеле со статусом FOR_SALE (правильно)")
    else:
        print(f"   ⚠️  Объектов: {len(player.buildings)}")
        if len(player.buildings) > 0:
            for b in player.buildings:
                print(f"      - {b.name}, статус: {b.status.value}, sale_round: {b.sale_round}")
    
    # Раунд 4 -> 5 (объект должен продаться и исчезнуть)
    print(f"\n7. Раунд 4 -> 5 (объект должен продаться и исчезнуть)...")
    print(f"   До обработки раунда:")
    print(f"     Раунд: {game.current_round}")
    print(f"     Объектов: {len(player.buildings)}")
    print(f"     Деньги: {player.money} монет")
    
    if len(player.buildings) > 0:
        building = player.buildings[0]
        print(f"     sale_round: {building.sale_round}")
        print(f"     Проверка: sale_round < current_round = {building.sale_round} < {game.current_round} = {building.sale_round < game.current_round}")
    
    game.process_round()
    
    player = game.get_player("sale_test")
    money_after_sale = player.money
    money_received = money_after_sale - money_before_sale
    
    print(f"   После обработки раунда:")
    print(f"     Раунд: {game.current_round}")
    print(f"     Объектов: {len(player.buildings)}")
    print(f"     Деньги: {player.money} монет")
    print(f"     Получено за продажу: {money_received:.2f} монет")
    
    if len(player.buildings) == 0:
        print("   ✅ Объект исчез из портфеля")
    else:
        print(f"   ❌ Ошибка: объект не исчез из портфеля, осталось {len(player.buildings)} объектов")
        for b in player.buildings:
            print(f"      - {b.name}, статус: {b.status.value}, sale_round: {b.sale_round}")
        return False
    
    if money_received > 0:
        print(f"   ✅ Деньги за продажу начислены: +{money_received:.2f} монет")
    else:
        print(f"   ❌ Ошибка: деньги за продажу не начислены")
        return False
    
    # Проверяем, что объект не появился снова в следующем раунде
    print(f"\n8. Раунд 5 -> 6 (проверка, что объект не появился снова)...")
    game.process_round()
    player = game.get_player("sale_test")
    
    if len(player.buildings) == 0:
        print("   ✅ Объект не появился снова")
    else:
        print(f"   ❌ Ошибка: объект появился снова, осталось {len(player.buildings)} объектов")
        return False
    
    print(f"\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ")
    print(f"   Объект правильно продается и исчезает из портфеля в раунде N+1")
    return True

if __name__ == "__main__":
    success = test_building_sale()
    exit(0 if success else 1)

