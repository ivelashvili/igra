let ws = null;
let reconnectInterval = null;

// Конфигурация видео: маппинг имен файлов на Google Drive ID
const VIDEO_DRIVE_IDS = {
    'Введение.mp4': '1oSjU7z2bvUYi_3DndA4bbkL-egA3ec-j',
    'Раунд 1.mp4': '1Y0QT2dEi1KJ4I2cbEpKEwwx1xA2uh2Xf',
    'Раунд 2.mp4': '1L5PgVV4IRXMWigI2XSqOObvlkwJXAR1a',
    'Раунд 3.mp4': '13nFuuIHy8OnYiEn7CbNgZgU1B1RVbTT7',
    'Раунд 4.mp4': '1qy_utFmxrSuLS74MCDkg5RxV7PNnYSaY',
    'Раунд 5.mp4': '1fTmqWYTIjlLIaX0kJuV-F1MicNqSDex1',
    'Раунд 6.mp4': '1HHpHmBAjoNJ94iQFh3GbfdRh0Ww4M28_',
    'Раунд 7.mp4': '1wQIRLkvdbiueFjbUWXV5-Ducj4oNUQKK',
    'Раунд 8.mp4': '1g0ZQUYQCszbqND7iLafCW3F-OL8PoaxZ',
    'Раунд 9.mp4': '10sPpLb236yyvmqmHmAdCEA3ANC7tTSjO',
    'Раунд 10.mp4': '1YW2vlJCSw00oHGmCF5F_VdWJO8iuq8v5'
};

// Базовый URL для Google Drive (прямая загрузка)
const GOOGLE_DRIVE_BASE_URL = 'https://drive.google.com/uc?export=download&id=';

// Использовать Google Drive или локальные файлы (переключите на false для локальных файлов)
const USE_GOOGLE_DRIVE = true;

// Состояние игры
let gameState = {
    currentScreen: 'start', // start, video, intro-complete, game, final-results
    currentRound: 0, // 0 означает, что раунд еще не установлен вручную
    isVideoPlaying: false,
    roundManuallySet: false // Флаг, что раунд был установлен вручную
};

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateUI(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        if (!reconnectInterval) {
            reconnectInterval = setInterval(connectWebSocket, 3000);
        }
    };
}

function updateUI(data) {
    // Обновляем информацию о раунде
    // НЕ перезаписываем, если мы установили раунд вручную
    if (data.current_round !== undefined) {
        const serverRound = data.current_round;
        const roundElement = document.getElementById('current-round');
        if (!roundElement) return;
        
        const currentDisplayRound = parseInt(roundElement.textContent) || 1;
        
        // Если раунд был установлен вручную, не перезаписываем его из WebSocket
        if (gameState.roundManuallySet && gameState.currentRound > 0) {
            // Оставляем текущее значение, установленное вручную
            roundElement.textContent = gameState.currentRound;
        } else {
            // Обновляем из сервера только если раунд не был установлен вручную
            roundElement.textContent = serverRound;
            gameState.currentRound = serverRound;
        }
    }
    if (data.num_players !== undefined) {
        document.getElementById('num-players').textContent = data.num_players;
    }
    
    // Обновляем турнирную таблицу
    if (data.leaderboard && data.leaderboard.leaderboard) {
        updateLeaderboard(data.leaderboard.leaderboard);
    }
    
    // Обновляем цены
    if (data.prices && data.prices.prices) {
        updatePrices(data.prices.prices);
    }
    
    // Обновляем объекты
    if (data.buildings && data.buildings.buildings) {
        updateBuildings(data.buildings.buildings);
    }
}

function updateLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    
    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #e8d5b7;">Игроки еще не добавлены</td></tr>';
        return;
    }
    
    leaderboard.forEach((player, index) => {
        const row = document.createElement('tr');
        
        // Прирост за раунд
        const growthRound = player.growth_round_percent || player.growth_percent || 0;
        const growthRoundClass = growthRound > 0 ? 'positive' : 
                               growthRound < 0 ? 'negative' : 'neutral';
        const growthRoundSign = growthRound > 0 ? '+' : '';
        
        // Прирост за игру
        const growthGame = player.growth_game_percent || 0;
        const growthGameClass = growthGame > 0 ? 'positive' : 
                               growthGame < 0 ? 'negative' : 'neutral';
        const growthGameSign = growthGame > 0 ? '+' : '';
        
        row.innerHTML = `
            <td><strong style="color: #3a2a1a;">${index + 1}</strong></td>
            <td style="color: #3a2a1a;">${player.character_name || player.name || 'Игрок'}</td>
            <td style="color: #3a2a1a;">${Math.round(player.total_value)} монет</td>
            <td class="${growthRoundClass}">${growthRoundSign}${Math.round(growthRound)}%</td>
            <td class="${growthGameClass}">${growthGameSign}${Math.round(growthGame)}%</td>
        `;
        
        tbody.appendChild(row);
    });
}

function updatePrices(prices) {
    const tbody = document.getElementById('prices-body');
    tbody.innerHTML = '';
    
    if (prices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #e8d5b7;">Цены не загружены</td></tr>';
        return;
    }
    
    prices.forEach(price => {
        const row = document.createElement('tr');
        
        const prevClass = price.change_from_prev_percent > 0 ? 'positive' : 
                         price.change_from_prev_percent < 0 ? 'negative' : 'neutral';
        const startClass = price.change_from_start_percent > 0 ? 'positive' : 
                          price.change_from_start_percent < 0 ? 'negative' : 'neutral';
        
        const prevSign = price.change_from_prev_percent > 0 ? '+' : '';
        const startSign = price.change_from_start_percent > 0 ? '+' : '';
        
        // Делаем первую букву заглавной
        const resourceName = price.resource.charAt(0).toUpperCase() + price.resource.slice(1);
        
        row.innerHTML = `
            <td><strong style="color: #3a2a1a;">${resourceName}</strong></td>
            <td style="color: #3a2a1a;">${Math.round(price.current_price)}</td>
            <td class="${prevClass}">${prevSign}${Math.round(price.change_from_prev_percent)}%</td>
            <td class="${startClass}">${startSign}${Math.round(price.change_from_start_percent)}%</td>
        `;
        
        // Добавляем обработчик клика для открытия модального окна
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Клик по ресурсу:', price.resource);
            console.log('openResourceModal определена?', typeof openResourceModal);
            if (typeof openResourceModal === 'function') {
                openResourceModal(price.resource);
            } else {
                console.error('openResourceModal не определена!');
            }
        });
        
        tbody.appendChild(row);
    });
}

