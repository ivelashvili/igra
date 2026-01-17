"""
Комплексное тестирование готовности к продакшену
Проверяет все критические компоненты игры
"""
import sys
import traceback
from game_engine import Game
import database
from game_config import RESOURCE_PRICES, BUILDING_COSTS, BUILDING_INCOME
from market_dynamics import MarketDynamics
from game_events import EventSystem

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}ТЕСТ: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def print_success(message):
    print(f"{Colors.GREEN}✅ {message}{Colors.END}")

def print_error(message):
    print(f"{Colors.RED}❌ {message}{Colors.END}")

def print_warning(message):
    print(f"{Colors.YELLOW}⚠️  {message}{Colors.END}")

def test_database():
    """Тест базы данных"""
    print_test("База данных")
    try:
        database.init_database()
        print_success("База данных инициализирована")
        
        # Проверяем создание игры
        game_id = database.create_game(5)
        print_success(f"Создана игра с ID: {game_id}")
        
        # Проверяем загрузку игры
        game_data = database.load_game(game_id)
        if game_data:
            print_success("Игра успешно загружена из БД")
        else:
            print_error("Не удалось загрузить игру из БД")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка БД: {e}")
        traceback.print_exc()
        return False

def test_game_engine():
    """Тест игрового движка"""
    print_test("Игровой движок")
    try:
        # Создаем игру
        game = Game(num_players=3, load_from_db=False)
        print_success("Игра создана")
        
        # Добавляем игроков
        game.add_player("test1", "Тест 1")
        game.add_player("test2", "Тест 2")
        game.add_player("test3", "Тест 3")
        print_success("Игроки добавлены")
        
        # Тест покупки ресурсов
        result = game.buy_resource("test1", "дерево", 10)
        if result["success"]:
            print_success("Покупка ресурсов работает")
        else:
            print_error(f"Ошибка покупки: {result.get('message')}")
            return False
        
        # Тест продажи ресурсов
        result = game.sell_resource("test1", "дерево", 5)
        if result["success"]:
            print_success("Продажа ресурсов работает")
        else:
            print_error(f"Ошибка продажи: {result.get('message')}")
            return False
        
        # Тест строительства
        game.buy_resource("test1", "железо", 5)
        game.buy_resource("test1", "рабы", 3)
        result = game.start_building("test1", "Лесоповал")
        if result["success"]:
            print_success("Строительство объектов работает")
        else:
            print_error(f"Ошибка строительства: {result.get('message')}")
            return False
        
        # Тест обработки раунда
        round_result = game.process_round()
        if round_result:
            print_success("Обработка раунда работает")
        else:
            print_error("Ошибка обработки раунда")
            return False
        
        # Тест рейтинга
        leaderboard = game.get_leaderboard()
        if len(leaderboard) == 3:
            print_success("Рейтинг работает корректно")
        else:
            print_error(f"Ошибка рейтинга: ожидалось 3 игрока, получено {len(leaderboard)}")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка игрового движка: {e}")
        traceback.print_exc()
        return False

def test_market_dynamics():
    """Тест рыночной динамики"""
    print_test("Рыночная динамика")
    try:
        market = MarketDynamics(5)
        
        # Тест расчета цен
        previous_prices = RESOURCE_PRICES.copy()
        players_bought = {"дерево": 3, "камень": 2}
        players_sold = {"железо": 2}
        
        new_prices = market.calculate_resource_prices(
            previous_prices,
            players_bought,
            players_sold,
            None
        )
        
        if new_prices and len(new_prices) == len(previous_prices):
            print_success("Расчет цен работает")
        else:
            print_error("Ошибка расчета цен")
            return False
        
        # Тест расчета доходов объектов
        building_counts = {"Лесоповал": 2, "Каменоломня": 1}
        incomes = market.calculate_building_incomes(
            building_counts,
            previous_prices,
            None
        )
        
        if incomes and "Лесоповал" in incomes:
            print_success("Расчет доходов объектов работает")
        else:
            print_error("Ошибка расчета доходов")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка рыночной динамики: {e}")
        traceback.print_exc()
        return False

