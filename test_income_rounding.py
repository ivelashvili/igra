"""
Тест округления доходов
Проверяет, что math.ceil правильно округляет доходы
"""
import math

def test_rounding():
    """Тест различных случаев округления"""
    print("\n" + "="*60)
    print("ТЕСТ ОКРУГЛЕНИЯ ДОХОДОВ")
    print("="*60)
    
    test_cases = [
        (2.49, "2.49 (должно округлиться до 3)"),
        (2.5, "2.5 (должно округлиться до 3)"),
        (2.7, "2.7 (должно округлиться до 3)"),
        (2.99, "2.99 (должно округлиться до 3)"),
        (3.0, "3.0 (должно остаться 3)"),
        (3.01, "3.01 (должно округлиться до 4)"),
        (0.5, "0.5 (должно округлиться до 1)"),
        (0.1, "0.1 (должно округлиться до 1)"),
    ]
    
    print("\nТест math.ceil (округление вверх):")
    for amount, description in test_cases:
        rounded = math.ceil(amount)
        old_rounded = int(round(amount))
        print(f"  {description}")
        print(f"    math.ceil: {rounded}, int(round): {old_rounded}")
        if rounded != old_rounded:
            print(f"    ⚠️ Разница: {rounded - old_rounded}")
    
    print("\n" + "="*60)
    print("ВЫВОД:")
    print("math.ceil округляет ВСЕГДА вверх, даже 2.01 -> 3")
    print("int(round) округляет до ближайшего целого, 2.49 -> 2, 2.5 -> 3")
    print("="*60)

if __name__ == "__main__":
    test_rounding()