// Маппинг названий объектов на имена файлов картинок
const buildingImages = {
    'Лесоповал': 'лесоповал.png',
    'Каменоломня': 'каменоломня.png',
    'Рыболовня': 'рыболовня.png',
    'Трактир': 'Трактир.png',
    'Теплицы': 'теплицы.png',
    'Посевные поля': 'Посевные поля.png',
    'Ферма': 'ферма.png',
    'Постоялый двор': 'постоялый двор.png',
    'Куртизанские палатки': 'куртизанские палатки.png',
    'Кузнечная': 'кузнечная.png',
    'Золотой рудник': 'золотой рудник.png'
};

// Маппинг названий ресурсов на имена файлов картинок
const resourceImages = {
    'камень': 'камень.png',
    'дерево': 'дерево.png',
    'железо': 'железо.png',
    'скот': 'скот.png',
    'овощи': 'овощи.png',
    'рабы': 'рабы.png',
    'золото': 'золото.png',
    'зерно': 'зерно.png',
    'рыба': 'рыба.png'
};

// Порядок ресурсов для навигации (должен совпадать с порядком в таблице цен - sorted по алфавиту)
const allResourcesOrder = [
    'дерево', 'железо', 'зерно', 'золото', 'камень', 'овощи', 'рабы', 'рыба', 'скот'
];

// Глобальные переменные для навигации ресурсов
let currentResourceIndex = -1;

// Порядок объектов для навигации (должен совпадать с порядком в allBuildings)
const allBuildingsOrder = [
    'Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир',
    'Посевные поля', 'Рыболовня', 'Кузнечная', 'Ферма',
    'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'
];

// Глобальные переменные для навигации
let currentBuildingIndex = -1;
let buildingsDataCache = {}; // Кэш данных объектов {name: {count, percentage}}

function updateBuildings(buildings) {
    const grid = document.getElementById('buildings-grid');
    grid.innerHTML = '';
    
    // Создаем словарь для быстрого поиска данных по названию
    const buildingsMap = {};
    buildings.forEach(building => {
        buildingsMap[building.name] = building;
    });
    
    // Обновляем кэш данных
    buildingsDataCache = {};
    allBuildingsOrder.forEach(buildingName => {
        const building = buildingsMap[buildingName] || {
            name: buildingName,
            count: 0,
            players_percentage: 0
        };
        buildingsDataCache[buildingName] = {
            count: building.count,
            percentage: Math.round(building.players_percentage)
        };
    });
    
    // Всегда показываем все 11 объектов в порядке 4-4-3
    const allBuildings = [
        // Первый ряд (4 объекта)
        'Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир',
        // Второй ряд (4 объекта)
        'Посевные поля', 'Рыболовня', 'Кузнечная', 'Ферма',
        // Третий ряд (3 объекта)
        'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'
    ];
    
    allBuildings.forEach(buildingName => {
        const building = buildingsMap[buildingName] || {
            name: buildingName,
            count: 0,
            players_percentage: 0
        };
        
        const card = document.createElement('div');
        card.className = 'building-card';
        // Сохраняем данные карточки для использования в модальном окне
        card.setAttribute('data-building-name', buildingName);
        card.setAttribute('data-building-count', building.count);
        card.setAttribute('data-building-percentage', Math.round(building.players_percentage));
        
        // Получаем имя файла картинки
        const imageFile = buildingImages[building.name] || 'лесоповал.png';
        const imagePath = `/static/images/buildings/${imageFile}`;
        
        // Получаем информацию о стоимости и доходе
        const buildingCosts = {
            "Лесоповал": {"железо": 5, "рабы": 3},
            "Каменоломня": {"дерево": 10, "железо": 5, "рабы": 3},
            "Теплицы": {"дерево": 16, "железо": 5, "овощи": 8},
            "Трактир": {"дерево": 14, "камень": 10, "железо": 3, "золото": 1},
            "Посевные поля": {"дерево": 10, "зерно": 12, "рабы": 2},
            "Рыболовня": {"дерево": 18, "железо": 6, "камень": 5},
            "Кузнечная": {"камень": 18, "железо": 12, "дерево": 10, "золото": 2},
            "Ферма": {"дерево": 16, "камень": 10, "скот": 4, "зерно": 8},
            "Постоялый двор": {"дерево": 20, "камень": 14, "железо": 5, "золото": 2},
            "Куртизанские палатки": {"дерево": 14, "золото": 5, "рабы": 5},
            "Золотой рудник": {"камень": 20, "железо": 10, "рабы": 5, "золото": 3}
        };
        
        const buildingIncome = {
            "Лесоповал": {"монеты": 0, "ресурсы": {"дерево": 3}},
            "Каменоломня": {"монеты": 0, "ресурсы": {"камень": 3}},
            "Теплицы": {"монеты": 0, "ресурсы": {"овощи": 3}},
            "Трактир": {"монеты": 63, "ресурсы": {}},
            "Посевные поля": {"монеты": 0, "ресурсы": {"зерно": 3}},
            "Рыболовня": {"монеты": 0, "ресурсы": {"рыба": 3}},
            "Кузнечная": {"монеты": 0, "ресурсы": {"железо": 4}},
            "Ферма": {"монеты": 0, "ресурсы": {"скот": 3}},
            "Постоялый двор": {"монеты": 147, "ресурсы": {}},
            "Куртизанские палатки": {"монеты": 167, "ресурсы": {}},
            "Золотой рудник": {"монеты": 0, "ресурсы": {"золото": 2}}
        };
        
        const costs = buildingCosts[buildingName] || {};
        const income = buildingIncome[buildingName] || {};
        
        // Форматируем стоимость
        let costText = '';
        const costEntries = Object.entries(costs);
        if (costEntries.length > 0) {
            costText = costEntries.map(([res, amt]) => `${res}: ${amt}`).join(', ');
        }
        
        // Форматируем доход
        let incomeText = '';
        if (income.монеты > 0) {
            incomeText = `${income.монеты} монет`;
        } else if (income.ресурсы && Object.keys(income.ресурсы).length > 0) {
            const incomeEntries = Object.entries(income.ресурсы);
            incomeText = incomeEntries.map(([res, amt]) => `${res}: ${amt}`).join(', ');
        }
        
        card.innerHTML = `
            <div class="building-name">${building.name}</div>
            <img src="${imagePath}" alt="${building.name}" class="building-image" onerror="this.style.display='none'">
            <div class="building-stats">
                <div class="building-count">${building.count}</div>
                <div class="building-percentage-container">
                    <div class="building-percentage">${Math.round(building.players_percentage)}%</div>
                    <div class="building-percentage-label">игроков</div>
                </div>
            </div>
            ${incomeText ? `<div class="building-income">${incomeText}</div>` : ''}
        `;
        
        // Добавляем обработчик клика для открытия модального окна
        card.addEventListener('click', function() {
            const name = this.getAttribute('data-building-name');
            const count = parseInt(this.getAttribute('data-building-count')) || 0;
            const percentage = parseInt(this.getAttribute('data-building-percentage')) || 0;
            openBuildingModal(name, count, percentage);
        });
        
        grid.appendChild(card);
    });
}

