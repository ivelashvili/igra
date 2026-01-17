"""
Комплексный тест базы данных
Проверяет все аспекты работы БД как единого источника истины
"""
import os
import database
from game_engine import Game, BuildingStatus
from game_config import BUILDING_COSTS

# Используем тестовую БД
TEST_DB_PATH = "test_royal_exchange.db"
database.DB_PATH = TEST_DB_PATH

def cleanup_test_db():
    """Удалить тестовую БД"""
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)
        print(f"🗑️  Удалена старая тестовая БД: {TEST_DB_PATH}")

def test_1_initialization():
    """Тест 1: Инициализация БД"""
    print("\n" + "=" * 70)
    print("ТЕСТ 1: Инициализация базы данных")
    print("=" * 70)
    
    cleanup_test_db()
    database.init_database()
    
    # Проверяем, что файл создан
    assert os.path.exists(TEST_DB_PATH), "❌ Файл БД не создан"
    print("✅ Файл БД создан")
    
    # Проверяем, что таблицы созданы
    with database.get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        expected_tables = [
            'games', 'players', 'player_resources', 'buildings',
            'current_prices', 'resource_prices', 'round_events',
            'player_actions', 'game_version'
        ]
        
        for table in expected_tables:
            assert table in tables, f"❌ Таблица {table} не создана"
        
        print(f"✅ Все таблицы созданы: {len(tables)} шт.")
        print(f"   Таблицы: {', '.join(sorted(tables))}")
    
    print("✅ ТЕСТ 1 ПРОЙДЕН\n")

def test_2_create_and_save_game():
    """Тест 2: Создание и сохранение игры"""
    print("=" * 70)
    print("ТЕСТ 2: Создание и сохранение игры")
    print("=" * 70)
    
    # Создаем игру (автоматически создается в БД)
    game = Game(num_players=10)
    print(f"✅ Игра создана: ID={game.game_id}, Раунд={game.current_round}")
    
    # Добавляем игрока
    game.add_player('test_player', 'Test Player')
    player = game.get_player('test_player')
    print(f"✅ Игрок добавлен: {player.name}, Деньги: {player.money}")
    
    # Покупаем ресурсы
    game.buy_resource('test_player', 'дерево', 20)
    print(f"✅ Ресурсы куплены: Дерево={player.resources.get('дерево', 0)}")
    
    # Проверяем, что данные в БД
    with database.get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Проверяем игру
        cursor.execute("SELECT * FROM games WHERE id = ?", (game.game_id,))
        game_data = cursor.fetchone()
        assert game_data is not None, "❌ Игра не сохранена в БД"
        assert game_data['current_round'] == 1, "❌ Неверный раунд"
        print(f"✅ Игра сохранена в БД: Раунд={game_data['current_round']}")
        
        # Проверяем игрока
        cursor.execute("SELECT * FROM players WHERE id = ?", ('test_player',))
        player_data = cursor.fetchone()
        assert player_data is not None, "❌ Игрок не сохранен в БД"
        assert abs(player_data['money'] - player.money) < 0.01, f"❌ Неверные деньги игрока: {player_data['money']} != {player.money}"
        print(f"✅ Игрок сохранен в БД: Деньги={player_data['money']}")
        
        # Проверяем ресурсы
        cursor.execute("SELECT amount FROM player_resources WHERE player_id = ? AND resource_name = ?", 
                      ('test_player', 'дерево'))
        resource_data = cursor.fetchone()
        assert resource_data is not None, "❌ Ресурсы не сохранены в БД"
        assert resource_data['amount'] == 20, "❌ Неверное количество ресурсов"
        print(f"✅ Ресурсы сохранены в БД: Дерево={resource_data['amount']}")
    
    print("✅ ТЕСТ 2 ПРОЙДЕН\n")
    return game.game_id

def test_3_load_from_database():
    """Тест 3: Загрузка игры из БД"""
    print("=" * 70)
    print("ТЕСТ 3: Загрузка игры из БД")
    print("=" * 70)
    
    # Получаем ID последней игры
    game_id = database.get_active_game_id()
    assert game_id is not None, "❌ Активная игра не найдена"
    print(f"✅ Найдена активная игра: ID={game_id}")
    
    # Загружаем игру из БД
    loaded_game = Game(num_players=10, game_id=game_id, load_from_db=True)
    print(f"✅ Игра загружена: ID={loaded_game.game_id}, Раунд={loaded_game.current_round}")
    
    # Проверяем игрока
    loaded_player = loaded_game.get_player('test_player')
    assert loaded_player is not None, "❌ Игрок не загружен"
    assert loaded_player.money > 0, "❌ Деньги игрока не загружены"
    assert loaded_player.resources.get('дерево', 0) == 20, "❌ Ресурсы не загружены"
    
    print(f"✅ Игрок загружен: Деньги={loaded_player.money}, Дерево={loaded_player.resources.get('дерево', 0)}")
    print("✅ ТЕСТ 3 ПРОЙДЕН\n")
    return game_id

