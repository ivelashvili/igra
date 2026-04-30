#!/bin/bash
# Скрипт для запуска PostgreSQL через Docker

set -e

echo "=========================================="
echo "Запуск PostgreSQL через Docker"
echo "=========================================="
echo ""

# Проверяем наличие Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен"
    echo "   Установите Docker: https://www.docker.com/get-started"
    exit 1
fi

echo "🔄 Проверяем, запущен ли контейнер..."
if docker ps | grep -q postgres-royal-exchange; then
    echo "✅ Контейнер уже запущен"
else
    echo "🔄 Запускаем контейнер PostgreSQL..."
    docker run --name postgres-royal-exchange \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=royal_exchange \
        -p 5432:5432 \
        -d postgres:14
    
    echo "⏳ Ждем запуска PostgreSQL (10 секунд)..."
    sleep 10
    
    echo "✅ Контейнер запущен"
fi

echo ""
echo "=========================================="
echo "PostgreSQL готов к использованию!"
echo "=========================================="
echo ""
echo "Подключение:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: royal_exchange"
echo "  User: postgres"
echo "  Password: postgres"
echo ""
echo "Для остановки контейнера:"
echo "  docker stop postgres-royal-exchange"
echo ""
echo "Для удаления контейнера:"
echo "  docker rm postgres-royal-exchange"
echo ""
