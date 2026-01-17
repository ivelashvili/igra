"""
Веб-сервер для отображения игры на проекторе
FastAPI + WebSocket для обновлений в реальном времени
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Header
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, List, Optional
import json
import asyncio
import hmac
import hashlib
import base64
from urllib.parse import unquote, parse_qs
from game_engine import Game, BuildingStatus
from game_config import RESOURCE_PRICES, BUILDING_COSTS, BUILDING_INCOME
from game_events import POSITIVE_EVENTS, NEGATIVE_EVENTS, EventSystem
from fixed_scenario_analysis import FIXED_EVENT_SEQUENCE, combine_two_positive_events
import database

app = FastAPI(title="Королевская биржа - Веб-интерфейс")

# Глобальное состояние игры (будет инициализировано)
game_instance: Game = None
previous_leaderboard: List[Dict] = []
previous_leaderboard_ranks: Dict[str, int] = {}  # {player_id: rank} для отслеживания позиций
initial_prices: Dict[str, float] = RESOURCE_PRICES.copy()
player_capitalization_history: Dict[str, Dict] = {}  # {player_id: {"previous": float, "initial": float}}

# WebSocket подключения
active_connections: List[WebSocket] = []

@app.on_event("startup")
async def startup():
    """Инициализация при старте"""
    global game_instance
    # Инициализируем БД
    database.init_database()
    
    # Пытаемся загрузить активную игру из БД
    active_game_id = database.get_active_game_id()
    if active_game_id:
        # Загружаем игру из БД
        game_data = database.load_game(active_game_id)
        if game_data:
            game_instance = Game(
                num_players=game_data['num_players'],
                game_id=active_game_id,
                load_from_db=True
            )
            print(f"✅ Загружена игра из БД: ID={active_game_id}, Раунд={game_instance.current_round}")
    else:
        # Создаем новую игру
        print("ℹ️ Активная игра не найдена, будет создана новая при первом запросе")

def set_game(game: Game):
    """Установить игровой экземпляр"""
    global game_instance
    game_instance = game
    # Сохраняем в БД при установке
    if game_instance:
        game_instance.save_to_database()

def ensure_game_loaded():
    """Убедиться, что игра загружена из БД и обновлена"""
    global game_instance
    
    if not game_instance:
        active_game_id = database.get_active_game_id()
        if active_game_id:
            from game_engine import Game
            game_data = database.load_game(active_game_id)
            if game_data:
                game_instance = Game(
                    num_players=game_data['num_players'],
                    game_id=active_game_id,
                    load_from_db=True
                )
                return game_instance
        
        # Если игра не найдена, создаем новую
        from game_engine import Game
        game_instance = Game(num_players=30)
        game_instance.save_to_database()
        return game_instance
    
    # Обновляем состояние из БД перед возвратом (для синхронизации)
    if game_instance:
        game_instance.load_from_database()
    
    return game_instance

@app.get("/", response_class=HTMLResponse)
async def get_main_page():
    """Главная страница"""
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/miniapp", response_class=HTMLResponse)
async def get_miniapp_page():
    """Страница Telegram Mini App"""
    with open("templates/miniapp.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/miniapp_test", response_class=HTMLResponse)
async def get_miniapp_test_page():
    """Тестовая страница Mini App для локального тестирования"""
    with open("templates/miniapp_test.html", "r", encoding="utf-8") as f:
        return f.read()

# Endpoint для сводки по раунду - регистрируем рано, чтобы избежать конфликтов
@app.get("/api/round/{round_number}/summary")
async def get_round_summary(round_number: int):
    """Получить сводку по раунду (события, изменения цен и доходов)"""
    print(f"DEBUG: get_round_summary вызван для раунда {round_number}")
    try:
        ensure_game_loaded()
        
        if not game_instance:
            raise HTTPException(status_code=500, detail="Игра не инициализирована")
        
        if round_number < 1 or round_number > 10:
            raise HTTPException(status_code=400, detail="Некорректный номер раунда (1-10)")
        
        # Создаем словари для быстрого поиска событий
        positive_events_dict = {e["name"]: e for e in POSITIVE_EVENTS}
        negative_events_dict = {e["name"]: e for e in NEGATIVE_EVENTS}
        
        # Ключевые ресурсы
        KEY_RESOURCES = ["золото", "железо", "дерево", "зерно", "скот", "рабы", "рыба", "овощи"]
        
        def calculate_price_change_percent(modifier: float) -> float:
            """Рассчитывает процент изменения цены от модификатора"""
            if modifier < 1.0:
                return (1.0 - modifier) * 100
            else:
                return (modifier - 1.0) * 100
        
        def calculate_income_change_percent(modifier: float) -> float:
            """Рассчитывает процент изменения дохода от модификатора"""
            if modifier < 1.0:
                return (1.0 - modifier) * 100
            else:
                return (modifier - 1.0) * 100
        
        def get_resource_change_reason(resource: str, modifier: float) -> str:
            """Получить причину изменения цены ресурса"""
            if modifier < 1.0:
                reasons = {
                    "зерно": "Избыток урожая",
                    "овощи": "Избыток урожая",
                    "скот": "Хорошо откормлен",
                    "рыба": "Огромное предложение",
                    "золото": "Больше предложения",
                    "железо": "Новые инструменты",
                    "дерево": "Меньше строительства",
                    "камень": "Меньше строительства",
                    "рабы": "Привезли рабов"
                }
            else:
                reasons = {
                    "зерно": "Урожай погиб",
                    "овощи": "Овощи засохли/разграблены",
                    "скот": "Скот угнан/погиб",
                    "рыба": "Реки обмелели",
                    "золото": "Инфляция",
                    "железо": "Нужно для оружия",
                    "дерево": "Леса сожжены/нужно для укреплений",
                    "камень": "Нужно для строительства",
                    "рабы": "Рабов нет/болеют"
                }
            return reasons.get(resource, "Изменение спроса/предложения")
        
        def get_building_change_reason(building_name: str, modifier: float) -> str:
            """Получить причину изменения дохода объекта"""
            if modifier < 1.0:
                reasons = {
                    "Посевные поля": "Поля сожжены/высохли",
                    "Теплицы": "Частично разрушены",
                    "Ферма": "Фермы разграблены/скот погиб",
                    "Лесоповал": "Леса сожжены",
                    "Трактир": "Меньше посетителей",
                    "Постоялый двор": "Меньше путешественников",
                    "Куртизанские палатки": "Закрыты рейдом/церковью",
                    "Рыболовня": "Рыбы мало",
                    "Каменоломня": "Нет рабов",
                    "Золотой рудник": "Нет рабов",
                    "Кузнечная": "Меньше заказов"
                }
            else:
                reasons = {
                    "Посевные поля": "Рекордный урожай",
                    "Теплицы": "Овощей много",
                    "Ферма": "Скот здоров",
                    "Лесоповал": "Лучшие инструменты",
                    "Трактир": "Народ гуляет",
                    "Постоялый двор": "Много постояльцев",
                    "Куртизанские палатки": "Праздничное веселье",
                    "Рыболовня": "Рекордный улов",
                    "Каменоломня": "Больше работы",
                    "Золотой рудник": "Добыча выросла",
                    "Кузнечная": "Новые технологии/военные заказы"
                }
            return reasons.get(building_name, "Изменение условий")
        
        def get_key_resources(resource_modifiers: dict) -> list:
            """Получить список ключевых ресурсов с изменениями"""
            key_resources = []
            for resource in KEY_RESOURCES:
                if resource in resource_modifiers:
                    modifier = resource_modifiers[resource]
                    change_percent = calculate_price_change_percent(modifier)
                    if abs(change_percent) >= 5:
                        direction = "down" if modifier < 1.0 else "up"
                        reason = get_resource_change_reason(resource, modifier)
                        key_resources.append({
                            "name": resource,
                            "change_percent": round(change_percent, 0),
                            "direction": direction,
                            "reason": reason
                        })
            key_resources.sort(key=lambda x: abs(x["change_percent"]), reverse=True)
            return key_resources[:5]
        
        def get_key_buildings(building_modifiers: dict) -> list:
            """Получить список ключевых объектов с изменениями"""
            key_buildings = []
            for building_name, modifier in building_modifiers.items():
                change_percent = calculate_income_change_percent(modifier)
                if abs(change_percent) >= 10:
                    direction = "down" if modifier < 1.0 else "up"
                    reason = get_building_change_reason(building_name, modifier)
                    key_buildings.append({
                        "name": building_name,
                        "income_change_percent": round(change_percent, 0),
                        "direction": direction,
                        "reason": reason
                    })
            key_buildings.sort(key=lambda x: abs(x["income_change_percent"]), reverse=True)
            return key_buildings[:5]
        
        # Получаем сводку для раунда
        if round_number == 1:
            return {
                "title": "Раунд 1: Начало игры",
                "events": {
                    "positive": None,
                    "negative": None,
                    "positive_description": None,
                    "negative_description": None
                },
                "key_resources": [],
                "key_buildings": []
            }
        
        # Получаем события для раунда
        event_pair = FIXED_EVENT_SEQUENCE[round_number - 1]
        pos_name, second_name = event_pair
        
        positive_event = positive_events_dict.get(pos_name)
        
        # Специальная обработка для раунда 3 (два позитивных события)
        if round_number == 3:
            second_positive_event = positive_events_dict.get(second_name)
            resource_mods, building_mods = combine_two_positive_events(
                positive_event, second_positive_event
            )
            
            return {
                "title": f"Раунд {round_number}: Двойной праздник",
                "events": {
                    "positive": pos_name,
                    "positive2": second_name,
                    "negative": None,
                    "positive_description": positive_event["description"],
                    "positive2_description": second_positive_event["description"]
                },
                "key_resources": get_key_resources(resource_mods),
                "key_buildings": get_key_buildings(building_mods)
            }
        else:
            # Обычная пара: позитивное + негативное
            negative_event = negative_events_dict.get(second_name)
            event_system = EventSystem()
            resource_mods, building_mods = event_system.combine_event_modifiers(
                positive_event, negative_event
            )
            
            return {
                "title": f"Раунд {round_number}",
                "events": {
                    "positive": pos_name,
                    "negative": second_name,
                    "positive_description": positive_event["description"],
                    "negative_description": negative_event["description"]
                },
                "key_resources": get_key_resources(resource_mods),
                "key_buildings": get_key_buildings(building_mods)
            }
    except Exception as e:
        print(f"Ошибка в get_round_summary для раунда {round_number}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка получения сводки: {str(e)}")

@app.get("/api/leaderboard")
async def get_leaderboard():
    """Получить турнирную таблицу с приростом"""
    ensure_game_loaded()
    
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    current_leaderboard = game_instance.get_leaderboard()
    global previous_leaderboard, player_capitalization_history
    
    # Добавляем прирост от предыдущего раунда и за всю игру
    result = []
    for player in current_leaderboard:
        player_obj = game_instance.get_player(player["player_id"])
        player_data = player.copy()
        
        # Добавляем информацию о персонаже
        if player_obj:
            player_data["character_name"] = getattr(player_obj, 'character_name', None)
            player_data["character_image"] = getattr(player_obj, 'character_image', None)
        
        # Используем player_capitalization_history для расчета прироста за раунд
        player_id = player["player_id"]
        history = player_capitalization_history.get(player_id, {})
        prev_value = history.get("previous", player["total_value"])
        
        if prev_value > 0:
            growth = ((player["total_value"] - prev_value) / prev_value) * 100
        else:
            growth = 0
        
        player_data["growth_percent"] = round(growth, 2)
        player_data["growth_round_percent"] = round(growth, 2)  # Для совместимости с мини-аппом
        
        # Рассчитываем доходность за всю игру
        player_id = player["player_id"]
        
        # Инициализируем историю, если её нет
        if player_id not in player_capitalization_history:
            player_capitalization_history[player_id] = {
                "previous": player["total_value"],
                "initial": player["total_value"]
            }
        
        history = player_capitalization_history[player_id]
        initial_value = history.get("initial", player["total_value"])
        
        if initial_value > 0:
            growth_game = ((player["total_value"] - initial_value) / initial_value) * 100
        else:
            growth_game = 0
        
        player_data["growth_game_percent"] = round(growth_game, 2)
        
        # Округляем все значения до целых
        player_data["money"] = int(round(player_data["money"]))
        player_data["resources_value"] = int(round(player_data["resources_value"]))
        player_data["buildings_value"] = int(round(player_data["buildings_value"]))
        player_data["total_value"] = int(round(player_data["total_value"]))
        result.append(player_data)
    
    # Сохраняем текущий рейтинг и позиции для следующего запроса
    previous_leaderboard = current_leaderboard.copy()
    global previous_leaderboard_ranks
    previous_leaderboard_ranks = {}
    for idx, player in enumerate(current_leaderboard):
        previous_leaderboard_ranks[player["player_id"]] = idx + 1
    
    return {"leaderboard": result}

@app.get("/api/prices")
async def get_prices():
    """Получить текущие цены с изменениями"""
    ensure_game_loaded()
    
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    current_prices = game_instance.current_prices
    global initial_prices
    
    # Получаем предыдущие цены
    # round_history содержит цены ПОСЛЕ обработки раунда
    # Для получения предыдущих цен нужно взять цены из предыдущего элемента истории
    previous_prices = {}
    if len(game_instance.round_history) >= 2:
        # Берем цены из предпоследнего раунда (предыдущего)
        previous_prices = game_instance.round_history[-2].get("prices", initial_prices.copy())
    elif len(game_instance.round_history) == 1:
        # Если это второй раунд, предыдущие цены - начальные (до первого раунда)
        previous_prices = initial_prices.copy()
    else:
        # Первый раунд - предыдущих цен нет, используем начальные
        previous_prices = initial_prices.copy()
    
    result = []
    for resource, current_price in sorted(current_prices.items()):
        initial_price = initial_prices.get(resource, current_price)
        prev_price = previous_prices.get(resource, current_price)
        
        # Изменение от предыдущего раунда
        if prev_price > 0:
            change_from_prev = ((current_price - prev_price) / prev_price) * 100
        else:
            change_from_prev = 0
        
        # Изменение с начала игры
        if initial_price > 0:
            change_from_start = ((current_price - initial_price) / initial_price) * 100
        else:
            change_from_start = 0
        
        result.append({
            "resource": resource,
            "current_price": int(round(current_price)),
            "change_from_prev_percent": round(change_from_prev, 2),
            "change_from_start_percent": round(change_from_start, 2)
        })
    
    return {"prices": result}

@app.get("/api/buildings")
async def get_buildings():
    """Получить статистику по построенным объектам"""
    ensure_game_loaded()
    
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    building_counts = {}
    players_with_building = {}  # Сколько игроков имеют хотя бы один такой объект
    
    for player in game_instance.players:
        player_buildings = set()  # Уникальные объекты игрока
        for building in player.buildings:
            if building.status.value != "for_sale" and building.status.value != "sold":
                building_counts[building.name] = building_counts.get(building.name, 0) + 1
                player_buildings.add(building.name)
        
        # Подсчитываем игроков с каждым объектом
        for building_name in player_buildings:
            players_with_building[building_name] = players_with_building.get(building_name, 0) + 1
    
    result = []
    num_players = len(game_instance.players)
    for building_name, count in sorted(building_counts.items()):
        players_count = players_with_building.get(building_name, 0)
        players_percentage = round((players_count / num_players) * 100) if num_players > 0 else 0
        
        result.append({
            "name": building_name,
            "count": count,
            "players_percentage": players_percentage
        })
    
    return {"buildings": result}

@app.get("/api/resource/{resource_name}")
async def get_resource_details(resource_name: str):
    """Получить детальную информацию о ресурсе, включая историю цен и спрос/предложение"""
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    # Декодируем имя ресурса из URL (для кириллицы)
    resource_name = unquote(resource_name)
    
    global initial_prices
    
    # Получаем текущую цену
    current_price = game_instance.current_prices.get(resource_name, 0)
    initial_price = initial_prices.get(resource_name, current_price)
    
    # Получаем предыдущие цены для расчета изменений
    previous_prices = {}
    if len(game_instance.round_history) >= 2:
        previous_prices = game_instance.round_history[-2].get("prices", initial_prices.copy())
    elif len(game_instance.round_history) == 1:
        previous_prices = initial_prices.copy()
    else:
        previous_prices = initial_prices.copy()
    
    prev_price = previous_prices.get(resource_name, current_price)
    
    # Изменение от предыдущего раунда
    if prev_price > 0:
        change_from_prev = ((current_price - prev_price) / prev_price) * 100
    else:
        change_from_prev = 0
    
    # Изменение с начала игры
    if initial_price > 0:
        change_from_start = ((current_price - initial_price) / initial_price) * 100
    else:
        change_from_start = 0
    
    # История цен (с начала игры до текущего раунда)
    # Стандартизация: в точке 0 (раунд 0) цена = 0
    price_history = []
    price_history.append({"round": 0, "price": 0})  # Начальная точка - цена 0
    
    for i, round_data in enumerate(game_instance.round_history, start=1):
        round_prices = round_data.get("prices", {})
        price = round_prices.get(resource_name, initial_price)
        price_history.append({"round": i, "price": price})
    
    # Добавляем текущую цену
    price_history.append({"round": game_instance.current_round, "price": current_price})
    
    # Определяем уровень спроса и предложения
    num_players = len(game_instance.players)
    players_bought = game_instance.previous_round_players_bought.get(resource_name, 0)
    players_sold = game_instance.previous_round_players_sold.get(resource_name, 0)
    
    # Спрос (по логике из market_dynamics.py: >75% высокий, >25% средний, иначе низкий)
    if num_players > 0:
        demand_percent = (players_bought / num_players) * 100
        if demand_percent > 75:
            demand_level = "высокий"
        elif demand_percent > 25:
            demand_level = "базовый"
        else:
            demand_level = "низкий"
    else:
        demand_level = "базовый"
    
    # Предложение (по логике из market_dynamics.py: >75% высокое, >25% среднее, иначе низкое)
    if num_players > 0:
        supply_percent = (players_sold / num_players) * 100
        if supply_percent > 75:
            supply_level = "высокое"
        elif supply_percent > 25:
            supply_level = "базовое"
        else:
            supply_level = "низкое"
    else:
        supply_level = "базовое"
    
    return {
        "name": resource_name,
        "current_price": int(round(current_price)),
        "change_from_prev_percent": round(change_from_prev, 2),
        "change_from_start_percent": round(change_from_start, 2),
        "demand_level": demand_level,
        "supply_level": supply_level,
        "price_history": price_history
    }

@app.get("/api/building/{building_name}")
async def get_building_details(building_name: str):
    """Получить детальную информацию об объекте, включая список владельцев"""
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    # Подсчитываем общее количество объектов
    total_count = 0
    owners = {}  # {player_id: {name: str, count: int}}
    
    for player in game_instance.players:
        player_building_count = 0
        for building in player.buildings:
            if building.name == building_name and building.status.value != "for_sale" and building.status.value != "sold":
                total_count += 1
                player_building_count += 1
        
        if player_building_count > 0:
            owners[player.id] = {
                "name": player.character_name or player.name,
                "character_name": player.character_name,
                "count": player_building_count
            }
    
    # Подсчитываем процент игроков
    num_players = len(game_instance.players)
    players_count = len(owners)
    players_percentage = round((players_count / num_players) * 100) if num_players > 0 else 0
    
    # Сортируем владельцев по количеству объектов (от большего к меньшему)
    owners_list = sorted(owners.values(), key=lambda x: x["count"], reverse=True)
    
    return {
        "name": building_name,
        "count": total_count,
        "players_percentage": players_percentage,
        "owners": owners_list
    }

@app.get("/api/game_state")
async def get_game_state():
    """Получить полное состояние игры"""
    ensure_game_loaded()
    
    if not game_instance:
        return {"error": "Игра не инициализирована"}
    
    leaderboard_data = await get_leaderboard()
    prices_data = await get_prices()
    buildings_data = await get_buildings()
    
    return {
        "current_round": game_instance.current_round,
        "num_players": len(game_instance.players),
        "leaderboard": leaderboard_data,
        "prices": prices_data,
        "buildings": buildings_data
    }

# Обходной путь для получения сводки по раунду
@app.get("/api/round-summary/{round_number}")
async def get_round_summary_alt(round_number: int):
    """Альтернативный endpoint для получения сводки по раунду"""
    # Вызываем основную функцию
    return await get_round_summary(round_number)

@app.post("/api/game/set-round")
async def set_round(request: Request):
    """Установить текущий раунд"""
    try:
        ensure_game_loaded()
        
        if not game_instance:
            raise HTTPException(status_code=500, detail="Игра не инициализирована")
        
        data = await request.json()
        round_number = data.get("round")
        
        if not round_number or round_number < 1:
            raise HTTPException(status_code=400, detail="Некорректный номер раунда")
        
        # Если устанавливаем раунд 1, просто устанавливаем его
        if round_number == 1:
            game_instance.current_round = 1
            game_instance.start_round()
        else:
            # Для других раундов нужно обработать предыдущие раунды
            # чтобы применить события и обновить цены
            while game_instance.current_round < round_number:
                game_instance.process_round()
        
        return {
            "success": True,
            "current_round": game_instance.current_round
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка в set_round: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка: {str(e)}")

@app.post("/api/game/next-round")
async def next_round():
    """Перейти к следующему раунду"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    # Обрабатываем текущий раунд (применяем события, обновляем цены, начисляем доходы)
    # process_round() в конце увеличит current_round на 1 и сохранит в БД
    result = game_instance.process_round()
    
    # Отправляем обновление всем WebSocket клиентам
    await broadcast_update()
    
    return {
        "success": True,
        "current_round": game_instance.current_round,
        "events": result.get("events")
    }