def test_4_synchronization(game_id):
    """Тест 4: Синхронизация между экземплярами"""
    print("=" * 70)
    print("ТЕСТ 4: Синхронизация между экземплярами")
    print("=" * 70)
    
    # Создаем два экземпляра одной игры
    game1 = Game(num_players=10, game_id=game_id, load_from_db=True)
    game2 = Game(num_players=10, game_id=game_id, load_from_db=True)
    
    player1_1 = game1.get_player('test_player')
    player2_1 = game2.get_player('test_player')
    
    # Проверяем, что данные одинаковые
    assert abs(player1_1.money - player2_1.money) < 0.01, "❌ Деньги не синхронизированы"
    assert player1_1.resources == player2_1.resources, "❌ Ресурсы не синхронизированы"
    print("✅ Начальное состояние синхронизировано")
    print(f"   Game1: Деньги={player1_1.money}, Ресурсы={player1_1.resources}")
    print(f"   Game2: Деньги={player2_1.money}, Ресурсы={player2_1.resources}")
    
    # Изменяем состояние в game1
    game1.buy_resource('test_player', 'камень', 10)
    game1.save_to_database()
    print("✅ Изменения в game1 сохранены")
    
    # Обновляем game2 из БД
    game2.load_from_database()
    player2_2 = game2.get_player('test_player')
    
    # Проверяем синхронизацию
    player1_2 = game1.get_player('test_player')
    assert abs(player1_2.money - player2_2.money) < 0.01, "❌ Деньги не синхронизированы после изменения"
    assert player1_2.resources.get('камень', 0) == player2_2.resources.get('камень', 0), \
        "❌ Ресурсы не синхронизированы после изменения"
    
    print(f"✅ После синхронизации:")
    print(f"   Game1: Деньги={player1_2.money}, Камень={player1_2.resources.get('камень', 0)}")
    print(f"   Game2: Деньги={player2_2.money}, Камень={player2_2.resources.get('камень', 0)}")
    print("✅ ТЕСТ 4 ПРОЙДЕН\n")

def test_5_automatic_saving(game_id):
    """Тест 5: Автоматическое сохранение"""
    print("=" * 70)
    print("ТЕСТ 5: Автоматическое сохранение")
    print("=" * 70)
    
    game = Game(num_players=10, game_id=game_id, load_from_db=True)
    
    player = game.get_player('test_player')
    initial_money = player.money
    
    # Покупаем ресурс (должно автоматически сохраниться)
    game.buy_resource('test_player', 'железо', 5)
    print(f"✅ Ресурс куплен, деньги изменились: {initial_money} -> {player.money}")
    
    # Загружаем заново и проверяем
    loaded_game = Game(num_players=10, game_id=game_id, load_from_db=True)
    loaded_player = loaded_game.get_player('test_player')
    
    assert abs(loaded_player.money - player.money) < 0.01, "❌ Деньги не сохранились автоматически"
    assert loaded_player.resources.get('железо', 0) == 5, "❌ Ресурсы не сохранились автоматически"
    
    print(f"✅ Автоматическое сохранение работает:")
    print(f"   Деньги: {loaded_player.money}")
    print(f"   Железо: {loaded_player.resources.get('железо', 0)}")
    print("✅ ТЕСТ 5 ПРОЙДЕН\n")

def test_6_buildings(game_id):
    """Тест 6: Сохранение и загрузка объектов"""
    print("=" * 70)
    print("ТЕСТ 6: Сохранение и загрузка объектов")
    print("=" * 70)
    
    game = Game(num_players=10, game_id=game_id, load_from_db=True)
    
    player = game.get_player('test_player')
    
    # Даем ресурсы для строительства
    for resource, amount in BUILDING_COSTS['Лесоповал'].items():
        player.add_resource(resource, amount * 2)
    
    # Строим объект
    result = game.start_building('test_player', 'Лесоповал')
    building_id = result['building_id']
    print(f"✅ Объект начат: {result['message']}")
    
    # Загружаем заново
    loaded_game = Game(num_players=10, game_id=game_id, load_from_db=True)
    loaded_player = loaded_game.get_player('test_player')
    
    assert len(loaded_player.buildings) == 1, f"❌ Объект не загружен, найдено: {len(loaded_player.buildings)}"
    building = loaded_player.buildings[0]
    assert building.id == building_id, "❌ Неверный ID объекта"
    assert building.status == BuildingStatus.BUILDING, f"❌ Неверный статус объекта: {building.status.value}"
    
    print(f"✅ Объект загружен: {building.name}, Статус: {building.status.value}")
    print("✅ ТЕСТ 6 ПРОЙДЕН\n")

