#!/bin/bash
# Скрипт для автоматической установки и настройки PostgreSQL

set -e

echo "=========================================="
echo "Настройка PostgreSQL для Королевской Биржи"
echo "=========================================="
echo ""

# Проверяем наличие PostgreSQL
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL уже установлен"
    psql --version
else
    echo "❌ PostgreSQL не найден"
    echo ""
    echo "Пожалуйста, установите PostgreSQL одним из способов:"
    echo ""
    echo "1. Через Homebrew (macOS):"
    echo "   brew install postgresql@14"
    echo "   brew services start postgresql@14"
    echo ""
    echo "2. Через официальный установщик:"
    echo "   https://www.postgresql.org/download/"
    echo ""
    echo "3. Через Docker:"
    echo "   docker run --name postgres-royal-exchange -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=royal_exchange -p 5432:5432 -d postgres:14"
    echo ""
    exit 1
fi

echo ""
echo "🔄 Проверяем подключение к PostgreSQL..."
if psql -U postgres -c "SELECT 1" &> /dev/null; then
    echo "✅ Подключение успешно"
else
    echo "⚠️  Не удалось подключиться с пользователем postgres"
    echo "   Попробуйте подключиться вручную: psql -U postgres"
fi

echo ""
echo "🔄 Создаем базу данных..."
psql -U postgres << EOF
-- Создаем базу данных, если её нет
SELECT 'CREATE DATABASE royal_exchange'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'royal_exchange')\gexec

-- Создаем пользователя, если его нет
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'royal_exchange_user') THEN
        CREATE USER royal_exchange_user WITH PASSWORD 'postgres';
    END IF;
END
\$\$;

-- Выдаем права
GRANT ALL PRIVILEGES ON DATABASE royal_exchange TO royal_exchange_user;
EOF

echo "✅ База данных создана"
echo ""
echo "=========================================="
echo "Настройка завершена!"
echo "=========================================="
echo ""
echo "Теперь вы можете:"
echo "1. Обновить .env файл с правильными учетными данными"
echo "2. Запустить: python3 test_db_connection.py"
echo "3. Запустить миграцию: python3 migrate_sqlite_to_postgresql.py"
echo ""
