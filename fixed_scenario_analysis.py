"""
Сценарный анализ фиксированной последовательности событий
"""
from typing import Dict, List
from game_config import RESOURCE_PRICES, BUILDING_INCOME, BUILDING_COSTS
from game_events import EventSystem, POSITIVE_EVENTS, NEGATIVE_EVENTS
from market_dynamics import MarketDynamics

# Создаем словари для быстрого поиска событий
positive_events_dict = {e["name"]: e for e in POSITIVE_EVENTS}
negative_events_dict = {e["name"]: e for e in NEGATIVE_EVENTS}

# Фиксированная последовательность событий
FIXED_EVENT_SEQUENCE = [
    None,  # Раунд 1: нет событий
    ("Урожайный год", "Лесной пожар"),  # Раунд 2
    ("День рождения короля", "Торговый караван из дальних стран"),  # Раунд 3: два позитивных!
    ("Развитие технологий", "Набег кочевников"),  # Раунд 4
    ("Король снизил налоги", "Рейд королевской стражи"),  # Раунд 5
    ("Король объявил пир", "Эпидемия"),  # Раунд 6
    ("Рыбный сезон", "Война с соседним королевством"),  # Раунд 7
    ("Добрые колдуны", "Экономический кризис"),  # Раунд 8
    ("Мирный договор с соседями", "Засуха"),  # Раунд 9
    ("Открытие золотых месторождений", "Восстание рабов"),  # Раунд 10
]

def calculate_building_cost(costs: Dict[str, int]) -> float:
    """Рассчитывает стоимость объекта в монетах"""
    total = 0
    for resource, amount in costs.items():
        total += amount * RESOURCE_PRICES.get(resource, 0)
    return total

def combine_two_positive_events(pos1: dict, pos2: dict) -> tuple:
    """
    Объединяет модификаторы от двух позитивных событий
    Если оба события влияют на один ресурс/объект, модификаторы перемножаются
    """
    resource_modifiers = {}
    building_modifiers = {}
    
    # Применяем модификаторы первого события
    for resource, modifier in pos1["resource_modifiers"].items():
        resource_modifiers[resource] = modifier
    
    for building, modifier in pos1["building_modifiers"].items():
        building_modifiers[building] = modifier
    
    # Применяем модификаторы второго события
    # Если ресурс/объект уже есть - перемножаем, иначе просто добавляем
    for resource, modifier in pos2["resource_modifiers"].items():
        if resource in resource_modifiers:
            resource_modifiers[resource] *= modifier
        else:
            resource_modifiers[resource] = modifier
    
    for building, modifier in pos2["building_modifiers"].items():
        if building in building_modifiers:
            building_modifiers[building] *= modifier
        else:
            building_modifiers[building] = modifier
    
    return resource_modifiers, building_modifiers