// Модальное окно для деталей объекта
const modal = document.getElementById('building-modal');
const modalClose = document.querySelector('.modal-close');

// Кнопки навигации
const modalNavLeft = document.getElementById('modal-nav-left');
const modalNavRight = document.getElementById('modal-nav-right');

// Обработчики навигации
modalNavLeft.addEventListener('click', () => {
    navigateToPrevious();
});

modalNavRight.addEventListener('click', () => {
    navigateToNext();
});

// Закрытие модального окна
modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// Навигация с клавиатуры
document.addEventListener('keydown', (event) => {
    if (modal.style.display === 'block') {
        if (event.key === 'ArrowLeft') {
            navigateToPrevious();
        } else if (event.key === 'ArrowRight') {
            navigateToNext();
        } else if (event.key === 'Escape') {
            modal.style.display = 'none';
        }
    }
});

// Функция для открытия модального окна с деталями объекта
async function openBuildingModal(buildingName, cardCount, cardPercentage) {
    // Находим индекс текущего объекта
    currentBuildingIndex = allBuildingsOrder.indexOf(buildingName);
    if (currentBuildingIndex === -1) {
        currentBuildingIndex = 0;
    }
    
    // Загружаем данные для текущего объекта
    await loadBuildingModalData(buildingName, cardCount, cardPercentage);
    
    // Обновляем состояние кнопок навигации
    updateNavigationButtons();
}