def test_events():
    """Тест системы событий"""
    print_test("Система событий")
    try:
        event_system = EventSystem()
        
        # Тест получения событий
        positive, negative = event_system.get_fixed_event_pair(2)
        if positive and negative:
            print_success("Получение событий работает")
        else:
            print_error("Ошибка получения событий")
            return False
        
        # Тест комбинирования модификаторов
        resource_mods, building_mods = event_system.combine_event_modifiers(
            positive, negative
        )
        
        if resource_mods and building_mods:
            print_success("Комбинирование модификаторов работает")
        else:
            print_error("Ошибка комбинирования модификаторов")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка системы событий: {e}")
        traceback.print_exc()
        return False

def test_full_game_flow():
    """Тест полного игрового процесса"""
    print_test("Полный игровой процесс (10 раундов)")
    try:
        database.init_database()
        game = Game(num_players=3, load_from_db=False)
        
        # Добавляем игроков
        for i in range(3):
            game.add_player(f"flow_test{i+1}", f"Тест {i+1}")
        
        # Игрок 1 строит объект
        game.buy_resource("flow_test1", "железо", 5)
        game.buy_resource("flow_test1", "рабы", 3)
        game.start_building("flow_test1", "Лесоповал")
        
        # Игрок 2 строит объект
        game.buy_resource("flow_test2", "дерево", 10)
        game.buy_resource("flow_test2", "железо", 5)
        game.buy_resource("flow_test2", "рабы", 3)
        game.start_building("flow_test2", "Каменоломня")
        
        # Проходим 10 раундов
        for round_num in range(1, 11):
            round_result = game.process_round()
            if not round_result:
                print_error(f"Ошибка в раунде {round_num}")
                return False
            
            # Проверяем, что раунд увеличился
            if game.current_round != round_num + 1:
                print_error(f"Неправильный номер раунда: ожидалось {round_num + 1}, получено {game.current_round}")
                return False
        
        print_success("Все 10 раундов обработаны успешно")
        
        # Проверяем финальный рейтинг
        leaderboard = game.get_leaderboard()
        if len(leaderboard) == 3:
            print_success("Финальный рейтинг корректен")
        else:
            print_error(f"Ошибка финального рейтинга: ожидалось 3 игрока, получено {len(leaderboard)}")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка полного игрового процесса: {e}")
        traceback.print_exc()
        return False

def test_income_calculation():
    """Тест начисления доходов"""
    print_test("Начисление доходов")
    try:
        database.init_database()
        game = Game(num_players=1, load_from_db=False)
        game.add_player("income_test", "Тест Доход")
        
        player = game.get_player("income_test")
        initial_money = player.money
        initial_resources = player.resources.copy()
        
        # Строим объект
        game.buy_resource("income_test", "железо", 5)
        game.buy_resource("income_test", "рабы", 3)
        game.start_building("income_test", "Лесоповал")
        
        # Раунд 1 -> 2 (объект становится COMPLETED)
        game.process_round()
        
        # Раунд 2 -> 3 (объект становится ACTIVE)
        game.process_round()
        
        # Раунд 3 -> 4 (начисляется доход)
        tree_before = player.resources.get("дерево", 0)
        game.process_round()
        player = game.get_player("income_test")
        tree_after = player.resources.get("дерево", 0)
        income_received = tree_after - tree_before
        
        if income_received > 0:
            print_success(f"Доход начислен: получено {income_received} дерева")
        else:
            print_error(f"Доход не начислен: ожидалось > 0, получено {income_received}")
            return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка начисления доходов: {e}")
        traceback.print_exc()
        return False