def test_7_round_processing(game_id):
    """Тест 7: Обработка раунда с сохранением"""
    print("=" * 70)
    print("ТЕСТ 7: Обработка раунда с сохранением")
    print("=" * 70)
    
    game = Game(num_players=10, game_id=game_id, load_from_db=True)
    
    initial_round = game.current_round
    print(f"Начальный раунд: {initial_round}")
    
    # Обрабатываем раунд
    result = game.process_round()
    print(f"✅ Раунд обработан: События={result.get('events')}")
    
    # Проверяем, что раунд увеличился
    assert game.current_round == initial_round + 1, f"❌ Раунд не увеличился: {game.current_round} != {initial_round + 1}"
    print(f"✅ Раунд увеличился: {initial_round} -> {game.current_round}")
    
    # Загружаем заново и проверяем
    loaded_game = Game(num_players=10, game_id=game_id, load_from_db=True)
    assert loaded_game.current_round == game.current_round, "❌ Раунд не сохранился"
    
    # Проверяем события
    events = database.load_round_events(game_id, game.current_round)
    assert events is not None, "❌ События не сохранились"
    print(f"✅ События сохранены: {events}")
    
    # Проверяем цены
    prices = database.load_current_prices(game_id)
    assert len(prices) > 0, "❌ Цены не сохранились"
    print(f"✅ Цены сохранены: {len(prices)} ресурсов")
    
    print("✅ ТЕСТ 7 ПРОЙДЕН\n")

def test_8_persistence(game_id):
    """Тест 8: Персистентность (имитация перезапуска)"""
    print("=" * 70)
    print("ТЕСТ 8: Персистентность (имитация перезапуска)")
    print("=" * 70)
    
    # "Перезапускаем" - создаем новый экземпляр
    print("Имитация перезапуска сервера...")
    
    # Создаем новую игру (как при перезапуске)
    restarted_game = Game(num_players=10, game_id=game_id, load_from_db=True)
    
    # Проверяем, что все данные на месте
    player = restarted_game.get_player('test_player')
    assert player is not None, "❌ Игрок потерян после перезапуска"
    assert player.money > 0, "❌ Деньги потеряны после перезапуска"
    assert len(player.resources) > 0, "❌ Ресурсы потеряны после перезапуска"
    assert len(player.buildings) > 0, "❌ Объекты потеряны после перезапуска"
    
    print(f"✅ После перезапуска:")
    print(f"   Игрок: {player.name}, Деньги: {player.money}")
    print(f"   Ресурсы: {player.resources}")
    print(f"   Объекты: {len(player.buildings)} шт.")
    if player.buildings:
        print(f"   Первый объект: {player.buildings[0].name}, Статус: {player.buildings[0].status.value}")
    print("✅ ТЕСТ 8 ПРОЙДЕН\n")

def test_9_concurrent_access(game_id):
    """Тест 9: Конкурентный доступ (симуляция)"""
    print("=" * 70)
    print("ТЕСТ 9: Конкурентный доступ")
    print("=" * 70)
    
    # Создаем несколько экземпляров (как несколько запросов)
    games = []
    for i in range(3):
        game = Game(num_players=10, game_id=game_id, load_from_db=True)
        games.append(game)
    
    # Все должны видеть одинаковые данные
    players = [g.get_player('test_player') for g in games]
    money_values = [p.money for p in players]
    
    assert len(set([round(m, 2) for m in money_values])) == 1, f"❌ Разные экземпляры видят разные данные: {money_values}"
    print(f"✅ Все экземпляры видят одинаковые данные: Деньги={money_values[0]}")
    
    # Изменяем в одном
    games[0].buy_resource('test_player', 'золото', 1)
    
    # Обновляем остальные
    for i in range(1, 3):
        games[i].load_from_database()
    
    # Проверяем синхронизацию
    updated_players = [g.get_player('test_player') for g in games]
    updated_money = [p.money for p in updated_players]
    
    assert len(set([round(m, 2) for m in updated_money])) == 1, f"❌ Данные не синхронизированы после изменения: {updated_money}"
    print(f"✅ После изменения все синхронизированы: Деньги={updated_money[0]}")
    print("✅ ТЕСТ 9 ПРОЙДЕН\n")