// Функция для загрузки данных объекта в модальное окно
async function loadBuildingModalData(buildingName, cardCount, cardPercentage) {
    try {
        // Используем данные из кэша, если они есть, иначе из параметров
        const cachedData = buildingsDataCache[buildingName];
        const count = cachedData ? cachedData.count : cardCount;
        const percentage = cachedData ? cachedData.percentage : cardPercentage;
        
        // Сначала заполняем данные из карточки (чтобы они совпадали)
        const imageFile = buildingImages[buildingName] || 'лесоповал.png';
        document.getElementById('modal-building-image').src = `/static/images/buildings/${imageFile}`;
        document.getElementById('modal-building-name').textContent = buildingName;
        document.getElementById('modal-building-count').textContent = count;
        document.getElementById('modal-building-percentage').textContent = `${percentage}%`;
        
        // Затем загружаем детальную информацию (владельцев)
        const response = await fetch(`/api/building/${encodeURIComponent(buildingName)}`);
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка загрузки данных:', data.error);
            return;
        }
        
        // Используем данные из карточки/кэша, чтобы они точно совпадали
        document.getElementById('modal-building-count').textContent = count;
        document.getElementById('modal-building-percentage').textContent = `${percentage}%`;
        
        // Заполняем информацию о стоимости и доходе
        const buildingCosts = {
            "Лесоповал": {"железо": 5, "рабы": 3},
            "Каменоломня": {"дерево": 10, "железо": 5, "рабы": 3},
            "Теплицы": {"дерево": 16, "железо": 5, "овощи": 8},
            "Трактир": {"дерево": 14, "камень": 10, "железо": 3, "золото": 1},
            "Посевные поля": {"дерево": 10, "зерно": 12, "рабы": 2},
            "Рыболовня": {"дерево": 18, "железо": 6, "камень": 5},
            "Кузнечная": {"камень": 18, "железо": 12, "дерево": 10, "золото": 2},
            "Ферма": {"дерево": 16, "камень": 10, "скот": 4, "зерно": 8},
            "Постоялый двор": {"дерево": 20, "камень": 14, "железо": 5, "золото": 2},
            "Куртизанские палатки": {"дерево": 14, "золото": 5, "рабы": 5},
            "Золотой рудник": {"камень": 20, "железо": 10, "рабы": 5, "золото": 3}
        };
        
        const buildingIncome = {
            "Лесоповал": {"монеты": 0, "ресурсы": {"дерево": 3}},
            "Каменоломня": {"монеты": 0, "ресурсы": {"камень": 3}},
            "Теплицы": {"монеты": 0, "ресурсы": {"овощи": 3}},
            "Трактир": {"монеты": 63, "ресурсы": {}},
            "Посевные поля": {"монеты": 0, "ресурсы": {"зерно": 3}},
            "Рыболовня": {"монеты": 0, "ресурсы": {"рыба": 3}},
            "Кузнечная": {"монеты": 0, "ресурсы": {"железо": 4}},
            "Ферма": {"монеты": 0, "ресурсы": {"скот": 3}},
            "Постоялый двор": {"монеты": 147, "ресурсы": {}},
            "Куртизанские палатки": {"монеты": 167, "ресурсы": {}},
            "Золотой рудник": {"монеты": 0, "ресурсы": {"золото": 2}}
        };
        
        // Заполняем стоимость
        const costList = document.getElementById('modal-building-cost-list');
        costList.innerHTML = '';
        const costs = buildingCosts[buildingName] || {};
        if (Object.keys(costs).length > 0) {
            Object.entries(costs).forEach(([resource, amount]) => {
                const li = document.createElement('li');
                li.textContent = `${resource}: ${amount}`;
                costList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'Нет данных';
            costList.appendChild(li);
        }
        
        // Заполняем доход
        const incomeValue = document.getElementById('modal-building-income-value');
        const income = buildingIncome[buildingName] || {};
        if (income.monеты > 0) {
            incomeValue.textContent = `${income.monеты} монет`;
        } else if (income.ресурсы && Object.keys(income.ресурсы).length > 0) {
            const incomeEntries = Object.entries(income.ресурсы);
            incomeValue.textContent = incomeEntries.map(([res, amt]) => `${res}: ${amt}`).join(', ');
        } else {
            incomeValue.textContent = 'Нет данных';
        }
        
        // Заполняем правую часть - список владельцев
        const ownersList = document.getElementById('modal-owners-list');
        ownersList.innerHTML = '';
        
        if (data.owners && data.owners.length > 0) {
            data.owners.forEach(owner => {
                const ownerItem = document.createElement('div');
                ownerItem.className = 'modal-owner-item';
                ownerItem.innerHTML = `
                    <span class="modal-owner-name">${owner.character_name || owner.name || 'Игрок'}</span>
                    <span class="modal-owner-count">${owner.count}</span>
                `;
                ownersList.appendChild(ownerItem);
            });
        } else {
            ownersList.innerHTML = '<div style="text-align: center; color: #3a2a1a; padding: 20px;">Нет владельцев</div>';
        }
        
        // Показываем модальное окно
        modal.style.display = 'block';
    } catch (error) {
        console.error('Ошибка при загрузке деталей объекта:', error);
    }
}

// Функция для обновления состояния кнопок навигации
function updateNavigationButtons() {
    const leftButton = document.getElementById('modal-nav-left');
    const rightButton = document.getElementById('modal-nav-right');
    
    // Левая кнопка: отключена на первом объекте
    leftButton.disabled = (currentBuildingIndex === 0);
    
    // Правая кнопка: отключена на последнем объекте
    rightButton.disabled = (currentBuildingIndex === allBuildingsOrder.length - 1);
}

// Функция для переключения на предыдущий объект
async function navigateToPrevious() {
    if (currentBuildingIndex > 0) {
        currentBuildingIndex--;
        const buildingName = allBuildingsOrder[currentBuildingIndex];
        const cachedData = buildingsDataCache[buildingName] || { count: 0, percentage: 0 };
        await loadBuildingModalData(buildingName, cachedData.count, cachedData.percentage);
        updateNavigationButtons();
    }
}

// Функция для переключения на следующий объект
async function navigateToNext() {
    if (currentBuildingIndex < allBuildingsOrder.length - 1) {
        currentBuildingIndex++;
        const buildingName = allBuildingsOrder[currentBuildingIndex];
        const cachedData = buildingsDataCache[buildingName] || { count: 0, percentage: 0 };
        await loadBuildingModalData(buildingName, cachedData.count, cachedData.percentage);
        updateNavigationButtons();
    }
}

// Модальное окно для деталей ресурса - инициализация после загрузки DOM
let resourceModal, resourceModalClose;
let resourceModalNavLeft, resourceModalNavRight;

// Функция для открытия модального окна с деталями ресурса
async function openResourceModal(resourceName) {
    // Находим индекс текущего ресурса
    currentResourceIndex = allResourcesOrder.indexOf(resourceName);
    if (currentResourceIndex === -1) {
        currentResourceIndex = 0;
    }
    
    // Загружаем данные для текущего ресурса
    await loadResourceModalData(resourceName);
    
    // Обновляем состояние кнопок навигации
    updateResourceNavigationButtons();
}

// Функция для загрузки данных ресурса в модальное окно
async function loadResourceModalData(resourceName) {
    try {
        const response = await fetch(`/api/resource/${encodeURIComponent(resourceName)}`);
        
        if (!response.ok) {
            console.error('Ошибка API:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка загрузки данных:', data.error);
            return;
        }
        
        // Заполняем данные
        const resourceNameCapitalized = data.name.charAt(0).toUpperCase() + data.name.slice(1);
        document.getElementById('resource-modal-name').textContent = resourceNameCapitalized;
        document.getElementById('resource-modal-price').textContent = `${data.current_price} монет`;
        
        // Загружаем картинку ресурса
        const imageFile = resourceImages[resourceName] || `${resourceName}.png`;
        const imagePath = `/static/images/resources/${imageFile}`;
        const imageEl = document.getElementById('resource-modal-image');
        imageEl.src = imagePath;
        imageEl.alt = resourceNameCapitalized;
        imageEl.style.display = 'block';
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        
        // Изменение за раунд
        const changeRoundClass = data.change_from_prev_percent > 0 ? 'positive' : 
                                 data.change_from_prev_percent < 0 ? 'negative' : 'neutral';
        const changeRoundSign = data.change_from_prev_percent > 0 ? '+' : '';
        const changeRoundEl = document.getElementById('resource-modal-change-round');
        changeRoundEl.textContent = `${changeRoundSign}${Math.round(data.change_from_prev_percent)}%`;
        changeRoundEl.className = `modal-stat-value ${changeRoundClass}`;
        
        // Изменение с начала игры
        const changeStartClass = data.change_from_start_percent > 0 ? 'positive' : 
                                data.change_from_start_percent < 0 ? 'negative' : 'neutral';
        const changeStartSign = data.change_from_start_percent > 0 ? '+' : '';
        const changeStartEl = document.getElementById('resource-modal-change-start');
        changeStartEl.textContent = `${changeStartSign}${Math.round(data.change_from_start_percent)}%`;
        changeStartEl.className = `modal-stat-value ${changeStartClass}`;
        
        // Спрос и предложение
        const demandEl = document.getElementById('resource-modal-demand');
        demandEl.textContent = data.demand_level;
        demandEl.setAttribute('data-level', data.demand_level);
        
        const supplyEl = document.getElementById('resource-modal-supply');
        supplyEl.textContent = data.supply_level;
        supplyEl.setAttribute('data-level', data.supply_level);
        
        // Показываем модальное окно
        if (resourceModal) {
            resourceModal.style.display = 'block';
        } else {
            // Попробуем найти его снова
            resourceModal = document.getElementById('resource-modal');
            if (resourceModal) {
                resourceModal.style.display = 'block';
            }
        }
        
        // Отрисовываем график после отображения модального окна (чтобы canvas имел правильный размер)
        setTimeout(() => {
            drawPriceChart(data.price_history);
        }, 100);
    } catch (error) {
        console.error('Ошибка при загрузке деталей ресурса:', error);
    }
}

// Функция для обновления состояния кнопок навигации ресурсов
function updateResourceNavigationButtons() {
    if (!resourceModalNavLeft || !resourceModalNavRight) return;
    
    // Левая кнопка: отключена на первом ресурсе
    resourceModalNavLeft.disabled = (currentResourceIndex === 0);
    
    // Правая кнопка: отключена на последнем ресурсе
    resourceModalNavRight.disabled = (currentResourceIndex === allResourcesOrder.length - 1);
}

// Функция для переключения на предыдущий ресурс
async function navigateToPreviousResource() {
    if (currentResourceIndex > 0) {
        currentResourceIndex--;
        const resourceName = allResourcesOrder[currentResourceIndex];
        await loadResourceModalData(resourceName);
        updateResourceNavigationButtons();
    }
}

// Функция для переключения на следующий ресурс
async function navigateToNextResource() {
    if (currentResourceIndex < allResourcesOrder.length - 1) {
        currentResourceIndex++;
        const resourceName = allResourcesOrder[currentResourceIndex];
        await loadResourceModalData(resourceName);
        updateResourceNavigationButtons();
    }
}

// Функция для отрисовки графика цены
function drawPriceChart(priceHistory) {
    const canvas = document.getElementById('resource-price-chart');
    if (!canvas) {
        console.error('Canvas не найден');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Устанавливаем размер canvas
    const container = canvas.parentElement;
    if (container) {
        canvas.width = container.clientWidth - 20; // Учитываем padding
    } else {
        canvas.width = canvas.offsetWidth || 400;
    }
    canvas.height = 300;
    
    if (!priceHistory || priceHistory.length === 0) {
        ctx.fillStyle = '#3a2a1a';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для графика', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Параметры графика
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Стандартизируем: в точке 0 (раунд 0) цена должна быть 0
    let standardizedHistory = priceHistory.map((point, index) => {
        if (index === 0 && point.round === 0) {
            return { round: 0, price: 0 };
        }
        return point;
    });
    
    // Убираем последнюю точку, если она дублирует предыдущую (последний шаг графика прямой)
    if (standardizedHistory.length > 2) {
        const lastPoint = standardizedHistory[standardizedHistory.length - 1];
        const prevPoint = standardizedHistory[standardizedHistory.length - 2];
        
        // Если последняя точка имеет тот же раунд, что и предыдущая, или ту же цену - убираем её
        if (lastPoint.round === prevPoint.round || lastPoint.price === prevPoint.price) {
            standardizedHistory = standardizedHistory.slice(0, -1);
        }
    }
    
    // Находим минимальное и максимальное значение цены
    // Для оси Y: минимум всегда 0, максимум - максимальная цена
    const prices = standardizedHistory.map(h => h.price);
    const minPrice = 0; // Ось Y всегда начинается с 0
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Избегаем деления на ноль
    
    // Рисуем оси
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;
    
    // Ось X (раунды)
    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Ось Y (цена)
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();
    
    // Рисуем сетку и подписи
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Горизонтальные линии (цены)
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding + (chartHeight / gridLines) * i;
        const price = maxPrice - (priceRange / gridLines) * i;
        
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
        
        // Подпись цены
        ctx.fillStyle = '#3a2a1a';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(price).toString(), padding - 10, y + 4);
    }
    
    ctx.setLineDash([]);
    
    // Рисуем график
    // Линия начинается с цены первого раунда (пропускаем точку 0)
    ctx.strokeStyle = '#006400'; // Темно-зеленый цвет
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    let lineStarted = false;
    standardizedHistory.forEach((point, index) => {
        const x = padding + (chartWidth / (standardizedHistory.length - 1)) * index;
        const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        // Пропускаем точку 0 (раунд 0), начинаем линию с первого раунда
        if (index === 0) {
            // Не рисуем линию от точки 0, но сохраняем координату для точки
            return;
        }
        
        if (!lineStarted) {
            // Начинаем линию с цены первого раунда
            ctx.moveTo(x, y);
            lineStarted = true;
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Рисуем точки (включая точку 0)
    ctx.fillStyle = '#006400'; // Темно-зеленый цвет
    standardizedHistory.forEach((point, index) => {
        const x = padding + (chartWidth / (standardizedHistory.length - 1)) * index;
        const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Подпись раунда
        if (index === 0 || index === standardizedHistory.length - 1 || index % Math.ceil(standardizedHistory.length / 5) === 0) {
            ctx.fillStyle = '#3a2a1a';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(point.round.toString(), x, canvas.height - padding + 20);
            ctx.fillStyle = '#006400'; // Темно-зеленый цвет
        }
    });
    
    // Подписи осей
    ctx.fillStyle = '#3a2a1a';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Раунд', canvas.width / 2, canvas.height - 10);
    
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Цена (монеты)', 0, 0);
    ctx.restore();
}

// Функции управления игровым flow
function setupGameFlow() {
    // Кнопка "Начать игру"
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            playVideo('Введение.mp4', () => {
                showScreen('intro-complete');
            });
        });
    }

    // Кнопка "Начать первый раунд"
    const startRound1Btn = document.getElementById('start-round-1-btn');
    if (startRound1Btn) {
        startRound1Btn.addEventListener('click', () => {
            startRound(1);
        });
    }

    // Кнопка "Правила игры"
    const rulesBtn = document.getElementById('rules-btn');
    if (rulesBtn) {
        rulesBtn.addEventListener('click', () => {
            showRulesScreen();
        });
    }

    // Кнопка "Следующий раунд"
    const nextRoundBtn = document.getElementById('next-round-btn');
    if (nextRoundBtn) {
        nextRoundBtn.addEventListener('click', async () => {
            // Используем gameState.currentRound вместо чтения из DOM
            const currentRound = gameState.currentRound || parseInt(document.getElementById('current-round').textContent) || 1;
            if (currentRound < 10) {
                const nextRound = currentRound + 1;
                
                // Обновляем раунд на сервере (если endpoint доступен)
                try {
                    const response = await fetch('/api/game/next-round', {
                        method: 'POST'
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success) {
                            startRound(data.current_round);
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('Не удалось обновить раунд на сервере (продолжаем локально):', error);
                }
                
                // Если не удалось обновить на сервере, просто увеличиваем локально
                startRound(nextRound);
            }
        });
    }

    // Кнопка "Подвести итоги"
    const finalResultsBtn = document.getElementById('final-results-btn');
    if (finalResultsBtn) {
        finalResultsBtn.addEventListener('click', () => {
            showFinalResults();
        });
    }

    // Обработчик окончания видео удален - теперь используется callback в playVideo()
    // Это позволяет показывать модальное окно со сводкой после видео раунда
}

function playVideo(filename, onComplete) {
    const videoScreen = document.getElementById('video-screen');
    const video = document.getElementById('game-video');
    
    if (!video || !videoScreen) return;
    
    console.log('Исходное имя файла:', filename); // Логирование
    
    gameState.isVideoPlaying = true;
    gameState.currentScreen = 'video';
    
    // Определяем путь к видео: Google Drive или локальный
    let videoPath;
    if (USE_GOOGLE_DRIVE && VIDEO_DRIVE_IDS[filename]) {
        // Используем Google Drive
        const fileId = VIDEO_DRIVE_IDS[filename];
        if (fileId === 'YOUR_FILE_ID') {
            console.error('Ошибка: не указан Google Drive ID для файла:', filename);
            console.error('Пожалуйста, замените YOUR_FILE_ID на реальный ID файла в конфигурации VIDEO_DRIVE_IDS');
            // Fallback на локальный путь
            const encodedFilename = encodeURIComponent(filename);
            videoPath = `/static/videos/${encodedFilename}`;
        } else {
            videoPath = `${GOOGLE_DRIVE_BASE_URL}${fileId}`;
        }
    } else {
        // Используем локальный путь
        const encodedFilename = encodeURIComponent(filename);
        videoPath = `/static/videos/${encodedFilename}`;
    }
    
    console.log('Полный путь к видео:', videoPath); // Логирование
    
    video.src = videoPath;
    showScreen('video');
    
    // Добавить обработчик ошибок загрузки
    video.onerror = (e) => {
        console.error('Ошибка загрузки видео:', e);
        console.error('Путь к видео:', video.src);
        console.error('Текущий src элемента:', video.currentSrc);
        console.error('Код ошибки:', video.error ? video.error.code : 'неизвестно');
    };
    
    // Сохраняем callback для использования в обработчике ended
    // Удаляем предыдущий обработчик, чтобы избежать множественных вызовов
    video.onended = null;
    video.onended = () => {
        // Проверяем, что обработчик еще не сработал
        if (!gameState.isVideoPlaying) {
            return; // Уже обработано
        }
        gameState.isVideoPlaying = false;
        
        // Скрываем видео-экран
        const videoScreen = document.getElementById('video-screen');
        if (videoScreen) {
            videoScreen.style.display = 'none';
        }
        
        if (onComplete) onComplete();
    };
    
    video.play().catch(err => {
        console.error('Ошибка воспроизведения видео:', err);
        // Если автовоспроизведение не удалось, все равно показываем видео
    });
}

async function startRound(roundNumber) {
    // Устанавливаем флаг, что раунд установлен вручную
    gameState.roundManuallySet = true;
    gameState.currentRound = roundNumber;
    
    // Обновляем отображение раунда в DOM сразу
    const roundElement = document.getElementById('current-round');
    if (roundElement) {
        roundElement.textContent = roundNumber;
    }
    
    // Обновляем раунд на сервере (если endpoint доступен)
    try {
        const response = await fetch('/api/game/set-round', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ round: roundNumber })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                gameState.currentRound = data.current_round;
                if (roundElement) {
                    roundElement.textContent = data.current_round;
                }
            }
        } else {
            console.warn('Не удалось обновить раунд на сервере, продолжаем локально');
        }
    } catch (error) {
        console.warn('Ошибка обновления раунда на сервере (продолжаем локально):', error);
    }
    
    // Показываем видео раунда
    playVideo(`Раунд ${gameState.currentRound}.mp4`, () => {
        // После видео показываем основной экран
        showScreen('game');
        connectWebSocket();
        updateRoundControls(gameState.currentRound);
    });
}