def test_building_lifecycle():
    """Тест жизненного цикла объектов"""
    print_test("Жизненный цикл объектов")
    try:
        database.init_database()
        game = Game(num_players=1, load_from_db=False)
        game.add_player("lifecycle_test", "Тест Жизненный Цикл")
        
        player = game.get_player("lifecycle_test")
        
        # Строим объект
        game.buy_resource("lifecycle_test", "железо", 5)
        game.buy_resource("lifecycle_test", "рабы", 3)
        result = game.start_building("lifecycle_test", "Лесоповал")
        
        building = player.buildings[0]
        if building.status.value == "building":
            print_success("Объект в статусе BUILDING")
        else:
            print_error(f"Неправильный статус после строительства: {building.status.value}")
            return False
        
        # Раунд 1 -> 2 (должен стать COMPLETED)
        game.process_round()
        building = game.get_player("lifecycle_test").buildings[0]
        if building.status.value == "completed":
            print_success("Объект перешел в статус COMPLETED")
        else:
            print_error(f"Неправильный статус после раунда 2: {building.status.value}")
            return False
        
        # Раунд 2 -> 3 (должен стать ACTIVE)
        game.process_round()
        building = game.get_player("lifecycle_test").buildings[0]
        if building.status.value == "active":
            print_success("Объект перешел в статус ACTIVE")
        else:
            print_error(f"Неправильный статус после раунда 3: {building.status.value}")
            return False
        
        # Выставляем на продажу
        result = game.put_building_for_sale("lifecycle_test", building.id)
        building = game.get_player("lifecycle_test").buildings[0]
        if building.status.value == "for_sale":
            print_success("Объект перешел в статус FOR_SALE")
        else:
            print_error(f"Неправильный статус после выставления на продажу: {building.status.value}")
            return False
        
        # Раунд 3 -> 4 (должен продаться)
        money_before = game.get_player("lifecycle_test").money
        game.process_round()
        player = game.get_player("lifecycle_test")
        money_after = player.money
        
        if len(player.buildings) == 0:
            print_success("Объект продан и удален из портфеля")
        else:
            print_error(f"Объект не продан: осталось {len(player.buildings)} объектов")
            return False
        
        if money_after > money_before:
            print_success(f"Деньги за продажу начислены: +{money_after - money_before} монет")
        else:
            print_warning(f"Деньги за продажу не начислены или начислены неправильно")
        
        return True
    except Exception as e:
        print_error(f"Ошибка жизненного цикла объектов: {e}")
        traceback.print_exc()
        return False

def test_capitalization():
    """Тест расчета капитализации"""
    print_test("Расчет капитализации")
    try:
        database.init_database()
        game = Game(num_players=2, load_from_db=False)
        game.add_player("cap_test1", "Кап 1")
        game.add_player("cap_test2", "Кап 2")
        
        # Игрок 1 покупает ресурсы
        game.buy_resource("cap_test1", "дерево", 10)
        game.buy_resource("cap_test1", "камень", 5)
        
        # Игрок 2 строит объект
        game.buy_resource("cap_test2", "железо", 5)
        game.buy_resource("cap_test2", "рабы", 3)
        game.start_building("cap_test2", "Лесоповал")
        
        leaderboard = game.get_leaderboard()
        
        if len(leaderboard) == 2:
            print_success("Рейтинг содержит 2 игрока")
        else:
            print_error(f"Ошибка рейтинга: ожидалось 2 игрока, получено {len(leaderboard)}")
            return False
        
        # Проверяем, что капитализация рассчитана
        for player_data in leaderboard:
            if "total_value" in player_data and player_data["total_value"] > 0:
                print_success(f"Капитализация игрока {player_data['player_id']}: {player_data['total_value']} монет")
            else:
                print_error(f"Капитализация не рассчитана для игрока {player_data.get('player_id')}")
                return False
        
        return True
    except Exception as e:
        print_error(f"Ошибка расчета капитализации: {e}")
        traceback.print_exc()
        return False

def main():
    """Главная функция тестирования"""
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ ГОТОВНОСТИ К ПРОДАКШЕНУ{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}\n")
    
    tests = [
        ("База данных", test_database),
        ("Игровой движок", test_game_engine),
        ("Рыночная динамика", test_market_dynamics),
        ("Система событий", test_events),
        ("Начисление доходов", test_income_calculation),
        ("Жизненный цикл объектов", test_building_lifecycle),
        ("Расчет капитализации", test_capitalization),
        ("Полный игровой процесс", test_full_game_flow),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print_error(f"Критическая ошибка в тесте '{test_name}': {e}")
            results[test_name] = False
    
    # Итоговый отчет
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}ИТОГОВЫЙ ОТЧЕТ{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}\n")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        if result:
            print_success(f"{test_name}")
        else:
            print_error(f"{test_name}")
    
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"Пройдено тестов: {passed}/{total}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}\n")
    
    if passed == total:
        print(f"{Colors.GREEN}✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ{Colors.END}")
        print(f"{Colors.GREEN}✅ ПРОДУКТ ГОТОВ К ПРОДАКШЕНУ{Colors.END}\n")
        return True
    else:
        print(f"{Colors.RED}❌ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ{Colors.END}")
        print(f"{Colors.YELLOW}⚠️  ТРЕБУЕТСЯ ДОРАБОТКА ПЕРЕД ПРОДАКШЕНОМ{Colors.END}\n")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