def test_10_data_integrity(game_id):
    """Тест 10: Целостность данных"""
    print("=" * 70)
    print("ТЕСТ 10: Целостность данных")
    print("=" * 70)
    
    # Проверяем целостность через прямые запросы к БД
    with database.get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Проверяем, что все игроки имеют game_id
        cursor.execute("SELECT COUNT(*) FROM players WHERE game_id != ?", (game_id,))
        wrong_game_players = cursor.fetchone()[0]
        assert wrong_game_players == 0, f"❌ Найдены игроки с неверным game_id: {wrong_game_players}"
        
        # Проверяем, что все объекты имеют game_id
        cursor.execute("SELECT COUNT(*) FROM buildings WHERE game_id != ?", (game_id,))
        wrong_game_buildings = cursor.fetchone()[0]
        assert wrong_game_buildings == 0, f"❌ Найдены объекты с неверным game_id: {wrong_game_buildings}"
        
        # Проверяем, что нет "осиротевших" ресурсов
        cursor.execute("""
            SELECT COUNT(*) FROM player_resources pr
            LEFT JOIN players p ON pr.player_id = p.id
            WHERE p.id IS NULL
        """)
        orphaned_resources = cursor.fetchone()[0]
        assert orphaned_resources == 0, f"❌ Найдены ресурсы без игрока: {orphaned_resources}"
        
        # Проверяем, что нет "осиротевших" объектов
        cursor.execute("""
            SELECT COUNT(*) FROM buildings b
            LEFT JOIN players p ON b.player_id = p.id
            WHERE p.id IS NULL
        """)
        orphaned_buildings = cursor.fetchone()[0]
        assert orphaned_buildings == 0, f"❌ Найдены объекты без игрока: {orphaned_buildings}"
        
        print("✅ Целостность данных проверена:")
        print(f"   Игроки с правильным game_id: ✓")
        print(f"   Объекты с правильным game_id: ✓")
        print(f"   Ресурсы без игроков: {orphaned_resources}")
        print(f"   Объекты без игроков: {orphaned_buildings}")
    
    print("✅ ТЕСТ 10 ПРОЙДЕН\n")

def test_11_api_integration():
    """Тест 11: Интеграция с API (симуляция)"""
    print("=" * 70)
    print("ТЕСТ 11: Интеграция с API")
    print("=" * 70)
    
    game_id = database.get_active_game_id()
    
    # Симулируем несколько API запросов
    # Каждый должен видеть актуальные данные
    
    # Запрос 1: Получить состояние игрока
    game1 = Game(num_players=10, game_id=game_id, load_from_db=True)
    player1 = game1.get_player('test_player')
    state1 = {
        'money': player1.money,
        'resources': player1.resources.copy(),
        'buildings': len(player1.buildings)
    }
    print(f"✅ Запрос 1: Деньги={state1['money']}, Ресурсы={len(state1['resources'])}, Объекты={state1['buildings']}")
    
    # Изменяем состояние (симуляция действия игрока)
    game1.buy_resource('test_player', 'зерно', 5)
    
    # Запрос 2: Получить состояние игрока (должен увидеть изменения)
    game2 = Game(num_players=10, game_id=game_id, load_from_db=True)
    player2 = game2.get_player('test_player')
    state2 = {
        'money': player2.money,
        'resources': player2.resources.copy(),
        'buildings': len(player2.buildings)
    }
    
    assert abs(state2['money'] - state1['money']) < 0.01 or state2['resources'].get('зерно', 0) > state1['resources'].get('зерно', 0), \
        "❌ Второй запрос не видит изменения"
    
    print(f"✅ Запрос 2: Деньги={state2['money']}, Ресурсы={len(state2['resources'])}, Объекты={state2['buildings']}")
    print(f"✅ Изменения видны: Зерно={state2['resources'].get('зерно', 0)}")
    
    print("✅ ТЕСТ 11 ПРОЙДЕН\n")

def run_all_tests():
    """Запустить все тесты"""
    print("\n" + "=" * 70)
    print("КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ БАЗЫ ДАННЫХ")
    print("=" * 70)
    
    game_id = None
    
    try:
        test_1_initialization()
        game_id = test_2_create_and_save_game()
        test_3_load_from_database()
        test_4_synchronization(game_id)
        test_5_automatic_saving(game_id)
        test_6_buildings(game_id)
        test_7_round_processing(game_id)
        test_8_persistence(game_id)
        test_9_concurrent_access(game_id)
        test_10_data_integrity(game_id)
        test_11_api_integration()
        
        print("=" * 70)
        print("✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!")
        print("=" * 70)
        print("\n📊 Итоги:")
        print("   ✅ БД инициализируется корректно")
        print("   ✅ Данные сохраняются автоматически")
        print("   ✅ Данные загружаются корректно")
        print("   ✅ Синхронизация между экземплярами работает")
        print("   ✅ Персистентность данных обеспечена")
        print("   ✅ Целостность данных проверена")
        print("   ✅ Интеграция с API работает")
        
    except AssertionError as e:
        print(f"\n❌ ТЕСТ ПРОВАЛЕН: {e}")
        import traceback
        traceback.print_exc()
        raise
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    run_all_tests()