function updateRoundControls(roundNumber) {
    const nextRoundBtn = document.getElementById('next-round-btn');
    const finalResultsBtn = document.getElementById('final-results-btn');
    
    if (roundNumber < 10) {
        if (nextRoundBtn) {
            nextRoundBtn.style.display = 'block';
        }
        if (finalResultsBtn) {
            finalResultsBtn.style.display = 'none';
        }
    } else {
        if (nextRoundBtn) {
            nextRoundBtn.style.display = 'none';
        }
        if (finalResultsBtn) {
            finalResultsBtn.style.display = 'block';
        }
    }
}

function showScreen(screenName) {
    // Скрываем все экраны
    const screens = ['start-screen', 'video-screen', 'intro-complete-screen', 'rules-screen', 'game-screen', 'final-results-screen'];
    screens.forEach(screen => {
        const el = document.getElementById(screen);
        if (el) el.style.display = 'none';
    });
    
    // Показываем нужный экран
    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
        targetScreen.style.display = 'block';
    }
    
    gameState.currentScreen = screenName;
}

// Функция для показа экрана с правилами
function showRulesScreen() {
    showScreen('rules');
    // Прокручиваем в начало страницы
    window.scrollTo(0, 0);
}

// Функция для возврата с экрана правил
function goBackFromRules() {
    showScreen('intro-complete');
}