def simulate_fixed_scenario() -> Dict:
    """
    Симулирует игру с фиксированной последовательностью событий
    """
    # Инициализация
    current_prices = RESOURCE_PRICES.copy()
    base_prices = RESOURCE_PRICES.copy()
    price_history = [base_prices.copy()]  # История цен по раундам
    
    # Для упрощения: считаем что спрос/предложение нейтральны (только события влияют)
    # Используем MarketDynamics для расчета цен с учетом ограничений
    market = MarketDynamics(num_players=10)
    
    # Словарь для накопления доходов объектов
    building_total_income = {name: {"монеты": 0, "ресурсы": {}} for name in BUILDING_INCOME.keys()}
    
    event_system = EventSystem()
    events_details = []  # Детали событий по раундам
    
    # Симулируем каждый раунд
    for round_num in range(1, 11):
        if round_num == 1:
            # Первый раунд: нет событий
            events_details.append({
                "round": round_num,
                "positive": None,
                "negative": None,
                "resource_modifiers": {},
                "building_modifiers": {}
            })
            price_history.append(current_prices.copy())
            continue
        
        # Получаем события для раунда
        event_pair = FIXED_EVENT_SEQUENCE[round_num - 1]
        pos_name, second_name = event_pair
        
        # Получаем объекты событий
        positive_event = positive_events_dict.get(pos_name)
        if not positive_event:
            raise ValueError(f"Позитивное событие '{pos_name}' не найдено")
        
        # Специальная обработка для раунда 3 (два позитивных события)
        if round_num == 3:
            # Оба события позитивные
            second_positive_event = positive_events_dict.get(second_name)
            if not second_positive_event:
                raise ValueError(f"Второе позитивное событие '{second_name}' не найдено")
            resource_mods, building_mods = combine_two_positive_events(
                positive_event, second_positive_event
            )
            events_details.append({
                "round": round_num,
                "positive": pos_name,
                "positive2": second_name,
                "negative": None,
                "resource_modifiers": resource_mods,
                "building_modifiers": building_mods
            })
        else:
            # Обычная пара: позитивное + негативное
            negative_event = negative_events_dict.get(second_name)
            if not negative_event:
                raise ValueError(f"Негативное событие '{second_name}' не найдено")
            resource_mods, building_mods = event_system.combine_event_modifiers(
                positive_event, negative_event
            )
            events_details.append({
                "round": round_num,
                "positive": pos_name,
                "negative": second_name,
                "resource_modifiers": resource_mods,
                "building_modifiers": building_mods
            })
        
        # Применяем модификаторы к ценам через MarketDynamics
        # Используем нейтральный спрос/предложение
        neutral_bought = {res: 0 for res in RESOURCE_PRICES.keys()}
        neutral_sold = {res: 0 for res in RESOURCE_PRICES.keys()}
        
        new_prices = market.calculate_resource_prices(
            previous_prices=current_prices,
            players_bought=neutral_bought,
            players_sold=neutral_sold,
            event_modifiers=resource_mods
        )
        
        current_prices = new_prices
        price_history.append(current_prices.copy())
        
        # Рассчитываем доходы объектов с учетом модификаторов
        for building_name, base_income in BUILDING_INCOME.items():
            modifier = building_mods.get(building_name, 1.0)
            
            # Монеты
            coins = base_income.get("монеты", 0) * modifier
            building_total_income[building_name]["монеты"] += coins
            
            # Ресурсы
            for resource, amount in base_income.get("ресурсы", {}).items():
                actual_amount = amount * modifier
                if resource not in building_total_income[building_name]["ресурсы"]:
                    building_total_income[building_name]["ресурсы"][resource] = 0
                building_total_income[building_name]["ресурсы"][resource] += actual_amount
    
    # Рассчитываем итоговые изменения цен
    price_changes = {}
    for resource in base_prices.keys():
        change_percent = ((current_prices[resource] - base_prices[resource]) / base_prices[resource]) * 100
        price_changes[resource] = {
            "start": base_prices[resource],
            "end": current_prices[resource],
            "change_percent": change_percent
        }
    
    # Рассчитываем общую стоимость доходов объектов
    building_results = {}
    for building_name, income_data in building_total_income.items():
        total_value = income_data["монеты"]
        
        # Добавляем стоимость ресурсов по финальным ценам
        for resource, amount in income_data["ресурсы"].items():
            total_value += amount * current_prices[resource]
        
        # Стоимость объекта
        building_cost = calculate_building_cost(BUILDING_COSTS[building_name])
        
        building_results[building_name] = {
            "cost": building_cost,
            "total_income_coins": income_data["монеты"],
            "total_income_resources": income_data["ресурсы"].copy(),
            "total_income_value": total_value,
            "roi_percent": (total_value / building_cost * 100) if building_cost > 0 else 0
        }
    
    return {
        "price_changes": price_changes,
        "building_results": building_results,
        "events_details": events_details,
        "price_history": price_history
    }

if __name__ == "__main__":
    print("Проведение сценарного анализа фиксированной последовательности...")
    result = simulate_fixed_scenario()
    
    print("\n=== РЕЗУЛЬТАТЫ СЦЕНАРНОГО АНАЛИЗА ===\n")
    
    print("Изменения цен на ресурсы (начало → конец):")
    for resource, data in sorted(result["price_changes"].items()):
        print(f"  {resource}: {data['start']:.2f} -> {data['end']:.2f} ({data['change_percent']:+.1f}%)")
    
    print("\nДоходы объектов за 10 раундов (топ-5):")
    sorted_buildings = sorted(
        result["building_results"].items(),
        key=lambda x: x[1]["total_income_value"],
        reverse=True
    )
    for building, data in sorted_buildings[:5]:
        print(f"  {building}: {data['total_income_value']:.2f} монет (ROI: {data['roi_percent']:.1f}%)")

