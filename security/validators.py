"""
Pydantic модели для валидации входных данных
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, List
import re

# Список доступных ресурсов (из game_config.py)
VALID_RESOURCES = ["камень", "дерево", "железо", "скот", "овощи", "рабы", "золото", "зерно", "рыба"]

# Список доступных зданий (из game_config.py)
VALID_BUILDINGS = [
    "Лесоповал", "Каменоломня", "Теплицы", "Трактир",
    "Посевные поля", "Рыболовня", "Кузнечная", "Ферма",
    "Постоялый двор", "Куртизанские палатки", "Золотой рудник"
]

class BuyResourceRequest(BaseModel):
    """Модель для запроса покупки ресурса"""
    resource: str = Field(..., description="Название ресурса")
    quantity: int = Field(..., gt=0, le=10000, description="Количество ресурса (1-10000)")
    
    @validator('resource')
    def validate_resource(cls, v):
        if v not in VALID_RESOURCES:
            raise ValueError(f"Неверный ресурс. Доступные: {', '.join(VALID_RESOURCES)}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "resource": "железо",
                "quantity": 10
            }
        }

class SellResourceRequest(BaseModel):
    """Модель для запроса продажи ресурса"""
    resource: str = Field(..., description="Название ресурса")
    quantity: int = Field(..., gt=0, le=10000, description="Количество ресурса (1-10000)")
    
    @validator('resource')
    def validate_resource(cls, v):
        if v not in VALID_RESOURCES:
            raise ValueError(f"Неверный ресурс. Доступные: {', '.join(VALID_RESOURCES)}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "resource": "железо",
                "quantity": 5
            }
        }

class BuildBuildingRequest(BaseModel):
    """Модель для запроса строительства здания"""
    building_name: str = Field(..., description="Название здания")
    
    @validator('building_name')
    def validate_building_name(cls, v):
        if v not in VALID_BUILDINGS:
            raise ValueError(f"Неверное название здания. Доступные: {', '.join(VALID_BUILDINGS)}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "building_name": "Лесоповал"
            }
        }

class SellBuildingRequest(BaseModel):
    """Модель для запроса продажи здания"""
    building_id: str = Field(..., min_length=1, description="ID здания")
    
    class Config:
        json_schema_extra = {
            "example": {
                "building_id": "building_123"
            }
        }

class PlayerAuthRequest(BaseModel):
    """Модель для запроса авторизации игрока"""
    character_name: Optional[str] = Field(None, min_length=2, max_length=50, description="Имя персонажа")
    character_image: Optional[str] = Field(None, description="URL изображения персонажа")
    nickname: Optional[str] = Field(None, min_length=2, max_length=50, description="Никнейм (для обратной совместимости)")
    photo_url: Optional[str] = Field(None, description="URL фото (для обратной совместимости)")
    
    @validator('character_name', 'nickname')
    def validate_name(cls, v):
        if v is not None:
            # Проверка на допустимые символы (буквы, цифры, пробелы, дефисы, подчеркивания)
            if not re.match(r'^[a-zA-Zа-яА-ЯёЁ0-9\s\-_]+$', v):
                raise ValueError("Имя может содержать только буквы, цифры, пробелы, дефисы и подчеркивания")
        return v
    
    @validator('character_image', 'photo_url')
    def validate_url(cls, v):
        if v is not None and v:
            # Базовая проверка URL - разрешаем полные URL, data URI и относительные пути
            if not (v.startswith('http://') or v.startswith('https://') or 
                    v.startswith('data:') or v.startswith('/')):
                raise ValueError("URL должен начинаться с http://, https://, data: или /")
        return v
    
    def validate_has_name_or_nickname(self):
        """Проверка, что указано либо character_name, либо nickname"""
        if not self.character_name and not self.nickname:
            raise ValueError("Необходимо указать character_name или nickname")
        return True

class CreateGameRequest(BaseModel):
    """Модель для запроса создания игры"""
    num_players: int = Field(..., ge=2, le=100, description="Количество игроков (2-100)")
    company_name: Optional[str] = Field(None, max_length=255, description="Название компании")
    description: Optional[str] = Field(None, max_length=1000, description="Описание игры")
    
    class Config:
        json_schema_extra = {
            "example": {
                "num_players": 30,
                "company_name": "Тестовая компания"
            }
        }

class SetRoundRequest(BaseModel):
    """Модель для запроса установки раунда"""
    round: int = Field(..., ge=1, le=10, description="Номер раунда (1-10)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "round": 5
            }
        }

class RollbackRequest(BaseModel):
    """Модель для запроса отката к снимку"""
    round_number: int = Field(..., ge=0, le=10, description="Номер раунда для отката (0-10)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "round_number": 3
            }
        }

class GameCodeQuery(BaseModel):
    """Модель для валидации game_code в query параметрах"""
    game_code: str = Field(..., description="Код игры (6 цифр)")
    
    @validator('game_code')
    def validate_game_code(cls, v):
        if not v or len(v) != 6 or not v.isdigit():
            raise ValueError("Код игры должен состоять из 6 цифр")
        code_int = int(v)
        if code_int < 100000 or code_int > 999999:
            raise ValueError("Код игры должен быть в диапазоне 100000-999999")
        return v

class RoundNumberPath(BaseModel):
    """Модель для валидации round_number в path параметрах"""
    round_number: int = Field(..., ge=1, le=10, description="Номер раунда (1-10)")

class ResourceNamePath(BaseModel):
    """Модель для валидации resource_name в path параметрах"""
    resource_name: str = Field(..., description="Название ресурса")
    
    @validator('resource_name')
    def validate_resource_name(cls, v):
        if v not in VALID_RESOURCES:
            raise ValueError(f"Неверный ресурс. Доступные: {', '.join(VALID_RESOURCES)}")
        return v

class BuildingNamePath(BaseModel):
    """Модель для валидации building_name в path параметрах"""
    building_name: str = Field(..., description="Название здания")
    
    @validator('building_name')
    def validate_building_name(cls, v):
        if v not in VALID_BUILDINGS:
            raise ValueError(f"Неверное название здания. Доступные: {', '.join(VALID_BUILDINGS)}")
        return v
