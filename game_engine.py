"""
Игровой движок для "Королевская биржа"
Управляет игровым процессом, раундами, действиями игроков
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import math
from game_config import (
    RESOURCE_PRICES, BUILDING_COSTS, BUILDING_INCOME, 
    BUILDING_CONSTRUCTION_TIME, STARTING_MONEY
)
from game_events import EventSystem
from market_dynamics import MarketDynamics
import database


class BuildingStatus(Enum):
    """Статусы объектов"""
    BUILDING = "building"  # Строится
    COMPLETED = "completed"  # Построен, но еще не приносит доход
    ACTIVE = "active"  # Активен, приносит доход
    FOR_SALE = "for_sale"  # Выставлен на продажу
    SOLD = "sold"  # Продан (не приносит доход, остается в портфеле)


@dataclass
class Building:
    """Объект игрока"""
    id: str
    name: str
    started_round: int  # Раунд начала строительства
    completed_round: int  # Раунд завершения (started_round + 1)
    status: BuildingStatus = BuildingStatus.BUILDING
    sale_round: Optional[int] = None  # Раунд выставления на продажу
    sale_price: Optional[float] = None  # Цена продажи (фиксируется при выставлении)


@dataclass
class Player:
    """Игрок"""
    id: str
    name: str
    money: float = STARTING_MONEY
    resources: Dict[str, int] = field(default_factory=dict)
    buildings: List[Building] = field(default_factory=list)
    nickname: Optional[str] = None  # Никнейм для игры (устаревшее, используйте character_name)
    photo_url: Optional[str] = None  # URL фото профиля (устаревшее, используйте character_image)
    character_name: Optional[str] = None  # Имя выбранного персонажа
    character_image: Optional[str] = None  # Путь к изображению персонажа
    
    def get_resource(self, resource: str) -> int:
        """Получить количество ресурса"""
        return self.resources.get(resource, 0)
    
    def add_resource(self, resource: str, amount: int):
        """Добавить ресурс"""
        if resource not in self.resources:
            self.resources[resource] = 0
        self.resources[resource] += amount
    
    def remove_resource(self, resource: str, amount: int) -> bool:
        """Удалить ресурс (если достаточно)"""
        if self.get_resource(resource) >= amount:
            self.resources[resource] -= amount
            if self.resources[resource] == 0:
                del self.resources[resource]
            return True
        return False
    
    def has_resources(self, costs: Dict[str, int]) -> bool:
        """Проверить, достаточно ли ресурсов"""
        for resource, amount in costs.items():
            if self.get_resource(resource) < amount:
                return False
        return True
    
    def remove_resources(self, costs: Dict[str, int]) -> bool:
        """Удалить ресурсы (если достаточно)"""
        if not self.has_resources(costs):
            return False
        for resource, amount in costs.items():
            self.remove_resource(resource, amount)
        return True
    
    def get_building(self, building_id: str) -> Optional[Building]:
        """Найти объект по ID"""
        for building in self.buildings:
            if building.id == building_id:
                return building
        return None
    
    def remove_building(self, building_id: str) -> bool:
        """Удалить объект"""
        initial_count = len(self.buildings)
        self.buildings = [b for b in self.buildings if b.id != building_id]
        return len(self.buildings) < initial_count


class Game:
    """Игровой движок"""
    
    def __init__(self, num_players: int = 10, game_id: Optional[int] = None, load_from_db: bool = False):
        """
        Args:
            num_players: Количество игроков
            game_id: ID игры в БД (если None, создается новая)
            load_from_db: Загрузить состояние из БД
        """
        self.num_players = num_players
        self.current_round = 1
        self.players: List[Player] = []
        
        # ID игры в БД
        if game_id is None:
            # Создаем новую игру в БД
            self.game_id = database.create_game(num_players)
        else:
            self.game_id = game_id
        
        # Состояние рынка
        self.current_prices = RESOURCE_PRICES.copy()
        self.previous_round_players_bought: Dict[str, int] = {}
        self.previous_round_players_sold: Dict[str, int] = {}
        
        # Системы
        self.market = MarketDynamics(num_players)
        self.event_system = EventSystem()
        
        # История раундов
        self.round_history: List[Dict] = []
        
        # Отслеживание действий текущего раунда (для расчета спроса/предложения)
        self.current_round_players_bought: Dict[str, set] = {}  # {ресурс: set(player_ids)}
        self.current_round_players_sold: Dict[str, set] = {}    # {ресурс: set(player_ids)}
        
        # Загружаем состояние из БД, если нужно
        if load_from_db:
            self.load_from_database()
        else:
            # Сохраняем начальное состояние
            self.save_to_database()
            # Создаем снимок начального состояния (раунд 0)
            snapshot = self.create_snapshot()
            database.save_game_snapshot(self.game_id, 0, snapshot)
    
    def save_to_database(self):
        """Сохранить полное состояние игры в БД"""
        # Сохраняем состояние игры
        database.save_game_state(self.game_id, self.current_round)
        
        # Сохраняем текущие цены
        database.save_current_prices(self.game_id, self.current_prices)
        
        # Сохраняем всех игроков
        for player in self.players:
            database.save_player(
                player.id, self.game_id, player.name,
                getattr(player, 'character_name', None),
                getattr(player, 'character_image', None),
                player.money
            )
            # Сохраняем ресурсы игрока
            database.save_player_resources(player.id, player.resources)
            # Сохраняем объекты игрока
            for building in player.buildings:
                database.save_building(
                    building.id, player.id, self.game_id, building.name,
                    building.started_round, building.completed_round,
                    building.status.value,
                    building.sale_round, building.sale_price
                )
    
    def load_from_database(self):
        """Загрузить полное состояние игры из БД"""
        # Загружаем состояние игры
        game_data = database.load_game(self.game_id)
        if game_data:
            self.current_round = game_data['current_round']
            self.num_players = game_data['num_players']
        
        # Загружаем текущие цены
        self.current_prices = database.load_current_prices(self.game_id)
        if not self.current_prices:
            self.current_prices = RESOURCE_PRICES.copy()
        
        # Загружаем игроков
        players_data = database.load_all_players(self.game_id)
        self.players = []
        for p_data in players_data:
            player = Player(
                id=p_data['id'],
                name=p_data['name'],
                money=p_data['money']
            )
            # Добавляем атрибуты персонажа, если есть
            if p_data.get('character_name'):
                player.character_name = p_data['character_name']
            if p_data.get('character_image'):
                player.character_image = p_data['character_image']
            
            # Загружаем ресурсы
            resources = database.load_player_resources(p_data['id'])
            player.resources = resources
            
            # Загружаем объекты (только для текущей игры)
            buildings_data = database.load_player_buildings(p_data['id'], self.game_id)
            for b_data in buildings_data:
                building = Building(
                    id=b_data['id'],
                    name=b_data['name'],
                    started_round=b_data['started_round'],
                    completed_round=b_data['completed_round'],
                    status=BuildingStatus(b_data['status']),
                    sale_round=b_data.get('sale_round'),
                    sale_price=b_data.get('sale_price')
                )
                player.buildings.append(building)
            
            self.players.append(player)
        
        # Загружаем данные о спросе/предложении из предыдущего раунда
        if self.current_round > 1:
            self.previous_round_players_bought, self.previous_round_players_sold = \
                database.load_round_actions(self.game_id, self.current_round - 1)
    
    def save_player_to_db(self, player: Player):
        """Сохранить игрока в БД"""
        database.save_player(
            player.id, self.game_id, player.name,
            getattr(player, 'character_name', None),
            getattr(player, 'character_image', None),
            player.money
        )
        database.save_player_resources(player.id, player.resources)
    
    def save_building_to_db(self, building: Building, player_id: str):
        """Сохранить объект в БД"""
        database.save_building(
            building.id, player_id, self.game_id, building.name,
            building.started_round, building.completed_round,
            building.status.value,
            building.sale_round, building.sale_price
        )
    
    def add_player(self, player_id: str, player_name: str) -> bool:
        """Добавить игрока"""
        if len(self.players) >= self.num_players:
            return False
        if any(p.id == player_id for p in self.players):
            return False  # Игрок уже существует
        
        player = Player(id=player_id, name=player_name)
        self.players.append(player)
        # Сохраняем в БД
        self.save_player_to_db(player)
        return True
    
    def get_player(self, player_id: str) -> Optional[Player]:
        """Получить игрока по ID"""
        for player in self.players:
            if player.id == player_id:
                return player
        return None
    
    def calculate_building_cost(self, building_name: str) -> float:
        """Рассчитать стоимость объекта в монетах по текущим ценам"""
        costs = BUILDING_COSTS.get(building_name, {})
        total = 0
        for resource, amount in costs.items():
            total += amount * self.current_prices.get(resource, 0)
        return total
    
    def calculate_building_sale_price(self, building: Building) -> float:
        """Рассчитать цену продажи объекта (по текущим ценам ресурсов)"""
        costs = BUILDING_COSTS.get(building.name, {})
        total = 0
        for resource, amount in costs.items():
            total += amount * self.current_prices.get(resource, 0)
        return total
    
    # ========== ДЕЙСТВИЯ ИГРОКОВ ==========
    
    def buy_resource(self, player_id: str, resource: str, amount: int) -> Dict:
        """
        Купить ресурс
        
        Returns:
            {"success": bool, "message": str, "cost": float}
        """
        player = self.get_player(player_id)
        if not player:
            return {"success": False, "message": "Игрок не найден"}
        
        if resource not in RESOURCE_PRICES:
            return {"success": False, "message": "Неизвестный ресурс"}
        
        if amount <= 0:
            return {"success": False, "message": "Количество должно быть положительным"}
        
        cost = amount * self.current_prices[resource]
        
        if player.money < cost:
            return {"success": False, "message": f"Недостаточно денег. Нужно {cost:.2f}, есть {player.money:.2f}"}
        
        # Покупаем
        player.money -= cost
        player.add_resource(resource, amount)
        
        # Отслеживаем для расчета спроса
        if resource not in self.current_round_players_bought:
            self.current_round_players_bought[resource] = set()
        self.current_round_players_bought[resource].add(player_id)
        
        # Сохраняем действие в БД
        database.save_player_action(self.game_id, self.current_round, player_id, 'buy', resource, amount)
        
        # Сохраняем изменения игрока в БД
        self.save_player_to_db(player)
        
        return {"success": True, "message": f"Куплено {amount} {resource} за {cost:.2f} монет", "cost": cost}
    
    def sell_resource(self, player_id: str, resource: str, amount: int) -> Dict:
        """
        Продать ресурс
        
        Returns:
            {"success": bool, "message": str, "income": float}
        """
        player = self.get_player(player_id)
        if not player:
            return {"success": False, "message": "Игрок не найден"}
        
        if resource not in RESOURCE_PRICES:
            return {"success": False, "message": "Неизвестный ресурс"}
        
        if amount <= 0:
            return {"success": False, "message": "Количество должно быть положительным"}
        
        if not player.remove_resource(resource, amount):
            return {"success": False, "message": f"Недостаточно {resource}"}
        
        income = amount * self.current_prices[resource]
        player.money += income
        
        # Отслеживаем для расчета предложения
        if resource not in self.current_round_players_sold:
            self.current_round_players_sold[resource] = set()
        self.current_round_players_sold[resource].add(player_id)
        
        # Сохраняем действие в БД
        database.save_player_action(self.game_id, self.current_round, player_id, 'sell', resource, amount)
        
        # Сохраняем изменения игрока в БД
        self.save_player_to_db(player)
        
        return {"success": True, "message": f"Продано {amount} {resource} за {income:.2f} монет", "income": income}
    
    def start_building(self, player_id: str, building_name: str) -> Dict:
        """
        Начать строительство объекта
        
        Returns:
            {"success": bool, "message": str, "building_id": str}
        """
        player = self.get_player(player_id)
        if not player:
            return {"success": False, "message": "Игрок не найден"}
        
        if building_name not in BUILDING_COSTS:
            return {"success": False, "message": "Неизвестный объект"}
        
        costs = BUILDING_COSTS[building_name]
        
        if not player.has_resources(costs):
            return {"success": False, "message": "Недостаточно ресурсов"}
        
        # Списываем ресурсы
        player.remove_resources(costs)
        
        # Создаем объект
        building_id = f"{player_id}_{building_name}_{self.current_round}_{len(player.buildings)}"
        building = Building(
            id=building_id,
            name=building_name,
            started_round=self.current_round,
            completed_round=self.current_round + 1,  # Завершится в следующем раунде
            status=BuildingStatus.BUILDING
        )
        player.buildings.append(building)
        
        # Сохраняем объект в БД
        self.save_building_to_db(building, player_id)
        # Сохраняем изменения игрока в БД
        self.save_player_to_db(player)
        
        return {"success": True, "message": f"Начато строительство {building_name}", "building_id": building_id}
    
    def put_building_for_sale(self, player_id: str, building_id: str) -> Dict:
        """
        Выставить объект на продажу
        
        Returns:
            {"success": bool, "message": str, "sale_price": float}
        """
        player = self.get_player(player_id)
        if not player:
            return {"success": False, "message": "Игрок не найден"}
        
        building = player.get_building(building_id)
        if not building:
            return {"success": False, "message": "Объект не найден"}
        
        if building.status == BuildingStatus.FOR_SALE:
            return {"success": False, "message": "Объект уже выставлен на продажу"}
        
        if building.status == BuildingStatus.SOLD:
            return {"success": False, "message": "Объект уже продан"}
        
        if building.status == BuildingStatus.BUILDING:
            return {"success": False, "message": "Нельзя продать объект, который еще строится"}
        
        # Фиксируем цену продажи (по текущим ценам ресурсов)
        sale_price = self.calculate_building_sale_price(building)
        building.status = BuildingStatus.FOR_SALE
        building.sale_round = self.current_round
        building.sale_price = sale_price
        
        # Сохраняем изменения в БД
        self.save_building_to_db(building, player_id)
        
        return {"success": True, "message": f"Объект выставлен на продажу за {sale_price:.2f} монет", "sale_price": sale_price}
    
    # ========== ФАЗЫ РАУНДА ==========
    
    def phase_events(self, round_number: int = None) -> Dict:
        """
        Фаза 1: События
        Выбирает события и обновляет цены на ресурсы
        
        Args:
            round_number: Номер раунда, для которого применяются события (если None, используется current_round)
        """
        if round_number is None:
            round_number = self.current_round
        
        if round_number == 1:
            # Первый раунд: события не происходят
            return {
                "events": None,
                "prices_changed": False,
                "new_prices": self.current_prices.copy()
            }
        
        # Используем фиксированную последовательность событий
        positive_event, negative_event = self.event_system.get_fixed_event_pair(round_number)
        
        # Обработка случая с двумя позитивными событиями (раунд 3)
        # Проверяем, является ли "negative_event" на самом деле вторым позитивным событием
        if positive_event and negative_event and (
            negative_event.get("type") == "positive" or 
            round_number == 3
        ):
            # Два позитивных события - используем специальную функцию
            try:
                from fixed_scenario_analysis import combine_two_positive_events
                resource_mods, building_mods = combine_two_positive_events(
                    positive_event, negative_event
                )
                events_dict = {
                    "positive": positive_event["name"],
                    "positive2": negative_event["name"],
                    "negative": None,
                    "positive_description": positive_event["description"],
                    "positive2_description": negative_event["description"],
                    "negative_description": None
                }
            except Exception as e:
                print(f"Ошибка при объединении двух позитивных событий: {e}")
                # Fallback на обычное объединение
                resource_mods, building_mods = self.event_system.combine_event_modifiers(
                    positive_event, None
                )
                events_dict = {
                    "positive": positive_event["name"],
                    "negative": None,
                    "positive_description": positive_event["description"],
                    "negative_description": None
                }
        elif positive_event and negative_event:
            # Обычный случай: позитивное + негативное
            resource_mods, building_mods = self.event_system.combine_event_modifiers(
                positive_event, negative_event
            )
            events_dict = {
                "positive": positive_event["name"],
                "negative": negative_event["name"],
                "positive_description": positive_event["description"],
                "negative_description": negative_event["description"]
            }
        else:
            # Нет событий (не должно происходить для раундов > 1, но на всякий случай)
            resource_mods = {}
            building_mods = {}
            events_dict = {
                "positive": None,
                "negative": None,
                "positive_description": None,
                "negative_description": None
            }
        
        # Рассчитываем новые цены
        # Используем спрос/предложение из ПРЕДЫДУЩЕГО раунда
        # и события из ТЕКУЩЕГО раунда
        new_prices = self.market.calculate_resource_prices(
            previous_prices=self.current_prices,
            players_bought=self.previous_round_players_bought,
            players_sold=self.previous_round_players_sold,
            event_modifiers=resource_mods
        )
        
        # Обновляем цены
        self.current_prices = new_prices
        
        return {
            "events": events_dict,
            "resource_modifiers": resource_mods,
            "building_modifiers": building_mods,
            "prices_changed": True,
            "new_prices": new_prices.copy()
        }
    
    def phase_income(self, building_modifiers: Dict[str, float]) -> Dict:
        """
        Фаза 2: Начисление доходов
        Продажа объектов и начисление дохода от активных объектов
        """
        income_results = {
            "buildings_sold": [],
            "income_distributed": {}
        }
        
        # 1. Продажа объектов из предыдущего раунда
        # Объекты, выставленные на продажу в предыдущем раунде, продаются сейчас
        # Объект выставляется в раунде N, продается в раунде N+1
        # Логика: объект с sale_round = N должен продаться в раунде N+1
        # В начале раунда N+1 current_round = N+1 (увеличен в конце предыдущего process_round)
        # Поэтому проверяем: sale_round < current_round (N < N+1 = True)
        for player in self.players:
            for building in player.buildings:  # Проходим по всем объектам
                if (building.status == BuildingStatus.FOR_SALE and 
                    building.sale_round is not None):
                    # Объект должен быть продан, если он был выставлен в предыдущем раунде
                    # ВАЖНО: current_round увеличивается в конце process_round(), поэтому здесь он еще старый
                    # Объект выставляется в раунде N (sale_round = N), должен продаться в раунде N+1
                    # В начале process_round() для раунда N+1, current_round = N+1 (увеличен в конце предыдущего)
                    # Но в phase_income() current_round еще не увеличен, поэтому проверяем sale_round < current_round
                    # Например: sale_round=2, current_round=3 -> объект продается сейчас (выставлен в раунде 2, продается в раунде 3)
                    # sale_round=3, current_round=3 -> объект НЕ продается (только что выставлен в текущем раунде)
                    # После увеличения current_round до 4: sale_round=3, current_round=4 -> объект продается
                    # ИСПРАВЛЕНИЕ: current_round увеличивается в конце process_round(), поэтому в phase_income() он еще старый
                    # Но когда мы обрабатываем раунд N+1, current_round уже N+1 (увеличен в конце предыдущего process_round)
                    # Поэтому проверяем: sale_round < current_round (объект выставляется в N, продается в N+1)
                    # Например: sale_round=3, current_round=4 -> объект продается (выставлен в раунде 3, продается в раунде 4)
                    # ИСПРАВЛЕНИЕ: current_round увеличивается в конце process_round(), поэтому когда мы обрабатываем раунд N+1,
                    # current_round уже N+1, но в phase_income() он еще не увеличен. Поэтому нужно проверять sale_round < current_round + 1
                    # Например: объект выставлен в раунде 3 (sale_round=3), обрабатываем раунд 4 (current_round=4 в начале process_round)
                    # В phase_income() current_round еще 4, sale_round=3, проверка: 3 < 4+1 = 3 < 5 = True -> объект продается
                    if building.sale_round < self.current_round + 1:
                        # Продаем объект (выставлен в предыдущем раунде)
                        # Вместо удаления меняем статус на SOLD - объект остается в портфеле
                        player.money += building.sale_price
                        building.status = BuildingStatus.SOLD
                        # Сохраняем изменения в БД
                        self.save_building_to_db(building, player.id)
                        income_results["buildings_sold"].append({
                            "player_id": player.id,
                            "building_name": building.name,
                            "sale_price": building.sale_price
                        })
                        print(f"✅ Объект {building.id} продан у игрока {player.id}, статус изменен на SOLD")
        
        # 2. Обновление статусов: COMPLETED -> ACTIVE
        # Объекты, которые были завершены в предыдущем раунде, теперь становятся активными
        # и могут приносить доход в этом раунде
        # ВАЖНО: current_round увеличивается в конце process_round(), поэтому здесь он еще старый
        # Объект становится COMPLETED в update_state() когда (current_round + 1) >= completed_round
        # Затем в следующем process_round() в phase_income() он становится ACTIVE
        # Проверка: completed_round <= current_round означает, что объект был завершен в предыдущем или текущем раунде
        for player in self.players:
            for building in player.buildings:
                if building.status == BuildingStatus.COMPLETED:
                    # Объект был завершен в предыдущем раунде или в текущем
                    # Теперь становится активным и будет приносить доход
                    # Например: completed_round=2, current_round=2 -> объект становится ACTIVE
                    if building.completed_round <= self.current_round:
                        building.status = BuildingStatus.ACTIVE
                        # Сохраняем изменения в БД
                        self.save_building_to_db(building, player.id)
        
        # 3. Начисление дохода от активных объектов
        # Считаем количество каждого типа объектов (только ACTIVE)
        building_counts = {}
        for player in self.players:
            for building in player.buildings:
                if building.status == BuildingStatus.ACTIVE:
                    building_counts[building.name] = building_counts.get(building.name, 0) + 1
        
        # Рассчитываем доходы с учетом насыщения и событий
        new_incomes = self.market.calculate_building_incomes(
            building_counts,
            self.current_prices,
            building_modifiers
        )
        
        # Начисляем доходы игрокам
        for player in self.players:
            player_income = {"монеты": 0, "ресурсы": {}}
            
            for building in player.buildings:
                if building.status == BuildingStatus.ACTIVE:
                    income = new_incomes.get(building.name, {"монеты": 0, "ресурсы": {}})
                    
                    # Монеты - округляем до целых
                    coins = income.get("монеты", 0)
                    coins = int(round(coins))
                    player.money += coins
                    player_income["монеты"] += coins
                    
                    # Ресурсы - округляем вверх, чтобы не терять доход
                    for resource, amount in income.get("ресурсы", {}).items():
                        # Используем math.ceil для округления вверх (чтобы не терять доход)
                        # Если amount > 0, округляем вверх, иначе используем обычное округление
                        if amount > 0:
                            rounded_amount = math.ceil(amount)
                        else:
                            rounded_amount = int(round(amount))
                        player.add_resource(resource, rounded_amount)
                        if resource not in player_income["ресурсы"]:
                            player_income["ресурсы"][resource] = 0
                        player_income["ресурсы"][resource] += rounded_amount
            
            income_results["income_distributed"][player.id] = player_income
            
            # Сохраняем изменения игрока в БД
            self.save_player_to_db(player)
        
        return income_results
    
    def phase_purchases(self) -> Dict:
        """
        Фаза 3: Закупки
        Игроки совершают действия (покупка, продажа, строительство)
        Эта фаза собирает данные о спросе и предложении для следующего раунда
        """
        # Преобразуем sets в количество игроков
        players_bought = {
            resource: len(player_ids) 
            for resource, player_ids in self.current_round_players_bought.items()
        }
        players_sold = {
            resource: len(player_ids) 
            for resource, player_ids in self.current_round_players_sold.items()
        }
        
        return {
            "players_bought": players_bought,
            "players_sold": players_sold
        }
    
    def update_state(self, players_bought: Dict[str, int], players_sold: Dict[str, int]):
        """
        Фаза 4: Обновление состояния для следующего раунда
        """
        # Сохраняем данные для следующего раунда
        self.previous_round_players_bought = players_bought.copy()
        self.previous_round_players_sold = players_sold.copy()
        
        # Обновляем статусы объектов
        # ВАЖНО: current_round увеличивается в конце process_round(), поэтому здесь он еще старый
        # Но мы проверяем для следующего раунда, поэтому используем current_round + 1
        for player in self.players:
            for building in player.buildings:
                if building.status == BuildingStatus.BUILDING:
                    # Объект завершается, когда current_round + 1 >= completed_round
                    # Например: completed_round=2, current_round=1 -> 1+1 >= 2 -> становится COMPLETED
                    if (self.current_round + 1) >= building.completed_round:
                        # Объект завершен в этом раунде
                        # Становится COMPLETED, в следующем раунде станет ACTIVE и начнет приносить доход
                        building.status = BuildingStatus.COMPLETED
                        # Сохраняем изменения в БД
                        self.save_building_to_db(building, player.id)
                # УБРАНО: COMPLETED -> ACTIVE теперь происходит только в phase_income() в следующем раунде
    
    def start_round(self):
        """Начать новый раунд (сбросить отслеживание действий)"""
        self.current_round_players_bought = {}
        self.current_round_players_sold = {}
    
    def process_round(self) -> Dict:
        """
        Обработать полный раунд
        Вызывается после того, как все игроки совершили действия
        
        Returns:
            Результаты раунда
        """
        round_result = {
            "round": self.current_round,
            "events": None,
            "income": None,
            "prices": self.current_prices.copy()
        }
        
        # Создаем снимок состояния ПЕРЕД обработкой раунда
        # Снимок содержит состояние на начало текущего раунда
        snapshot = self.create_snapshot()
        database.save_game_snapshot(self.game_id, self.current_round, snapshot)
        
        # Фаза 1: События
        # События применяются для СЛЕДУЮЩЕГО раунда (current_round + 1)
        # Например, если мы обрабатываем раунд 1, события применяются для раунда 2
        next_round = self.current_round + 1
        events_result = self.phase_events(next_round)
        round_result["events"] = events_result["events"]
        round_result["prices"] = events_result["new_prices"]
        
        # Фаза 2: Начисление доходов
        building_modifiers = events_result.get("building_modifiers", {})
        income_result = self.phase_income(building_modifiers)
        round_result["income"] = income_result
        
        # Фаза 3: Закупки (собираем данные о спросе/предложении)
        purchases_result = self.phase_purchases()
        players_bought = purchases_result["players_bought"]
        players_sold = purchases_result["players_sold"]
        
        # Фаза 4: Обновление состояния
        self.update_state(players_bought, players_sold)
        
        # Сохраняем историю
        self.round_history.append(round_result)
        
        # Сохраняем события раунда в БД
        if round_result.get("events"):
            database.save_round_events(self.game_id, next_round, round_result["events"])
        
        # Сохраняем цены раунда в БД (история)
        database.save_round_prices(self.game_id, next_round, round_result["prices"])
        
        # Переходим к следующему раунду
        self.current_round += 1
        
        # Сбрасываем отслеживание для следующего раунда
        self.start_round()
        
        # Очищаем действия текущего раунда в БД (они уже обработаны)
        database.clear_round_actions(self.game_id, self.current_round - 1)
        
        # Сохраняем полное состояние в БД
        self.save_to_database()
        
        return round_result
    
    def create_snapshot(self) -> Dict:
        """Создать снимок текущего состояния игры"""
        snapshot = {
            "game_id": self.game_id,
            "current_round": self.current_round,
            "current_prices": self.current_prices.copy(),
            "players": []
        }
        
        for player in self.players:
            player_snapshot = {
                "id": player.id,
                "name": player.name,
                "money": player.money,
                "character_name": getattr(player, 'character_name', None),
                "character_image": getattr(player, 'character_image', None),
                "resources": player.resources.copy(),
                "buildings": []
            }
            
            for building in player.buildings:
                building_snapshot = {
                    "id": building.id,
                    "name": building.name,
                    "started_round": building.started_round,
                    "completed_round": building.completed_round,
                    "status": building.status.value,
                    "sale_round": building.sale_round,
                    "sale_price": building.sale_price
                }
                player_snapshot["buildings"].append(building_snapshot)
            
            snapshot["players"].append(player_snapshot)
        
        return snapshot
    
    def restore_from_snapshot(self, snapshot: Dict):
        """Восстановить состояние игры из снимка"""
        self.current_round = snapshot["current_round"]
        self.current_prices = snapshot["current_prices"].copy()
        
        # Восстанавливаем игроков
        self.players = []
        for p_data in snapshot["players"]:
            player = Player(
                id=p_data["id"],
                name=p_data["name"],
                money=p_data["money"]
            )
            if p_data.get("character_name"):
                player.character_name = p_data["character_name"]
            if p_data.get("character_image"):
                player.character_image = p_data["character_image"]
            
            player.resources = p_data["resources"].copy()
            
            for b_data in p_data["buildings"]:
                building = Building(
                    id=b_data["id"],
                    name=b_data["name"],
                    started_round=b_data["started_round"],
                    completed_round=b_data["completed_round"],
                    status=BuildingStatus(b_data["status"]),
                    sale_round=b_data.get("sale_round"),
                    sale_price=b_data.get("sale_price")
                )
                player.buildings.append(building)
            
            self.players.append(player)
    
    def get_leaderboard(self) -> List[Dict]:
        """Получить турнирную таблицу"""
        players_data = []
        for player in self.players:
            # Считаем стоимость всех ресурсов
            resources_value = sum(
                amount * self.current_prices.get(resource, 0)
                for resource, amount in player.resources.items()
            )
            
            # Считаем стоимость всех объектов
            buildings_value = sum(
                self.calculate_building_sale_price(building)
                for building in player.buildings
                if building.status != BuildingStatus.FOR_SALE and building.status != BuildingStatus.SOLD
            )
            
            total_value = player.money + resources_value + buildings_value
            
            players_data.append({
                "player_id": player.id,
                "name": player.name,
                "money": round(player.money, 2),
                "resources_value": round(resources_value, 2),
                "buildings_value": round(buildings_value, 2),
                "total_value": round(total_value, 2)
            })
        
        # Сортируем по общей стоимости
        players_data.sort(key=lambda x: x["total_value"], reverse=True)
        
        return players_data
    
    def get_player_state(self, player_id: str) -> Optional[Dict]:
        """Получить полное состояние игрока"""
        player = self.get_player(player_id)
        if not player:
            return None
        
        buildings_data = []
        for building in player.buildings:
            buildings_data.append({
                "id": building.id,
                "name": building.name,
                "status": building.status.value,
                "started_round": building.started_round,
                "completed_round": building.completed_round,
                "sale_round": building.sale_round,
                "sale_price": building.sale_price
            })
        
        return {
            "player_id": player.id,
            "name": player.name,
            "money": round(player.money, 2),
            "resources": player.resources.copy(),
            "buildings": buildings_data,
            "current_prices": self.current_prices.copy(),
            "current_round": self.current_round
        }