async function showFinalResults() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        
        console.log('Данные от API:', data); // Для отладки
        
        if (data.error) {
            console.error('Ошибка загрузки рейтинга:', data.error);
            return;
        }
        
        if (!data.leaderboard || data.leaderboard.length === 0) {
            console.error('Рейтинг пустой!');
            return;
        }
        
        const leaderboard = data.leaderboard;
        const tbody = document.getElementById('final-leaderboard-body');
        if (!tbody) {
            console.error('Элемент final-leaderboard-body не найден!');
            return;
        }
        
        tbody.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            
            // Прирост за раунд
            const growthRound = player.growth_round_percent || player.growth_percent || 0;
            const growthRoundClass = growthRound > 0 ? 'positive' : 
                                   growthRound < 0 ? 'negative' : 'neutral';
            const growthRoundSign = growthRound > 0 ? '+' : '';
            
            // Прирост за игру
            const growthGame = player.growth_game_percent || 0;
            const growthGameClass = growthGame > 0 ? 'positive' : 
                                   growthGame < 0 ? 'negative' : 'neutral';
            const growthGameSign = growthGame > 0 ? '+' : '';
            
            row.innerHTML = `
                <td><strong style="color: #3a2a1a;">${index + 1}</strong></td>
                <td style="color: #3a2a1a;">${player.character_name || player.name || 'Игрок'}</td>
                <td style="color: #3a2a1a;">${Math.round(player.total_value)} монет</td>
                <td class="${growthRoundClass}">${growthRoundSign}${Math.round(growthRound)}%</td>
                <td class="${growthGameClass}">${growthGameSign}${Math.round(growthGame)}%</td>
            `;
            
            tbody.appendChild(row);
        });
        
        showScreen('final-results');
        
        // Проверяем, что экран действительно показан
        setTimeout(() => {
            const finalScreen = document.getElementById('final-results-screen');
            if (finalScreen) {
                console.log('Экран итогов найден, display:', finalScreen.style.display);
                if (finalScreen.style.display === 'none' || !finalScreen.style.display) {
                    // Принудительно показываем экран
                    finalScreen.style.display = 'block';
                    console.log('Экран итогов принудительно показан');
                }
            } else {
                console.error('Экран final-results-screen не найден!');
            }
        }, 100);
    } catch (error) {
        console.error('Ошибка загрузки итогов:', error);
        console.error('Стек ошибки:', error.stack);
    }
}

