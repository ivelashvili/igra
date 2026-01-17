"""
Генерация PDF со сценарным анализом фиксированной последовательности событий
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from fixed_scenario_analysis import simulate_fixed_scenario, FIXED_EVENT_SEQUENCE

def create_pdf(output_path="сценарный_анализ_фиксированный.pdf"):
    """Создает PDF со сценарным анализом фиксированной последовательности"""
    
    # Регистрируем шрифты
    try:
        font_paths = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('UnicodeFont', font_path))
                    break
                except:
                    continue
    except:
        pass
    
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    story = []
    styles = getSampleStyleSheet()
    
    font_name = 'UnicodeFont' if 'UnicodeFont' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
    
    # Заголовок
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=24,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=20,
        alignment=1,
        fontStyle='BOLD'
    )
    title = Paragraph("КОРОЛЕВСКАЯ БИРЖА", title_style)
    story.append(title)
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=14,
        textColor=colors.HexColor('#666666'),
        spaceAfter=30,
        alignment=1
    )
    subtitle = Paragraph("Сценарный анализ: Фиксированная последовательность событий", subtitle_style)
    story.append(subtitle)
    story.append(Spacer(1, 20))
    
    # Генерируем анализ
    print("Проведение сценарного анализа...")
    result = simulate_fixed_scenario()
    print("Анализ завершен")
    
    # Стили
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontName=font_name,
        fontSize=16,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=10,
        spaceBefore=20,
        fontStyle='BOLD'
    )
    
    text_style = ParagraphStyle(
        'Text',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=9,
        textColor=colors.HexColor('#34495e'),
        spaceAfter=5,
        leading=12
    )
    
    # Последовательность событий
    story.append(Paragraph("ПОСЛЕДОВАТЕЛЬНОСТЬ СОБЫТИЙ", section_title_style))
    
    events_data = [["Раунд", "Позитивное событие", "Негативное событие"]]
    for i, event_pair in enumerate(FIXED_EVENT_SEQUENCE, 1):
        if event_pair is None:
            events_data.append([f"{i}", "—", "—"])
        elif i == 3:  # Раунд 3: два позитивных
            events_data.append([f"{i}", f"{event_pair[0]}<br/>{event_pair[1]}", "—"])
        else:
            events_data.append([f"{i}", event_pair[0], event_pair[1]])
    
    events_table = Table(events_data, colWidths=[20*mm, 80*mm, 80*mm])
    events_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), font_name),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
        ('FONTNAME', (0, 1), (-1, -1), font_name),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(events_table)
    story.append(Spacer(1, 20))
    
    # Изменения цен на ресурсы
    story.append(Paragraph("ИЗМЕНЕНИЯ ЦЕН НА РЕСУРСЫ", section_title_style))
    story.append(Paragraph("Начальная цена → Конечная цена (изменение)", text_style))
    
    price_data = [["Ресурс", "Начало", "Конец", "Изменение"]]
    for resource, data in sorted(result["price_changes"].items()):
        change = data["change_percent"]
        change_str = f"{change:+.1f}%"
        price_data.append([
            resource,
            f"{data['start']:.2f}",
            f"{data['end']:.2f}",
            change_str
        ])
    
    price_table = Table(price_data, colWidths=[40*mm, 30*mm, 30*mm, 30*mm])
    price_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), font_name),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
        ('FONTNAME', (0, 1), (-1, -1), font_name),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
    ]))
    story.append(price_table)
    story.append(Spacer(1, 20))
    
    # История цен по раундам (топ-5 ресурсов)
    story.append(Paragraph("ДИНАМИКА ЦЕН ПО РАУНДАМ (топ-5 ресурсов)", section_title_style))
    
    # Выбираем топ-5 ресурсов по изменению
    top_resources = sorted(
        result["price_changes"].items(),
        key=lambda x: abs(x[1]["change_percent"]),
        reverse=True
    )[:5]
    
    for resource, _ in top_resources:
        story.append(Paragraph(f"<b>{resource}:</b>", text_style))
        history_data = [["Раунд", "Цена"]]
        for round_num, prices in enumerate(result["price_history"], 1):
            price = prices.get(resource, 0)
            history_data.append([f"{round_num}", f"{price:.2f}"])
        
        history_table = Table(history_data, colWidths=[30*mm, 30*mm])
        history_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), font_name),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
            ('FONTNAME', (0, 1), (-1, -1), font_name),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ]))
        story.append(history_table)
        story.append(Spacer(1, 10))
    
    story.append(PageBreak())
    
    # Доходы объектов
    story.append(Paragraph("ДОХОДЫ ОБЪЕКТОВ ЗА 10 РАУНДОВ", section_title_style))
    
    building_data = [["Объект", "Стоимость", "Доход (монеты)", "Доход (ресурсы)", "Общий доход", "ROI %"]]
    
    # Сортируем по общему доходу
    sorted_buildings = sorted(
        result["building_results"].items(),
        key=lambda x: x[1]["total_income_value"],
        reverse=True
    )
    
    for building_name, data in sorted_buildings:
        # Форматируем ресурсы
        resources_str = ", ".join([
            f"{amount:.1f} {res}" 
            for res, amount in sorted(data["total_income_resources"].items())
        ]) if data["total_income_resources"] else "—"
        
        building_data.append([
            building_name,
            f"{data['cost']:.0f}",
            f"{data['total_income_coins']:.2f}",
            resources_str[:40] + "..." if len(resources_str) > 40 else resources_str,
            f"{data['total_income_value']:.2f}",
            f"{data['roi_percent']:.1f}%"
        ])
    
    building_table = Table(building_data, colWidths=[35*mm, 25*mm, 25*mm, 50*mm, 25*mm, 20*mm])
    building_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), font_name),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
        ('FONTNAME', (0, 1), (-1, -1), font_name),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(building_table)
    
    story.append(Spacer(1, 20))
    
    # Пояснение
    info_style = ParagraphStyle(
        'Info',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=8,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=10,
        leftIndent=10,
        rightIndent=10
    )
    story.append(Paragraph(
        "<b>Примечание:</b> Анализ проведен с учетом только влияния событий на цены и доходы. "
        "В реальной игре также будут влиять спрос/предложение игроков и насыщение рынка объектами. "
        "ROI рассчитывается как процент от стоимости объекта за 10 раундов. "
        "Раунд 3 содержит два позитивных события (День рождения Короля + Торговый караван).",
        info_style
    ))
    
    doc.build(story)
    print(f"PDF создан: {output_path}")

if __name__ == "__main__":
    create_pdf("сценарный_анализ_фиксированный.pdf")