@app.get("/api/game/snapshots")
async def get_available_snapshots():
    """Получить список доступных снимков"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    snapshots = database.get_available_snapshots(game_instance.game_id)
    
    return {
        "snapshots": snapshots,
        "current_round": game_instance.current_round
    }

@app.post("/api/game/rollback")
async def rollback_to_round(request: Request):
    """Откатить игру на указанный раунд"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    data = await request.json()
    target_round = data.get("round_number")
    
    if not target_round:
        raise HTTPException(status_code=400, detail="Не указан номер раунда")
    
    if target_round >= game_instance.current_round:
        raise HTTPException(
            status_code=400, 
            detail=f"Нельзя откатиться на раунд {target_round}, текущий раунд {game_instance.current_round}"
        )
    
    # Загружаем снимок
    snapshot = database.load_game_snapshot(game_instance.game_id, target_round)
    if not snapshot:
        raise HTTPException(
            status_code=404, 
            detail=f"Снимок для раунда {target_round} не найден"
        )
    
    # Восстанавливаем состояние
    game_instance.restore_from_snapshot(snapshot)
    
    # Сохраняем восстановленное состояние
    game_instance.save_to_database()
    
    return {
        "success": True,
        "message": f"Игра откачена на раунд {target_round}",
        "current_round": game_instance.current_round
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket для обновлений в реальном времени"""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Отправляем обновление каждую секунду
            state = await get_game_state()
            await websocket.send_json(state)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        active_connections.remove(websocket)

async def broadcast_update():
    """Отправить обновление всем подключенным клиентам"""
    if not active_connections:
        return
    
    # Обновляем историю капитализации игроков перед отправкой
    if game_instance:
        update_capitalization_history()
    
    state = await get_game_state()
    
    disconnected = []
    for connection in active_connections:
        try:
            await connection.send_json(state)
        except:
            disconnected.append(connection)
    
    for conn in disconnected:
        if conn in active_connections:
            active_connections.remove(conn)

def update_capitalization_history():
    """Обновить историю капитализации всех игроков"""
    global player_capitalization_history
    
    if not game_instance:
        return
    
    leaderboard = game_instance.get_leaderboard()
    for player_data in leaderboard:
        player_id = player_data["player_id"]
        total_value = player_data["total_value"]
        
        if player_id not in player_capitalization_history:
            player_capitalization_history[player_id] = {
                "previous": total_value,
                "initial": total_value
            }
        else:
            # Обновляем предыдущее значение
            player_capitalization_history[player_id]["previous"] = total_value

# ========== TELEGRAM MINI APP API ==========

def verify_telegram_auth(init_data: str) -> Optional[Dict]:
    """
    Проверка авторизации через Telegram WebApp API
    В продакшене нужно использовать секретный ключ бота
    Для тестирования упрощенная проверка
    """
    # Тестовый режим
    if init_data == 'test_init_data':
        return {
            'id': 12345,
            'first_name': 'Тестовый',
            'last_name': 'Игрок',
            'username': 'test_player',
            'language_code': 'ru',
            'photo_url': 'https://via.placeholder.com/200'
        }
    
    try:
        # Парсим init_data (может быть query string или просто строка)
        if 'user=' in init_data:
            params = parse_qs(init_data)
            # Извлекаем данные пользователя
            user_str = params.get('user', [None])[0]
            if user_str:
                user = json.loads(unquote(user_str))
                return user
        else:
            # Если init_data - это просто JSON строка с user
            try:
                user = json.loads(init_data)
                if 'id' in user:
                    return user
            except:
                pass
        
        return None
    except Exception as e:
        print(f"Ошибка проверки авторизации: {e}")
        return None

def get_player_id_from_telegram(init_data: str) -> Optional[str]:
    """Получить player_id из Telegram данных"""
    # Пытаемся распарсить initData для получения user ID (включая тестовый режим)
    try:
        # Если initData содержит user=, извлекаем его
        if 'user=' in init_data:
            # Парсим query string
            from urllib.parse import parse_qs, unquote
            parsed = parse_qs(init_data)
            if 'user' in parsed:
                user_str = parsed['user'][0]
                import json
                user_data = json.loads(unquote(user_str))
                if 'id' in user_data:
                    return f"tg_{user_data['id']}"
    except Exception as e:
        print(f"Ошибка парсинга initData: {e}")
        pass
    
    # Тестовый режим - используем дефолтный ID только если не удалось распарсить
    if init_data == 'test_init_data':
        return "tg_12345"
    
    # Пытаемся верифицировать через Telegram
    user = verify_telegram_auth(init_data)
    if not user:
        return None
    return f"tg_{user.get('id')}"

@app.get("/api/miniapp/player/state")
async def get_player_state(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Получить состояние игрока"""
    try:
        ensure_game_loaded()
        
        if not game_instance:
            raise HTTPException(status_code=500, detail="Игра не инициализирована")
        
        # В тестовом режиме разрешаем работу без заголовка
        if not x_telegram_init_data:
            x_telegram_init_data = 'test_init_data'
        
        try:
            player_id = get_player_id_from_telegram(x_telegram_init_data)
            if not player_id:
                # В тестовом режиме используем дефолтный ID
                player_id = "tg_12345"
        except Exception as e:
            print(f"Ошибка получения player_id: {e}")
            player_id = "tg_12345"  # Fallback для тестового режима
        
        player = game_instance.get_player(player_id)
        if not player:
            # Игрок не найден - нужно авторизоваться
            return {
                "player_id": None,
                "nickname": None,
                "photo_url": None,
                "character_name": None,
                "character_image": None,
                "money": 0,
                "resources": {},
                "buildings": []
            }
        
        # Формируем ответ
        buildings_data = []
        for building in player.buildings:
            buildings_data.append({
                "id": building.id,
                "name": building.name,
                "status": building.status.value
            })
        
        # Рассчитываем капитализацию (как в get_leaderboard)
        resources_value = sum(
            amount * game_instance.current_prices.get(resource, 0)
            for resource, amount in player.resources.items()
        )
        
        buildings_value = sum(
            game_instance.calculate_building_sale_price(building)
            for building in player.buildings
            if building.status.value != "for_sale" and building.status.value != "sold"
        )
        
        total_value = player.money + resources_value + buildings_value
        
        # Рассчитываем приросты
        global player_capitalization_history
        
        # Получаем или создаем историю капитализации игрока
        if player_id not in player_capitalization_history:
            # Первый раз - сохраняем как начальное и предыдущее значение
            player_capitalization_history[player_id] = {
                "previous": total_value,
                "initial": total_value,
                "last_round": game_instance.current_round
            }
        
        history = player_capitalization_history[player_id]
        
        # Если раунд изменился, обновляем предыдущее значение
        if history.get("last_round", 0) < game_instance.current_round:
            history["previous"] = history.get("current", total_value)
            history["last_round"] = game_instance.current_round
        
        # Сохраняем текущее значение
        history["current"] = total_value
        
        prev_capitalization = history.get("previous", total_value)
        initial_capitalization = history.get("initial", total_value)
        
        # Прирост за раунд
        if prev_capitalization and prev_capitalization > 0:
            growth_round = ((total_value - prev_capitalization) / prev_capitalization) * 100
        else:
            growth_round = 0
        
        # Прирост за игру
        if initial_capitalization > 0:
            growth_game = ((total_value - initial_capitalization) / initial_capitalization) * 100
        else:
            growth_game = 0
        
        # Обновляем предыдущее значение только если раунд изменился
        # (будет обновляться через update_capitalization_history при обработке раунда)
        
        # Добавляем стоимость каждого объекта
        buildings_with_value = []
        for building in buildings_data:
            building_obj = next((b for b in player.buildings if b.id == building["id"]), None)
            if building_obj:
                if building_obj.status.value == "for_sale" or building_obj.status.value == "sold":
                    # Объект на продаже или продан - не учитываем в капитализации (value = 0)
                    building["value"] = 0
                else:
                    # Объект не на продаже - считаем его стоимость
                    building_value = game_instance.calculate_building_sale_price(building_obj)
                    building["value"] = int(round(building_value))
            else:
                building["value"] = 0
            buildings_with_value.append(building)
        
        return {
            "player_id": player.id,
            "name": player.name,
            "nickname": player.character_name or player.nickname,  # Для обратной совместимости
            "photo_url": player.character_image or player.photo_url,  # Для обратной совместимости
            "character_name": player.character_name,
            "character_image": player.character_image,
            "money": int(round(player.money)),
            "resources": player.resources.copy(),
            "buildings": buildings_with_value,
            "capitalization": int(round(total_value)),
            "growth_round_percent": round(growth_round, 2),
            "growth_game_percent": round(growth_game, 2)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка в get_player_state: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка: {str(e)}")

@app.get("/api/miniapp/characters/taken")
async def get_taken_characters():
    """Получить список уже выбранных персонажей"""
    try:
        ensure_game_loaded()
        
        if not game_instance:
            return {"taken_characters": []}
        
        taken_characters = []
        for player in game_instance.players:
            if player.character_name:
                taken_characters.append({
                    "name": player.character_name,
                    "image": player.character_image or ""
                })
        
        return {"taken_characters": taken_characters}
    except Exception as e:
        print(f"Ошибка в get_taken_characters: {e}")
        import traceback
        traceback.print_exc()
        return {"taken_characters": []}  # Возвращаем пустой список при ошибке

@app.post("/api/miniapp/player/auth")
async def save_player_auth(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Сохранить данные авторизации игрока (никнейм и фото)"""
    try:
        ensure_game_loaded()
        
        if not game_instance:
            raise HTTPException(status_code=500, detail="Игра не инициализирована")
        
        # В тестовом режиме разрешаем работу без заголовка
        if not x_telegram_init_data:
            x_telegram_init_data = 'test_init_data'
        
        try:
            player_id = get_player_id_from_telegram(x_telegram_init_data)
            if not player_id:
                # В тестовом режиме используем дефолтный ID
                player_id = "tg_12345"
        except Exception as e:
            print(f"Ошибка получения player_id: {e}")
            player_id = "tg_12345"  # Fallback для тестового режима
        
        data = await request.json()
        
        # Поддержка как старого формата (nickname/photo_url), так и нового (character_name/character_image)
        character_name = data.get("character_name", "").strip()
        character_image = data.get("character_image")
        nickname = data.get("nickname", "").strip()  # Для обратной совместимости
        photo_url = data.get("photo_url")  # Для обратной совместимости
        
        # Если используется новый формат
        if character_name:
            if len(character_name) < 2:
                return {"success": False, "message": "Имя персонажа должно быть не менее 2 символов"}
            
            # Проверяем, не выбран ли этот персонаж уже другим игроком
            for player in game_instance.players:
                if player.id != player_id and player.character_name == character_name:
                    return {"success": False, "message": "Этот персонаж уже выбран другим игроком"}
        # Если используется старый формат
        elif nickname:
            if len(nickname) < 2:
                return {"success": False, "message": "Никнейм должен быть не менее 2 символов"}
            character_name = nickname
            character_image = photo_url
        else:
            return {"success": False, "message": "Необходимо указать персонажа или никнейм"}
        
        # Проверяем, существует ли игрок
        player = game_instance.get_player(player_id)
        if not player:
            # Создаем нового игрока
            try:
                user = verify_telegram_auth(x_telegram_init_data)
                default_name = user.get('first_name', user.get('username', 'Игрок')) if user else 'Игрок'
            except:
                # В тестовом режиме используем дефолтное имя
                default_name = 'Игрок'
            game_instance.add_player(player_id, default_name)
            player = game_instance.get_player(player_id)
        
        # Обновляем данные персонажа
        player.character_name = character_name
        player.character_image = character_image
        # Для обратной совместимости также обновляем nickname и photo_url
        if not player.nickname:
            player.nickname = character_name
        if not player.photo_url:
            player.photo_url = character_image
        
        # Сохраняем изменения в БД
        game_instance.save_to_database()
        
        return {
            "success": True,
            "message": "Персонаж выбран успешно",
            "player_id": player_id,
            "character_name": character_name,
            "character_image": character_image,
            "nickname": character_name,  # Для обратной совместимости
            "photo_url": character_image  # Для обратной совместимости
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Ошибка сохранения персонажа: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {str(e)}")

@app.get("/api/miniapp/prices")
async def get_miniapp_prices():
    """Получить текущие цены с изменениями"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    result = []
    initial_prices = RESOURCE_PRICES.copy()
    
    for resource, current_price in sorted(game_instance.current_prices.items()):
        # Получаем предыдущую цену
        if len(game_instance.round_history) >= 2:
            previous_prices = game_instance.round_history[-2].get("prices", initial_prices.copy())
        elif len(game_instance.round_history) == 1:
            previous_prices = initial_prices.copy()
        else:
            previous_prices = initial_prices.copy()
        
        prev_price = previous_prices.get(resource, current_price)
        initial_price = initial_prices.get(resource, current_price)
        
        # Изменение от предыдущего раунда
        if prev_price > 0:
            change_from_prev = ((current_price - prev_price) / prev_price) * 100
        else:
            change_from_prev = 0
        
        # Изменение с начала игры
        if initial_price > 0:
            change_from_start = ((current_price - initial_price) / initial_price) * 100
        else:
            change_from_start = 0
        
        result.append({
            "resource": resource,
            "current_price": int(round(current_price)),
            "change_from_prev_percent": round(change_from_prev, 2),
            "change_from_start_percent": round(change_from_start, 2)
        })
    
    return {"prices": result}

@app.get("/api/miniapp/leaderboard")
async def get_miniapp_leaderboard():
    """Получить рейтинг игроков с информацией об изменении позиций и капитализации"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    leaderboard = game_instance.get_leaderboard()
    
    # Используем сохраненные предыдущие позиции
    global previous_leaderboard_ranks, player_capitalization_history
    
    # Добавляем nickname, информацию об изменении позиции и росте капитализации
    leaderboard_data = []
    for idx, player_data in enumerate(leaderboard):
        player = game_instance.get_player(player_data["player_id"])
        if player:
            current_rank = idx + 1
            prev_rank = previous_leaderboard_ranks.get(player_data["player_id"])
            
            # Определяем изменение позиции
            rank_change = None  # None = без изменений, "up" = поднялся, "down" = опустился
            if prev_rank:
                if current_rank < prev_rank:
                    rank_change = "up"
                elif current_rank > prev_rank:
                    rank_change = "down"
                # else: rank_change остается None (без изменений)
            
            # Рассчитываем рост капитализации
            total_value = player_data["total_value"]
            history = player_capitalization_history.get(player_data["player_id"], {})
            prev_value = history.get("previous", total_value)
            initial_value = history.get("initial", total_value)
            
            # Рост за раунд
            if prev_value > 0:
                growth_round = ((total_value - prev_value) / prev_value) * 100
            else:
                growth_round = 0
            
            # Рост за игру
            if initial_value > 0:
                growth_game = ((total_value - initial_value) / initial_value) * 100
            else:
                growth_game = 0
            
            leaderboard_data.append({
                "player_id": player_data["player_id"],
                "name": player_data["name"],
                "character_name": getattr(player, 'character_name', None),
                "nickname": player.nickname,
                "total_value": int(round(player_data["total_value"])),
                "rank_change": rank_change,
                "growth_round_percent": round(growth_round, 2),
                "growth_game_percent": round(growth_game, 2)
            })
    
    # Обновляем сохраненные позиции для следующего запроса
    previous_leaderboard_ranks = {}
    for idx, player_data in enumerate(leaderboard):
        previous_leaderboard_ranks[player_data["player_id"]] = idx + 1
    
    return {"leaderboard": leaderboard_data}

@app.get("/api/miniapp/round-info")
async def get_round_info():
    """Получить информацию о текущем раунде"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    return {
        "current_round": game_instance.current_round,
        "num_players": len(game_instance.players)
    }

@app.get("/api/miniapp/buildings")
async def get_available_buildings(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Получить список доступных объектов для строительства"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    player = game_instance.get_player(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    result = []
    for building_name, costs in BUILDING_COSTS.items():
        can_build = player.has_resources(costs)
        cost = game_instance.calculate_building_cost(building_name)
        
        # Формируем описание стоимости
        cost_details = []
        for resource, amount in costs.items():
            cost_details.append(f"{amount} {resource}")
        
        result.append({
            "name": building_name,
            "cost": int(round(cost)),
            "cost_details": ", ".join(cost_details),
            "can_build": can_build
        })
    
    return {"buildings": result}

@app.post("/api/miniapp/player/buy-resource")
async def buy_resource_miniapp(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Купить ресурс"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    data = await request.json()
    resource = data.get("resource")
    # Поддержка обоих вариантов: quantity (из miniapp) и amount (для совместимости)
    quantity = data.get("quantity") or data.get("amount", 1)
    
    result = game_instance.buy_resource(player_id, resource, quantity)
    result["cost"] = int(round(result.get("cost", 0)))
    
    return result

@app.post("/api/miniapp/player/sell-resource")
async def sell_resource_miniapp(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Продать ресурс"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    data = await request.json()
    resource = data.get("resource")
    # Поддержка обоих вариантов: quantity (из miniapp) и amount (для совместимости)
    quantity = data.get("quantity") or data.get("amount", 1)
    
    result = game_instance.sell_resource(player_id, resource, quantity)
    result["income"] = int(round(result.get("income", 0)))
    
    return result

@app.post("/api/miniapp/player/build")
async def build_miniapp(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Построить объект"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    data = await request.json()
    building_name = data.get("building_name")
    
    result = game_instance.start_building(player_id, building_name)
    return result

@app.post("/api/miniapp/player/sell-building")
async def sell_building_miniapp(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Продать объект"""
    ensure_game_loaded()
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    data = await request.json()
    building_id = data.get("building_id")
    
    result = game_instance.put_building_for_sale(player_id, building_id)
    return result

# ========== ТЕСТОВЫЕ API ENDPOINTS ==========

def get_test_player_id(x_telegram_init_data: Optional[str], user_id: Optional[int] = None) -> str:
    """Получить player_id для тестового режима"""
    # Если передан user_id напрямую (из initDataUnsafe), используем его
    if user_id:
        return f"tg_{user_id}"
    
    if x_telegram_init_data == 'test_init_data':
        # В тестовом режиме используем фиксированный ID или из заголовка
        return "tg_12345"
    return get_player_id_from_telegram(x_telegram_init_data) or "tg_12345"

@app.post("/api/miniapp/test/reset")
async def test_reset_game(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Сбросить тестовую игру"""
    global game_instance
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    # Создаем новую тестовую игру (копируем логику из test_miniapp.py)
    new_game = Game(num_players=30)
    new_game.add_player("tg_12345", "Тестовый Игрок")
    test_player = new_game.get_player("tg_12345")
    if test_player:
        test_player.nickname = "Тестовый Игрок"
        test_player.photo_url = "https://via.placeholder.com/200"
        test_player.add_resource("дерево", 10)
        test_player.add_resource("камень", 10)
        test_player.add_resource("железо", 5)
        test_player.money = 2000
    
    for i in range(2, 6):
        new_game.add_player(f"player{i}", f"Игрок {i}")
    
    if test_player:
        new_game.buy_resource("tg_12345", "железо", 5)
        new_game.buy_resource("tg_12345", "рабы", 3)
        new_game.start_building("tg_12345", "Лесоповал")
    
    new_game.process_round()
    
    game_instance = new_game
    set_game(new_game)
    
    return {"success": True, "message": "Игра сброшена"}

@app.post("/api/miniapp/test/add-money")
async def test_add_money(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Добавить деньги тестовому игроку"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    player_id = get_test_player_id(x_telegram_init_data)
    player = game_instance.get_player(player_id)
    
    if not player:
        return {"success": False, "message": "Игрок не найден"}
    
    player.money += 1000
    return {"success": True, "message": "Добавлено 1000 монет", "new_balance": int(round(player.money))}

@app.post("/api/miniapp/test/add-resources")
async def test_add_resources(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Добавить ресурсы тестовому игроку"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    player_id = get_test_player_id(x_telegram_init_data)
    player = game_instance.get_player(player_id)
    
    if not player:
        return {"success": False, "message": "Игрок не найден"}
    
    resources = ["камень", "дерево", "железо", "скот", "овощи", "рабы", "золото", "зерно", "рыба"]
    for resource in resources:
        player.add_resource(resource, 10)
    
    return {"success": True, "message": "Добавлено по 10 каждого ресурса"}

@app.get("/api/miniapp/market/building/{building_name}")
async def get_market_building_details(
    building_name: str,
    request: Request,
    x_telegram_init_data: Optional[str] = Header(None)
):
    """Получить детальную информацию об объекте на бирже (данные на предыдущий раунд)"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    player = game_instance.get_player(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    # Декодируем название объекта
    building_name = unquote(building_name)
    
    # Получаем данные на предыдущий раунд из истории
    # Если история пуста, используем текущие данные
    if len(game_instance.round_history) > 0:
        # Берем данные из последнего завершенного раунда
        last_round_data = game_instance.round_history[-1]
        # В истории нет информации о зданиях, поэтому используем текущие данные
        # но это данные на момент начала текущего раунда (т.е. на конец предыдущего)
        pass
    
    # Подсчитываем количество объектов на бирже (исключая объекты на продаже)
    building_count = 0
    players_with_building = set()
    owners_list = []  # Список владельцев с количеством объектов
    
    for p in game_instance.players:
        player_buildings = [b for b in p.buildings if b.name == building_name and b.status.value != "for_sale" and b.status.value != "sold"]
        if player_buildings:
            building_count += len(player_buildings)
            players_with_building.add(p.id)
            owners_list.append({
                "player_id": p.id,
                "name": p.nickname or p.name,
                "count": len(player_buildings)
            })
    
    num_players = len(game_instance.players)
    players_percentage = round((len(players_with_building) / num_players) * 100) if num_players > 0 else 0
    
    # Получаем стоимость объекта в ресурсах
    from game_config import BUILDING_COSTS, RESOURCE_PRICES
    building_costs = BUILDING_COSTS.get(building_name, {})
    cost_in_coins = sum(amount * game_instance.current_prices.get(resource, RESOURCE_PRICES.get(resource, 0)) 
                        for resource, amount in building_costs.items())
    
    # Сколько таких объектов у игрока
    player_buildings = [b for b in player.buildings if b.name == building_name]
    player_count = len(player_buildings)
    
    # Получаем информацию о доходе объекта
    from game_config import BUILDING_INCOME
    building_income = BUILDING_INCOME.get(building_name, {"монеты": 0, "ресурсы": {}})
    
    return {
        "name": building_name,
        "count": building_count,
        "players_percentage": players_percentage,
        "cost_resources": building_costs,
        "cost_coins": int(round(cost_in_coins)),
        "player_count": player_count,
        "owners": owners_list,
        "income": building_income
    }

@app.get("/api/miniapp/player/building/{building_name}")
async def get_player_building_details(
    building_name: str,
    request: Request,
    x_telegram_init_data: Optional[str] = Header(None)
):
    """Получить детальную информацию об объекте игрока"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Не авторизован")
    
    player_id = get_player_id_from_telegram(x_telegram_init_data)
    if not player_id:
        raise HTTPException(status_code=401, detail="Неверная авторизация")
    
    player = game_instance.get_player(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден")
    
    # Декодируем название объекта
    building_name = unquote(building_name)
    
    # Находим все объекты этого типа у игрока
    player_buildings = [b for b in player.buildings if b.name == building_name]
    if not player_buildings:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    # Группируем по статусу
    buildings_by_status = {}
    for building in player_buildings:
        status = building.status.value
        if status not in buildings_by_status:
            buildings_by_status[status] = []
        buildings_by_status[status].append(building)
    
    # Получаем статус из запроса (если указан)
    status_param = request.query_params.get('status')
    if status_param:
        buildings = buildings_by_status.get(status_param, [])
    else:
        # Берем первый доступный статус
        buildings = list(buildings_by_status.values())[0] if buildings_by_status else []
    
    if not buildings:
        raise HTTPException(status_code=404, detail="Объект с таким статусом не найден")
    
    building = buildings[0]
    count = len(buildings)
    
    # Рассчитываем капитализацию
    # Для объектов "на продаже" используем зафиксированную цену продажи
    # Для активных объектов - текущую стоимость
    if building.status.value == "for_sale" and building.sale_price is not None:
        building_value = building.sale_price
    elif building.status.value == "sold":
        # Проданный объект - стоимость 0
        building_value = 0
    elif building.status.value != "for_sale" and building.status.value != "sold":
        building_value = game_instance.calculate_building_sale_price(building)
    else:
        # Если объект на продаже, но sale_price не установлен (не должно происходить)
        building_value = 0
    total_capitalization = building_value * count
    
    # Рассчитываем реальные доходы из истории раундов
    # Доход за предыдущий раунд (из последнего завершенного раунда)
    # Для объектов "на продаже" показываем доходы так же, как для активных (объект еще не продан)
    # Проданные объекты (SOLD) не приносят доход
    income_per_round = {"монеты": 0, "ресурсы": {}}
    if len(game_instance.round_history) > 0 and building.status.value == "active":
        # Берем доход из последнего завершенного раунда
        last_round_income = game_instance.round_history[-1].get("income", {})
        player_income = last_round_income.get("income_distributed", {}).get(player_id, {})
        
        # Получаем базовый доход из конфига для этого объекта
        from game_config import BUILDING_INCOME
        income_config = BUILDING_INCOME.get(building_name, {"монеты": 0, "ресурсы": {}})
        
        # Считаем, сколько объектов этого типа было активных в предыдущем раунде
        # Только ACTIVE объекты приносят доход
        active_buildings_count = len([b for b in player_buildings 
                                     if b.status.value == "active"])
        
        if active_buildings_count > 0:
            # Доход за раунд (на все объекты этого типа)
            income_per_round = {
                "монеты": income_config.get("монеты", 0) * active_buildings_count,
                "ресурсы": {k: v * active_buildings_count for k, v in income_config.get("ресурсы", {}).items()}
            }
    
    # Доход за всю игру - суммируем реально выплаченные доходы из завершенных раундов
    # (не включая текущий раунд, так как он еще не завершен)
    income_per_game = {"монеты": 0, "ресурсы": {}}
    
    # Определяем, с какого раунда объект стал активным
    # Только ACTIVE объекты приносят доход
    active_from_round = None
    if building.status.value == "active" and hasattr(building, 'completed_round') and building.completed_round:
        active_from_round = building.completed_round
    elif building.status.value == "active":
        # Если нет информации, считаем что активен с раунда 1
        active_from_round = 1
    
    if active_from_round:
        # Получаем базовый доход из конфига для расчета пропорции
        from game_config import BUILDING_INCOME
        income_config = BUILDING_INCOME.get(building_name, {"монеты": 0, "ресурсы": {}})
        
        # Суммируем доходы только из завершенных раундов (round_history)
        # round_history содержит только завершенные раунды, текущий раунд еще не завершен
        for round_data in game_instance.round_history:
            round_num = round_data.get("round", 0)
            
            # Проверяем, был ли объект активен в этом раунде
            # Объект активен, если round_num >= active_from_round
            if round_num >= active_from_round:
                # Получаем реально выплаченные доходы игрока из этого раунда
                round_income = round_data.get("income", {})
                player_round_income = round_income.get("income_distributed", {}).get(player_id, {})
                
                # Получаем реальные выплаченные доходы
                real_coins = player_round_income.get("монеты", 0)
                real_resources = player_round_income.get("ресурсы", {})
                
                # Рассчитываем долю этого объекта в общем доходе игрока
                # Для этого считаем, сколько объектов этого типа было активных в том раунде
                # (используем текущее количество как приближение)
                # Только ACTIVE объекты приносят доход
                active_count = len([b for b in player_buildings 
                                   if b.status.value == "active"])
                
                # Считаем общий базовый доход от всех активных объектов игрока в том раунде
                # (для расчета пропорции)
                total_base_income_coins = 0
                total_base_income_resources = {}
                
                # Проходим по всем активным объектам игрока
                for b in player_buildings:
                    if b.status.value == "active":
                        b_income = BUILDING_INCOME.get(b.name, {"монеты": 0, "ресурсы": {}})
                        total_base_income_coins += b_income.get("монеты", 0)
                        for res, amt in b_income.get("ресурсы", {}).items():
                            if res not in total_base_income_resources:
                                total_base_income_resources[res] = 0
                            total_base_income_resources[res] += amt
                
                # Рассчитываем долю этого объекта в общем доходе
                if total_base_income_coins > 0 or any(total_base_income_resources.values()):
                    # Доля монет
                    base_income_coins = income_config.get("монеты", 0) * active_count
                    if total_base_income_coins > 0:
                        coins_share = base_income_coins / total_base_income_coins
                        income_per_game["монеты"] += real_coins * coins_share
                    
                    # Доля ресурсов
                    for resource, amount in income_config.get("ресурсы", {}).items():
                        base_income_resource = amount * active_count
                        total_base = total_base_income_resources.get(resource, 0)
                        if total_base > 0:
                            resource_share = base_income_resource / total_base
                            real_amount = real_resources.get(resource, 0)
                            if resource not in income_per_game["ресурсы"]:
                                income_per_game["ресурсы"][resource] = 0
                            income_per_game["ресурсы"][resource] += real_amount * resource_share
                else:
                    # Если нет базового дохода, используем упрощенный расчет
                    if active_count > 0:
                        income_per_game["монеты"] += income_config.get("монеты", 0) * active_count
                        for resource, amount in income_config.get("ресурсы", {}).items():
                            if resource not in income_per_game["ресурсы"]:
                                income_per_game["ресурсы"][resource] = 0
                            income_per_game["ресурсы"][resource] += amount * active_count
    
    # Рассчитываем изменение капитализации
    # Для упрощения: используем базовую стоимость объекта
    from game_config import BUILDING_COSTS, RESOURCE_PRICES
    building_cost = BUILDING_COSTS.get(building_name, {})
    base_cost = sum(amount * RESOURCE_PRICES.get(resource, 0) for resource, amount in building_cost.items())
    base_capitalization = base_cost * count
    
    # Изменение капитализации за раунд и за игру
    if base_capitalization > 0:
        change_round = ((total_capitalization - base_capitalization) / base_capitalization) * 100
    else:
        change_round = 0
    
    change_game = change_round  # Для упрощения используем то же значение
    
    # Получаем базовый доход из конфига (как на бирже)
    from game_config import BUILDING_INCOME
    building_income = BUILDING_INCOME.get(building_name, {"монеты": 0, "ресурсы": {}})
    
    return {
        "name": building_name,
        "status": building.status.value,
        "count": count,
        "capitalization": int(round(total_capitalization)),
        "change_round_percent": round(change_round, 2),
        "change_game_percent": round(change_game, 2),
        "income_per_round": income_per_round,
        "income_per_game": income_per_game,
        "income": building_income  # Базовый доход из конфига (как на бирже)
    }

@app.post("/api/miniapp/test/create-players")
async def create_test_players():
    """Создать 10 тестовых игроков для мультиплеерного тестирования"""
    global game_instance
    
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    created_players = []
    for i in range(1, 11):
        player_id = f"tg_{10000 + i}"
        player_name = f"Игрок {i}"
        
        # Проверяем, существует ли игрок
        if not game_instance.get_player(player_id):
            game_instance.add_player(player_id, player_name)
            player = game_instance.get_player(player_id)
            if player:
                player.nickname = player_name
                created_players.append(player_id)
    
    return {
        "success": True,
        "created": created_players,
        "total": len(created_players)
    }

@app.get("/api/miniapp/characters/taken")
async def get_taken_characters():
    """Получить список уже выбранных персонажей"""
    if not game_instance:
        return {"taken_characters": []}
    
    taken_characters = []
    for player in game_instance.players:
        if player.character_name:
            taken_characters.append({
                "name": player.character_name,
                "image": player.character_image or ""
            })
    
    return {"taken_characters": taken_characters}

@app.post("/api/miniapp/test/next-round")
async def test_next_round(request: Request, x_telegram_init_data: Optional[str] = Header(None)):
    """Перейти к следующему раунду"""
    if not game_instance:
        raise HTTPException(status_code=500, detail="Игра не инициализирована")
    
    # Симулируем действия игроков
    player_id = get_test_player_id(x_telegram_init_data)
    player = game_instance.get_player(player_id)
    
    if player:
        # Тестовый игрок покупает случайный ресурс
        import random
        resources = list(game_instance.current_prices.keys())
        if resources:
            resource = random.choice(resources)
            amount = random.randint(1, 5)
            if player.money >= amount * game_instance.current_prices[resource]:
                game_instance.buy_resource(player_id, resource, amount)
    
    # Обрабатываем раунд
    result = game_instance.process_round()
    
    return {
        "success": True,
        "message": "Раунд завершен",
        "round": game_instance.current_round,
        "events": result.get("events")
    }

# Обработка favicon.ico (чтобы убрать 404 ошибки)
@app.get("/favicon.ico")
async def favicon():
    """Возвращает пустой ответ для favicon"""
    from fastapi.responses import Response
    return Response(content="", media_type="image/x-icon")

# Подключаем статические файлы
# ВАЖНО: более специфичный путь должен быть ПЕРВЫМ, иначе /static перехватит все запросы
app.mount("/static/videos", StaticFiles(directory="static/videos"), name="videos")
app.mount("/static", StaticFiles(directory="static"), name="static")