function createPlayerCard(player, place, size) {
    if (!player) {
        console.error('createPlayerCard: player is null or undefined');
        return '<div>Ошибка: данные игрока отсутствуют</div>';
    }
    
    const imageSrc = player.character_image 
        ? (player.character_image.startsWith('/static/') 
            ? player.character_image 
            : `/static/images/characters/${player.character_image}`)
        : '/static/images/logo.png';
    const playerName = player.character_name || player.name || 'Игрок';
    const totalValue = player.total_value || 0;
    const growthGamePercent = player.growth_game_percent || 0;
    const growthSign = growthGamePercent > 0 ? '+' : '';
    const growthClass = growthGamePercent > 0 ? 'positive' : 
                       growthGamePercent < 0 ? 'negative' : 'neutral';
    
    return `
        <div class="final-card-place">${place} место</div>
        <img src="${imageSrc}" alt="${playerName}" class="final-card-image" onerror="this.src='/static/images/logo.png'">
        <div class="final-card-name">${playerName}</div>
        <div class="final-card-capitalization">${Math.round(totalValue)} монет</div>
        <div class="final-card-growth ${growthClass}">${growthSign}${Math.round(growthGamePercent)}%</div>
    `;
}

function createPlayerListItem(player, place) {
    if (!player) {
        console.error('createPlayerListItem: player is null or undefined');
        return '<div>Ошибка: данные игрока отсутствуют</div>';
    }
    
    const imageSrc = player.character_image 
        ? (player.character_image.startsWith('/static/') 
            ? player.character_image 
            : `/static/images/characters/${player.character_image}`)
        : '/static/images/logo.png';
    const playerName = player.character_name || player.name || 'Игрок';
    const totalValue = player.total_value || 0;
    const growthGamePercent = player.growth_game_percent || 0;
    const growthSign = growthGamePercent > 0 ? '+' : '';
    const growthClass = growthGamePercent > 0 ? 'positive' : 
                       growthGamePercent < 0 ? 'negative' : 'neutral';
    
    return `
        <div class="final-rest-place">${place}</div>
        <img src="${imageSrc}" alt="${playerName}" class="final-rest-image" onerror="this.src='/static/images/logo.png'">
        <div class="final-rest-name">${playerName}</div>
        <div class="final-rest-capitalization">${Math.round(totalValue)} монет</div>
        <div class="final-rest-growth ${growthClass}">${growthSign}${Math.round(growthGamePercent)}%</div>
    `;
}

// Подключаемся при загрузке страницы
window.addEventListener('load', () => {
    // Инициализация модального окна ресурса
    resourceModal = document.getElementById('resource-modal');
    resourceModalClose = document.getElementById('resource-modal-close');
    resourceModalNavLeft = document.getElementById('resource-modal-nav-left');
    resourceModalNavRight = document.getElementById('resource-modal-nav-right');
    
    // Обработчики навигации ресурсов
    if (resourceModalNavLeft) {
        resourceModalNavLeft.addEventListener('click', () => {
            navigateToPreviousResource();
        });
    }
    
    if (resourceModalNavRight) {
        resourceModalNavRight.addEventListener('click', () => {
            navigateToNextResource();
        });
    }
    
    if (resourceModalClose) {
        resourceModalClose.addEventListener('click', () => {
            if (resourceModal) {
                resourceModal.style.display = 'none';
            }
        });
    }
    
    // Закрытие при клике вне модального окна - исправлено для избежания конфликта
    document.addEventListener('click', (event) => {
        if (resourceModal && event.target === resourceModal) {
            resourceModal.style.display = 'none';
        }
    });
    
    // Навигация с клавиатуры для ресурсов
    document.addEventListener('keydown', (event) => {
        if (resourceModal && resourceModal.style.display === 'block') {
            if (event.key === 'ArrowLeft') {
                navigateToPreviousResource();
            } else if (event.key === 'ArrowRight') {
                navigateToNextResource();
            } else if (event.key === 'Escape') {
                resourceModal.style.display = 'none';
            }
        }
    });
    
    // Настройка игрового flow
    setupGameFlow();
    
    // Не подключаемся к WebSocket сразу, только когда показываем игровой экран
});

// Функции для модального окна со сводкой по раунду
// Флаг для предотвращения множественных вызовов
let isShowingRoundSummary = false;

