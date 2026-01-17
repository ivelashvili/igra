"""
Генерация PDF с информацией о раундах для отображения после видео
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from game_events import POSITIVE_EVENTS, NEGATIVE_EVENTS, EventSystem
from fixed_scenario_analysis import FIXED_EVENT_SEQUENCE, combine_two_positive_events
from market_dynamics import MarketDynamics
from game_config import RESOURCE_PRICES, BUILDING_INCOME
import os

# Создаем словари для быстрого поиска событий
positive_events_dict = {e["name"]: e for e in POSITIVE_EVENTS}
negative_events_dict = {e["name"]: e for e in NEGATIVE_EVENTS}

# Ключевые ресурсы (для отображения в сводках)
KEY_RESOURCES = ["золото", "железо", "дерево", "зерно", "скот", "рабы", "рыба", "овощи"]

def calculate_price_change_percent(modifier: float) -> float:
    """Рассчитывает процент изменения цены от модификатора"""
    # Модификатор 0.69 означает падение на 31% (1 - 0.69 = 0.31)
    # Модификатор 1.8 означает рост на 80% (1.8 - 1 = 0.8)
    if modifier < 1.0:
        return (1.0 - modifier) * 100
    else:
        return (modifier - 1.0) * 100

def calculate_income_change_percent(modifier: float) -> float:
    """Рассчитывает процент изменения дохода от модификатора"""
    # Аналогично цене
    if modifier < 1.0:
        return (1.0 - modifier) * 100
    else:
        return (modifier - 1.0) * 100

def get_round_summary(round_num: int) -> dict:
    """Получить сводку по раунду"""
    if round_num == 1:
        return {
            "title": "Раунд 1: Начало игры",
            "description": "Первый раунд торговли. Игроки делают первые покупки и начинают строительство объектов.",
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
    event_pair = FIXED_EVENT_SEQUENCE[round_num - 1]
    pos_name, second_name = event_pair
    
    positive_event = positive_events_dict.get(pos_name)
    
    # Специальная обработка для раунда 3 (два позитивных события)
    if round_num == 3:
        second_positive_event = positive_events_dict.get(second_name)
        resource_mods, building_mods = combine_two_positive_events(
            positive_event, second_positive_event
        )
        
        return {
            "title": f"Раунд {round_num}: Двойной праздник",
            "description": "Королевство празднует день рождения короля! В это же время прибывает богатый торговый караван с экзотическими товарами.",
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
            "title": f"Раунд {round_num}: {pos_name} и {second_name}",
            "description": f"Королевство переживает противоречивые времена: {positive_event['description'].lower()} Но {negative_event['description'].lower()}",
            "events": {
                "positive": pos_name,
                "negative": second_name,
                "positive_description": positive_event["description"],
                "negative_description": negative_event["description"]
            },
            "key_resources": get_key_resources(resource_mods),
            "key_buildings": get_key_buildings(building_mods)
        }

def get_key_resources(resource_modifiers: dict) -> list:
    """Получить список ключевых ресурсов с изменениями"""
    key_resources = []
    
    for resource in KEY_RESOURCES:
        if resource in resource_modifiers:
            modifier = resource_modifiers[resource]
            change_percent = calculate_price_change_percent(modifier)
            
            # Показываем только значительные изменения (более 5%)
            if abs(change_percent) >= 5:
                direction = "down" if modifier < 1.0 else "up"
                
                # Определяем причину изменения
                reason = get_resource_change_reason(resource, modifier)
                
                key_resources.append({
                    "name": resource,
                    "change_percent": round(change_percent, 0),
                    "direction": direction,
                    "reason": reason
                })
    
    # Сортируем по абсолютному значению изменения
    key_resources.sort(key=lambda x: abs(x["change_percent"]), reverse=True)
    
    # Берем топ-5
    return key_resources[:5]

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

def get_key_buildings(building_modifiers: dict) -> list:
    """Получить список ключевых объектов с изменениями доходов"""
    key_buildings = []
    
    for building_name, modifier in building_modifiers.items():
        change_percent = calculate_income_change_percent(modifier)
        
        # Показываем только значительные изменения (более 10%)
        if abs(change_percent) >= 10:
            direction = "down" if modifier < 1.0 else "up"
            
            # Определяем причину изменения
            reason = get_building_change_reason(building_name, modifier)
            
            key_buildings.append({
                "name": building_name,
                "income_change_percent": round(change_percent, 0),
                "direction": direction,
                "reason": reason
            })
    
    # Сортируем по абсолютному значению изменения
    key_buildings.sort(key=lambda x: abs(x["income_change_percent"]), reverse=True)
    
    # Берем топ-5
    return key_buildings[:5]

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

def create_round_summaries_pdf(output_path="round_summaries.pdf"):
    """Создать PDF с сводками по раундам"""
    # Регистрируем шрифты для поддержки кириллицы
    try:
        # Пробуем найти системные шрифты с поддержкой кириллицы
        font_paths = [
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/HelveticaNeue.ttc",
        ]
        font_registered = False
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('UnicodeFont', font_path))
                    font_registered = True
                    print(f"Зарегистрирован шрифт: {font_path}")
                    break
                except Exception as e:
                    print(f"Не удалось зарегистрировать {font_path}: {e}")
                    continue
    except Exception as e:
        print(f"Ошибка при регистрации шрифта: {e}")
        pass
    
    # Определяем имя шрифта
    font_name = 'UnicodeFont' if 'UnicodeFont' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
    
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    story = []
    
    # Стили
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=20,
        textColor=colors.HexColor('#3a2a1a'),
        spaceAfter=12,
        alignment=1  # Центрирование
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontName=font_name,
        fontSize=16,
        textColor=colors.HexColor('#3a2a1a'),
        spaceAfter=8,
        spaceBefore=12
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=11,
        textColor=colors.HexColor('#3a2a1a'),
        spaceAfter=6
    )
    
    heading3_style = ParagraphStyle(
        'CustomHeading3',
        parent=styles['Heading3'],
        fontName=font_name,
        fontSize=13,
        textColor=colors.HexColor('#3a2a1a'),
        spaceAfter=6,
        spaceBefore=8
    )
    
    # Заголовок документа
    story.append(Paragraph("Сводки по раундам игры", title_style))
    story.append(Paragraph("Королевская Биржа", styles['Heading2']))
    story.append(Spacer(1, 0.3*inch))
    
    # Генерируем сводки для каждого раунда
    for round_num in range(1, 11):
        summary = get_round_summary(round_num)
        
        # Заголовок раунда
        story.append(Paragraph(summary["title"], heading_style))
        
        # События (описание события идет сразу после заголовка)
        if summary["events"].get("positive_description"):
            story.append(Paragraph(summary["events"]["positive_description"], normal_style))
            story.append(Spacer(1, 0.1*inch))
        
        if summary["events"].get("positive2_description"):
            story.append(Paragraph(summary["events"]["positive2_description"], normal_style))
            story.append(Spacer(1, 0.1*inch))
        
        if summary["events"].get("negative_description"):
            story.append(Paragraph(summary["events"]["negative_description"], normal_style))
            story.append(Spacer(1, 0.1*inch))
        
        # Ключевые ресурсы
        if summary["key_resources"]:
            story.append(Paragraph("<b>Изменения цен на ключевые ресурсы:</b>", heading3_style))
            
            resource_data = [["Ресурс", "Изменение", "Причина"]]
            for resource in summary["key_resources"]:
                change_text = f"{'+' if resource['direction'] == 'up' else ''}{int(resource['change_percent'])}%"
                resource_data.append([
                    resource["name"].capitalize(),
                    change_text,
                    resource["reason"]
                ])
            
            resource_table = Table(resource_data, colWidths=[2*inch, 1.5*inch, 3*inch])
            resource_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b4513')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), font_name),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#8b4513')),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('FONTNAME', (0, 1), (-1, -1), font_name),
            ]))
            story.append(resource_table)
            story.append(Spacer(1, 0.2*inch))
        
        # Ключевые объекты
        if summary["key_buildings"]:
            story.append(Paragraph("<b>Изменения доходов объектов:</b>", heading3_style))
            
            building_data = [["Объект", "Изменение дохода", "Причина"]]
            for building in summary["key_buildings"]:
                change_text = f"{'+' if building['direction'] == 'up' else ''}{int(building['income_change_percent'])}%"
                building_data.append([
                    building["name"],
                    change_text,
                    building["reason"]
                ])
            
            building_table = Table(building_data, colWidths=[2.5*inch, 1.5*inch, 3*inch])
            building_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b4513')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), font_name),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#8b4513')),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('FONTNAME', (0, 1), (-1, -1), font_name),
            ]))
            story.append(building_table)
        
        # Разрыв страницы между раундами (кроме последнего)
        if round_num < 10:
            story.append(PageBreak())
    
    # Собираем PDF
    doc.build(story)
    print(f"PDF создан: {output_path}")

if __name__ == "__main__":
    create_round_summaries_pdf()
    print("\nГотово! PDF файл создан.")