async function showRoundSummary(roundNumber) {
    // Предотвращаем множественные вызовы
    if (isShowingRoundSummary) {
        console.log('showRoundSummary уже выполняется, пропускаем');
        return;
    }
    
    isShowingRoundSummary = true;
    console.log(`Попытка загрузить сводку для раунда ${roundNumber}`);
    
    // Скрываем видео-экран сразу
    const videoScreen = document.getElementById('video-screen');
    if (videoScreen) {
        videoScreen.style.display = 'none';
    }
    
    try {
        // Пробуем сначала основной endpoint
        let response = await fetch(`/api/round/${roundNumber}/summary`);
        console.log(`Ответ от основного endpoint: status=${response.status}, ok=${response.ok}`);
        
        // Если основной не работает, пробуем альтернативный
        if (!response.ok) {
            console.log('Основной endpoint не работает, пробуем альтернативный...');
            response = await fetch(`/api/round-summary/${roundNumber}`);
            console.log(`Ответ от альтернативного endpoint: status=${response.status}, ok=${response.ok}`);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Ошибка HTTP: ${response.status}, текст: ${errorText}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const summary = await response.json();
        console.log('Сводка получена:', summary);
        
        // Заполняем модальное окно
        const modal = document.getElementById('round-summary-modal');
        const titleEl = document.getElementById('round-summary-title');
        const eventsEl = document.getElementById('round-summary-events');
        const resourcesEl = document.getElementById('round-summary-resources');
        const resourcesListEl = document.getElementById('round-summary-resources-list');
        const buildingsEl = document.getElementById('round-summary-buildings');
        const buildingsListEl = document.getElementById('round-summary-buildings-list');
        
        if (!modal || !titleEl || !eventsEl) {
            console.error('Элементы модального окна не найдены');
            // Если модальное окно не найдено, просто показываем игру
            showScreen('game');
            connectWebSocket();
            updateRoundControls(roundNumber);
            return;
        }
        
        // Заголовок
        titleEl.textContent = summary.title || `Раунд ${roundNumber}`;
        
        // События
        eventsEl.innerHTML = '';
        if (summary.events.positive_description) {
            const p1 = document.createElement('p');
            p1.textContent = summary.events.positive_description;
            eventsEl.appendChild(p1);
        }
        if (summary.events.positive2_description) {
            const p2 = document.createElement('p');
            p2.textContent = summary.events.positive2_description;
            eventsEl.appendChild(p2);
        }
        if (summary.events.negative_description) {
            const p3 = document.createElement('p');
            p3.textContent = summary.events.negative_description;
            eventsEl.appendChild(p3);
        }
        
        // Ресурсы
        if (summary.key_resources && summary.key_resources.length > 0) {
            resourcesEl.style.display = 'block';
            resourcesListEl.innerHTML = '';
            summary.key_resources.forEach(resource => {
                const item = document.createElement('div');
                item.className = 'round-summary-item';
                
                const name = document.createElement('div');
                name.className = 'round-summary-item-name';
                name.textContent = resource.name.charAt(0).toUpperCase() + resource.name.slice(1);
                
                const change = document.createElement('div');
                change.className = `round-summary-item-change ${resource.direction}`;
                const sign = resource.direction === 'up' ? '+' : '';
                change.textContent = `${sign}${resource.change_percent}%`;
                
                const reason = document.createElement('div');
                reason.className = 'round-summary-item-reason';
                reason.textContent = resource.reason;
                
                item.appendChild(name);
                item.appendChild(change);
                item.appendChild(reason);
                resourcesListEl.appendChild(item);
            });
        } else {
            resourcesEl.style.display = 'none';
        }
        
        // Объекты
        if (summary.key_buildings && summary.key_buildings.length > 0) {
            buildingsEl.style.display = 'block';
            buildingsListEl.innerHTML = '';
            summary.key_buildings.forEach(building => {
                const item = document.createElement('div');
                item.className = 'round-summary-item';
                
                const name = document.createElement('div');
                name.className = 'round-summary-item-name';
                name.textContent = building.name;
                
                const change = document.createElement('div');
                change.className = `round-summary-item-change ${building.direction}`;
                const sign = building.direction === 'up' ? '+' : '';
                change.textContent = `${sign}${building.income_change_percent}%`;
                
                const reason = document.createElement('div');
                reason.className = 'round-summary-item-reason';
                reason.textContent = building.reason;
                
                item.appendChild(name);
                item.appendChild(change);
                item.appendChild(reason);
                buildingsListEl.appendChild(item);
            });
        } else {
            buildingsEl.style.display = 'none';
        }
        
        // Скрываем видео-экран перед показом модального окна (на всякий случай)
        const videoScreen = document.getElementById('video-screen');
        if (videoScreen) {
            videoScreen.style.display = 'none';
        }
        
        // Показываем модальное окно
        console.log('Показываем модальное окно');
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('Ошибка загрузки сводки по раунду:', error);
        console.error('Детали ошибки:', error.message, error.stack);
        
        // Сбрасываем флаг при ошибке
        isShowingRoundSummary = false;
        
        // Скрываем видео-экран
        const videoScreen = document.getElementById('video-screen');
        if (videoScreen) {
            videoScreen.style.display = 'none';
        }
        
        // В случае ошибки API показываем модальное окно с базовой информацией
        const modal = document.getElementById('round-summary-modal');
        const titleEl = document.getElementById('round-summary-title');
        const eventsEl = document.getElementById('round-summary-events');
        
        if (modal && titleEl && eventsEl) {
            titleEl.textContent = `Раунд ${roundNumber}`;
            eventsEl.innerHTML = `<p>Информация о событиях раунда будет доступна после обработки раунда.</p>`;
            
            // Скрываем секции с ресурсами и объектами
            const resourcesEl = document.getElementById('round-summary-resources');
            const buildingsEl = document.getElementById('round-summary-buildings');
            if (resourcesEl) resourcesEl.style.display = 'none';
            if (buildingsEl) buildingsEl.style.display = 'none';
            
            // Показываем модальное окно
            modal.style.display = 'block';
        } else {
            // Если модальное окно не найдено, просто показываем игру
            showScreen('game');
            connectWebSocket();
            updateRoundControls(roundNumber);
        }
    }
}

function closeRoundSummary() {
    // Сбрасываем флаг
    isShowingRoundSummary = false;
    
    const modal = document.getElementById('round-summary-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // После закрытия модального окна показываем основной экран
    showScreen('game');
    connectWebSocket();
    updateRoundControls(gameState.currentRound);
}

// Закрытие модального окна по клику на фон
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('round-summary-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRoundSummary();
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeRoundSummary();
            }
        });
    }
});

