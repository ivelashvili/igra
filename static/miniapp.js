// Telegram WebApp API
// Используем существующий window.Telegram.WebApp, если он есть (например, из miniapp_test.html)
// Иначе создаем fallback объект
let tg;
if (window.Telegram?.WebApp) {
    tg = window.Telegram.WebApp;
} else {
    tg = {
        initData: 'test_init_data',
        initDataUnsafe: { 
            user: { 
                id: 12345, 
                first_name: 'Тестовый', 
                username: 'test',
                photo_url: 'https://via.placeholder.com/200'
            } 
        },
        ready: () => {},
        expand: () => {}
    };
}

// Инициализация Telegram WebApp (если доступно)
if (window.Telegram?.WebApp) {
    tg.ready();
    tg.expand();
}

// Глобальные переменные
let playerState = null;
let prices = [];
let currentRound = 1;
let playerId = null;
let playerName = null;
let isAuthorized = false;
let telegramUser = null;
let updateInterval = null; // Интервал для обновления данных
let currentResource = null; // Текущий ресурс на странице ресурса
let currentBuilding = null; // Текущий объект на странице объекта
let currentBuildingStatus = null; // Статус текущего объекта
let previousScreen = 'portfolio'; // Предыдущий экран для кнопки "Назад"
let originScreen = 'portfolio'; // Исходный экран (портфель или биржа), откуда зашли в ресурс
let selectedCharacter = null; // Выбранный персонаж для подтверждения

// Список персонажей (33 персонажа)
const characters = [
    { name: 'Алексей Пермский', image: '/static/images/characters/Алексей Пермский.png' },
    { name: 'Анастасия Барабинская', image: '/static/images/characters/Анастасия Барабинская.png' },
    { name: 'Анастасия Бердская', image: '/static/images/characters/Анастасия Бердская.png' },
    { name: 'Анастасия Шеврикская', image: '/static/images/characters/Анастасия Шеврикская.png' },
    { name: 'Арсений Жестокий', image: '/static/images/characters/Арсений Жестокий.png' },
    { name: 'Артемий Строитель', image: '/static/images/characters/Артемий Строитель.png' },
    { name: 'Аслан Акбайский', image: '/static/images/characters/Аслан Акбайский.png' },
    { name: 'Ахмед Бакийский', image: '/static/images/characters/Ахмед Бакийский.png' },
    { name: 'Бато Даши Цыден', image: '/static/images/characters/Бато Даши Цыден.png' },
    { name: 'Валерия Караболта', image: '/static/images/characters/Валерия Караболта.png' },
    { name: 'Виктория Мудрая', image: '/static/images/characters/Виктория Мудрая.png' },
    { name: 'Всеволод Умный', image: '/static/images/characters/Всеволод Умный.png' },
    { name: 'Дарья Великая', image: '/static/images/characters/Дарья Великая.png' },
    { name: 'Денис Бийский', image: '/static/images/characters/Денис Бийский.png' },
    { name: 'Ева Прородительница', image: '/static/images/characters/Ева Прородительница.png' },
    { name: 'Евгений Панасенков', image: '/static/images/characters/Евгений Панасенков.png' },
    { name: 'Евгений Тогучинский', image: '/static/images/characters/Евгений Тогучинский.png' },
    { name: 'Елена Жан-Мазова', image: '/static/images/characters/Елена Жан-Мазова.png' },
    { name: 'Жан Владлен', image: '/static/images/characters/Жан Владлен.png' },
    { name: 'Жан Дони', image: '/static/images/characters/Жан Дони.png' },
    { name: 'Игорь Ангарский', image: '/static/images/characters/Игорь Ангарский.png' },
    { name: 'Игорь Лысков', image: '/static/images/characters/Игорь Лысков.png' },
    { name: 'Кирилл Великолепный', image: '/static/images/characters/Кирилл Великолепный.png' },
    { name: 'Кирилл Храбрый', image: '/static/images/characters/Кирилл Храбрый.png' },
    { name: 'Клуни', image: '/static/images/characters/Клуни.png' },
    { name: 'Леван Картлийский', image: '/static/images/characters/Леван Картлийский.png' },
    { name: 'Маргарита Матерь', image: '/static/images/characters/Маргарита Матерь.png' },
    { name: 'Мария Светлая', image: '/static/images/characters/Мария Светлая.png' },
    { name: 'Месси Леонель', image: '/static/images/characters/Месси Леонель.png' },
    { name: 'Михаил Заебийский', image: '/static/images/characters/Михаил Заебийский.png' },
    { name: 'Петр Братский', image: '/static/images/characters/Петр Братский.png' },
    { name: 'Татьяна Пермская', image: '/static/images/characters/Татьяна Пермская.png' },
    { name: 'Юрий Каркаде', image: '/static/images/characters/Юрий Каркаде.png' }
];

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Получаем данные пользователя из Telegram
        telegramUser = tg.initDataUnsafe?.user;
        if (!telegramUser) {
            console.warn('Telegram user not found, using test mode');
            // В тестовом режиме продолжаем работу
            telegramUser = { id: 12345, first_name: 'Тестовый', username: 'test' };
        }

        playerId = `tg_${telegramUser.id}`;
        
        // Скрываем main-container до проверки авторизации
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
        
        // Проверяем, авторизован ли игрок
        await checkAuth();
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showToast('Ошибка загрузки данных', 'error');
        // В случае ошибки показываем контейнер для отладки
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.style.display = 'block';
            initializeScreens();
        }
    }
});

// Проверка авторизации
async function checkAuth() {
    try {
        const response = await fetch('/api/miniapp/player/state', {
            headers: {
                'X-Telegram-Init-Data': tg.initData || 'test_init_data'
            }
        });

        if (!response.ok) {
            console.error('Ошибка проверки авторизации:', response.status, response.statusText);
            // В тестовом режиме продолжаем работу
            const mainContainer = document.getElementById('main-container');
            if (mainContainer) {
                mainContainer.style.display = 'block';
                initializeScreens();
            }
            // Показываем выбор персонажа вместо несуществующей функции showAuthModal
            showCharacterSelection();
            return;
        }

        const data = await response.json();
        console.log('Данные игрока:', data);
        
        // Если игрок не найден или нет персонажа - показываем окно выбора персонажа
        if (!data.character_name) {
            // Показываем контейнер даже если нет авторизации (для тестового режима)
            const mainContainer = document.getElementById('main-container');
            if (mainContainer) {
                mainContainer.style.display = 'block';
                initializeScreens();
            }
            showCharacterSelection();
            return;
        }

        // Игрок авторизован
        isAuthorized = true;
        playerName = data.character_name || data.nickname;
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.style.display = 'block';
            // Инициализируем экраны
            initializeScreens();
        }
        
        // Загружаем начальные данные
        await loadPlayerState();
        await loadPrices();
        await loadRoundInfo();

        // Обновляем данные каждые 2 секунды (очищаем предыдущий интервал, если есть)
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        updateInterval = setInterval(async () => {
            await loadPlayerState();
            await loadPrices();
            await loadRoundInfo();
        }, 2000);
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        // В случае ошибки показываем контейнер для тестового режима
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) {
            mainContainer.style.display = 'block';
            initializeScreens();
        }
        // Если игрок не найден, показываем окно выбора персонажа
        showCharacterSelection();
    }
}

// Показать окно выбора персонажа
async function showCharacterSelection() {
    const screen = document.getElementById('character-selection-screen');
    const grid = document.getElementById('character-selection-grid');
    const mainContainer = document.getElementById('main-container');
    
    if (!screen || !grid) {
        console.error('Элементы страницы выбора персонажа не найдены');
        return;
    }
    
    // Скрываем основной контейнер
    if (mainContainer) {
        mainContainer.style.display = 'none';
    }
    
    screen.style.display = 'block';
    grid.innerHTML = '<div style="text-align: center; padding: 20px;">Загрузка...</div>';
    
    try {
        // Получаем список уже выбранных персонажей
        const response = await fetch('/api/miniapp/characters/taken');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const takenCharacterNames = new Set((data.taken_characters || []).map(c => c.name));
        
        // Фильтруем персонажей - показываем только тех, кто еще не выбран
        const availableCharacters = characters.filter(character => !takenCharacterNames.has(character.name));
        
        grid.innerHTML = '';
        
        if (availableCharacters.length === 0) {
            grid.innerHTML = '<div style="text-align: center; padding: 20px; color: #3a2a1a;">Все персонажи уже выбраны</div>';
            return;
        }
        
        // Создаем карточки персонажей
        availableCharacters.forEach(character => {
            const card = document.createElement('div');
            card.className = 'character-card';
            
            // Экранируем кавычки и специальные символы для безопасного использования в HTML
            const escapedName = character.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const escapedImage = character.image.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            
            card.innerHTML = `
                <div class="character-card-avatar">
                    <img src="${escapedImage}" alt="${escapedName}" class="character-avatar-img">
                </div>
                <div class="character-card-name">${character.name}</div>
                <button class="character-card-select-btn" onclick="selectCharacter('${escapedName}', '${escapedImage}')">Выбрать</button>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки списка персонажей:', error);
        grid.innerHTML = '<div style="text-align: center; padding: 20px; color: #8b4513;">Ошибка загрузки. Попробуйте обновить страницу.</div>';
    }
}

// Выбрать персонажа
function selectCharacter(name, image) {
    selectedCharacter = { name, image };
    
    // Показываем модальное окно подтверждения
    const confirmModal = document.getElementById('character-confirm-modal');
    const confirmAvatar = document.getElementById('confirm-character-avatar');
    const confirmName = document.getElementById('confirm-character-name');
    
    if (confirmModal && confirmAvatar && confirmName) {
        confirmAvatar.src = image;
        confirmName.textContent = name;
        confirmModal.style.display = 'flex';
    }
}

// Отменить выбор персонажа
function cancelCharacterSelection() {
    const confirmModal = document.getElementById('character-confirm-modal');
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }
    selectedCharacter = null;
}

// Подтвердить выбор персонажа
async function confirmCharacterSelection() {
    if (!selectedCharacter) {
        showToast('Персонаж не выбран', 'error');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/miniapp/player/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': tg.initData || 'test_init_data'
            },
            body: JSON.stringify({
                character_name: selectedCharacter.name,
                character_image: selectedCharacter.image
            })
        });

        const data = await response.json();

        if (data.success) {
            isAuthorized = true;
            playerName = selectedCharacter.name;
            
            // Скрываем экран выбора персонажа
            const screen = document.getElementById('character-selection-screen');
            const confirmModal = document.getElementById('character-confirm-modal');
            if (screen) screen.style.display = 'none';
            if (confirmModal) confirmModal.style.display = 'none';
            
            // Показываем основной контейнер
            const mainContainer = document.getElementById('main-container');
            if (mainContainer) {
                mainContainer.style.display = 'block';
            }
            
            // Инициализируем экраны
            initializeScreens();
            
            // Загружаем начальные данные
            await loadPlayerState();
            await loadPrices();
            await loadRoundInfo();

            // Обновляем данные каждые 2 секунды (очищаем предыдущий интервал, если есть)
            if (updateInterval) {
                clearInterval(updateInterval);
            }
            updateInterval = setInterval(async () => {
                await loadPlayerState();
                await loadPrices();
                await loadRoundInfo();
            }, 2000);
        } else {
            const errorMessage = data.message || 'Ошибка сохранения данных';
            showToast(errorMessage, 'error');
            
            // Если персонаж уже выбран, обновляем список персонажей
            if (errorMessage.includes('уже выбран')) {
                // Обновляем список, чтобы убрать уже выбранного персонажа
                setTimeout(() => {
                    showCharacterSelection();
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
        showToast('Ошибка сохранения данных', 'error');
    } finally {
        showLoading(false);
        selectedCharacter = null;
    }
}

// Делаем функции доступными глобально для тестового режима
window.loadPlayerState = loadPlayerState;
window.loadPrices = loadPrices;
window.loadRoundInfo = loadRoundInfo;
window.showScreen = showScreen;
window.showCharacterSelection = showCharacterSelection;
window.selectCharacter = selectCharacter;
window.cancelCharacterSelection = cancelCharacterSelection;
window.confirmCharacterSelection = confirmCharacterSelection;
window.showResourceScreen = showResourceScreen;
window.goBackFromResource = goBackFromResource;
window.showBuyResourceScreen = showBuyResourceScreen;
window.showSellResourceScreen = showSellResourceScreen;
window.increaseBuyQuantity = increaseBuyQuantity;
window.decreaseBuyQuantity = decreaseBuyQuantity;
window.updateBuyTotal = updateBuyTotal;
window.increaseSellQuantity = increaseSellQuantity;
window.decreaseSellQuantity = decreaseSellQuantity;
window.updateSellTotal = updateSellTotal;
window.confirmBuyResource = confirmBuyResource;
window.confirmSellResource = confirmSellResource;
window.goBackFromBuyResource = goBackFromBuyResource;
window.goBackFromSellResource = goBackFromSellResource;
window.showPortfolioBuildingScreen = showPortfolioBuildingScreen;
window.goBackFromPortfolioBuilding = goBackFromPortfolioBuilding;
window.showSellBuildingScreen = showSellBuildingScreen;
window.showMarketBuildingScreen = showMarketBuildingScreen;
window.goBackFromMarketBuilding = goBackFromMarketBuilding;
window.showBuildBuildingScreenFromMarket = showBuildBuildingScreenFromMarket;
window.showSellBuildingScreenFromMarket = showSellBuildingScreenFromMarket;
window.increaseBuildQuantity = increaseBuildQuantity;
window.decreaseBuildQuantity = decreaseBuildQuantity;
window.updateBuildTotal = updateBuildTotal;
window.confirmBuildBuilding = confirmBuildBuilding;
window.goBackFromBuildBuilding = goBackFromBuildBuilding;
window.increaseSellBuildingQuantity = increaseSellBuildingQuantity;
window.decreaseSellBuildingQuantity = decreaseSellBuildingQuantity;
window.updateSellBuildingTotal = updateSellBuildingTotal;
window.confirmSellBuilding = confirmSellBuilding;
window.goBackFromSellBuilding = goBackFromSellBuilding;

// Загрузка состояния игрока
async function loadPlayerState() {
    try {
        const response = await fetch('/api/miniapp/player/state', {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки состояния');
        }

        const data = await response.json();
        playerState = data;

        // Обновляем UI
        try {
            updatePlayerInfo();
            updateResources();
            updateBuildings();
        } catch (uiError) {
            console.error('Ошибка обновления UI:', uiError);
        }
    } catch (error) {
        console.error('Ошибка загрузки состояния игрока:', error);
        // В тестовом режиме показываем контейнер даже при ошибке
        const mainContainer = document.getElementById('main-container');
        if (mainContainer && mainContainer.style.display === 'none') {
            mainContainer.style.display = 'block';
            initializeScreens();
        }
    }
}

// Загрузка цен
async function loadPrices() {
    try {
        const response = await fetch('/api/miniapp/prices');
        if (!response.ok) return;

        const data = await response.json();
        prices = data.prices || [];

        updatePrices();
    } catch (error) {
        console.error('Ошибка загрузки цен:', error);
    }
}

// Загрузка информации о раунде
async function loadRoundInfo() {
    try {
        const response = await fetch('/api/miniapp/round-info');
        if (!response.ok) return;

        const data = await response.json();
        currentRound = data.current_round || 1;

        document.getElementById('current-round').textContent = currentRound;
    } catch (error) {
        console.error('Ошибка загрузки информации о раунде:', error);
    }
}

// Обновление информации об игроке
function updatePlayerInfo() {
    try {
        if (!playerState) {
            console.warn('playerState is null in updatePlayerInfo');
            return;
        }
        
        // Обновляем имя игрока
        const playerNameEl = document.getElementById('player-name');
        const playerName = playerState.character_name || playerState.nickname;
        if (playerNameEl && playerName) {
            playerNameEl.textContent = playerName;
        }
        
        // Обновляем аватар
        const avatarImg = document.getElementById('player-avatar');
        const avatarPlaceholder = document.getElementById('player-avatar-placeholder');
        
        if (avatarImg && avatarPlaceholder) {
            const avatarUrl = playerState.character_image || playerState.photo_url;
            if (avatarUrl) {
                avatarImg.src = avatarUrl;
                avatarImg.style.display = 'block';
                avatarPlaceholder.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarPlaceholder.style.display = 'flex';
            }
        }
        
        // Обновляем капитализацию
        const capitalization = playerState.total_capitalization || playerState.capitalization || 0;
        const capitalizationEl = document.getElementById('capitalization-value');
        if (capitalizationEl) {
            capitalizationEl.textContent = Math.round(capitalization).toLocaleString('ru-RU');
        }
        
        // Обновляем приросты
        const growthRound = playerState.growth_from_prev_round_percent || playerState.growth_round_percent || 0;
        const growthGame = playerState.growth_from_start_percent || playerState.growth_game_percent || 0;
        
        const growthRoundEl = document.getElementById('growth-round');
        const growthGameEl = document.getElementById('growth-game');
        const growthBoxRound = document.getElementById('growth-box-round');
        const growthBoxGame = document.getElementById('growth-box-game');
        
        if (growthRoundEl) growthRoundEl.textContent = Math.round(growthRound) + '%';
        if (growthGameEl) growthGameEl.textContent = Math.round(growthGame) + '%';
        
        // Цветовая индикация приростов (применяем классы к box, а не к value)
        if (growthBoxRound) {
            growthBoxRound.className = 'growth-box ' + (growthRound >= 0 ? 'positive' : 'negative');
        }
        if (growthBoxGame) {
            growthBoxGame.className = 'growth-box ' + (growthGame >= 0 ? 'positive' : 'negative');
        }
    } catch (error) {
        console.error('Ошибка обновления информации об игроке:', error);
    }
}

// Обновление ресурсов
function updateResources() {
    try {
        if (!playerState) {
            console.warn('playerState is null in updateResources');
            return;
        }
        
        if (!playerState.resources) {
            console.warn('playerState.resources is null in updateResources');
            return;
        }

        const list = document.getElementById('resources-list');
        if (!list) {
            console.error('resources-list element not found!');
            return;
        }
        
        list.innerHTML = '';

    // Сначала показываем монеты (если есть)
    const money = playerState.money || 0;
    if (money > 0) {
        const moneyItem = document.createElement('div');
        moneyItem.className = 'resource-item money-item';
        moneyItem.innerHTML = `
            <div class="resource-info">
                <div class="resource-left">
                    <span class="resource-name money-name">Монеты</span>
                </div>
                <div class="resource-right">
                    <span class="resource-value">${money.toLocaleString('ru-RU')}</span>
                    <span class="resource-amount">${money.toLocaleString('ru-RU')}</span>
                </div>
            </div>
        `;
        list.appendChild(moneyItem);
    }

    // Затем показываем ресурсы (только те, что есть)
    const resourceNames = ['камень', 'дерево', 'железо', 'скот', 'овощи', 'рабы', 'золото', 'зерно', 'рыба'];
    
    resourceNames.forEach(resource => {
        const amount = playerState.resources[resource] || 0;
        if (amount === 0) return; // Пропускаем ресурсы с нулевым количеством
        
        // Находим цену ресурса
        const price = prices.find(p => p.resource === resource);
        const priceValue = price ? price.current_price : 0;
        const totalValue = amount * priceValue;
        
        const resourceItem = document.createElement('div');
        resourceItem.className = 'resource-item';
        resourceItem.style.cursor = 'pointer';
        resourceItem.onclick = () => showResourceScreen(resource);
        resourceItem.innerHTML = `
            <div class="resource-info">
                <div class="resource-left">
                    <span class="resource-name">${capitalizeFirst(resource)}</span>
                </div>
                <div class="resource-right">
                    <span class="resource-value">${totalValue.toLocaleString('ru-RU')}</span>
                    <span class="resource-amount">${amount.toLocaleString('ru-RU')}</span>
                </div>
            </div>
        `;
        list.appendChild(resourceItem);
    });
    
        // Если нет ни монет, ни ресурсов
        if (money === 0 && list.children.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #c9a961; padding: 20px;">У вас пока нет ресурсов</div>';
        }
    } catch (error) {
        console.error('Ошибка обновления ресурсов:', error);
    }
}

// Обновление объектов
function updateBuildings() {
    try {
        if (!playerState) {
            console.warn('playerState is null in updateBuildings');
            return;
        }
        
        if (!playerState.buildings) {
            console.warn('playerState.buildings is null in updateBuildings');
            return;
        }

        const list = document.getElementById('buildings-list');
        if (!list) {
            console.error('buildings-list element not found!');
            return;
        }
        
        list.innerHTML = '';

    if (playerState.buildings.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #3a2a1a; padding: 20px;">У вас пока нет объектов</div>';
        return;
    }

    // Группируем объекты по названию и статусу
    const buildingsMap = {};
    playerState.buildings.forEach(building => {
        const key = `${building.name}_${building.status}`;
        if (!buildingsMap[key]) {
            buildingsMap[key] = {
                name: building.name,
                status: building.status,
                count: 0
            };
        }
        buildingsMap[key].count++;
    });

    // Рассчитываем стоимость объектов
    Object.values(buildingsMap).forEach(building => {
        // Находим все объекты этого типа и статуса для расчета стоимости
        const matchingBuildings = playerState.buildings.filter(
            b => b.name === building.name && b.status === building.status
        );
        
        // Суммируем стоимость всех объектов этого типа и статуса
        let totalValue = 0;
        matchingBuildings.forEach(b => {
            totalValue += b.value || 0;
        });
        
        const buildingItem = document.createElement('div');
        buildingItem.className = 'building-item';
        buildingItem.style.cursor = 'pointer';
        buildingItem.onclick = () => showPortfolioBuildingScreen(building.name, building.status);
        buildingItem.innerHTML = `
            <div class="building-info">
                <div class="building-row building-row-first">
                    <span class="building-name">${building.name}</span>
                    <span class="building-count">${building.count}</span>
                </div>
                <div class="building-row building-row-second">
                    <span class="building-status ${building.status}">${getStatusText(building.status)}</span>
                    <span class="building-value">${totalValue.toLocaleString('ru-RU')}</span>
                </div>
            </div>
        `;
        list.appendChild(buildingItem);
    });
    } catch (error) {
        console.error('Ошибка обновления объектов:', error);
    }
}

function getStatusText(status) {
    const statusMap = {
        'building': 'Строится',
        'completed': 'Готов',
        'active': 'Активен',
        'for_sale': 'Продается',
        'sold': 'Продан'
    };
    return statusMap[status] || status;
}

// Инициализация экранов
function initializeScreens() {
    console.log('initializeScreens called'); // Отладка
    
    // Убеждаемся, что портфель активен по умолчанию
    const portfolioScreen = document.getElementById('portfolio-screen');
    if (portfolioScreen) {
        // Скрываем все экраны
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        // Активируем портфель
        portfolioScreen.classList.add('active');
        console.log('Portfolio screen activated'); // Отладка
        
        // Обновляем активную кнопку навигации
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const navBtn = document.getElementById('nav-portfolio');
        if (navBtn) {
            navBtn.classList.add('active');
        }
    } else {
        console.error('Portfolio screen not found!'); // Отладка
    }
}

// Навигация между экранами
function showScreen(screenName) {
    console.log('showScreen called with:', screenName); // Отладка
    
    // Убеждаемся, что main-container отображается ПЕРЕД поиском элементов
    const mainContainer = document.getElementById('main-container');
    const wasHidden = mainContainer && mainContainer.style.display === 'none';
    if (wasHidden) {
        mainContainer.style.display = 'block';
    }
    
    // Если контейнер был скрыт, используем requestAnimationFrame для гарантии обновления DOM
    if (wasHidden) {
        requestAnimationFrame(() => {
            performScreenSwitch(screenName, mainContainer);
        });
    } else {
        performScreenSwitch(screenName, mainContainer);
    }
}

function performScreenSwitch(screenName, mainContainer) {
    // Сохраняем предыдущий экран (если это не экран ресурса и не страницы успешных действий)
    if (screenName !== 'resource' && 
        !screenName.startsWith('success-') && 
        !screenName.startsWith('error-')) {
        previousScreen = screenName;
    }
    
    // ВСЕГДА используем document для поиска элементов, даже если они внутри скрытого контейнера
    // getElementById и querySelectorAll работают из document независимо от видимости элементов
    
    // Скрываем все экраны (ищем во всем документе)
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Показываем нужный экран (getElementById работает из document, даже для скрытых элементов)
    const screenId = `${screenName}-screen`;
    const targetScreen = document.getElementById(screenId);
    
    console.log('Looking for screen with ID:', screenId); // Отладка
    console.log('Screen found:', targetScreen ? 'YES' : 'NO'); // Отладка
    
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log('Screen activated:', screenId); // Отладка
        
        // Сбрасываем скролл при переходе на новую страницу
        window.scrollTo(0, 0);
        // Также сбрасываем скролл контейнера, если он есть
        const container = document.querySelector('.container');
        if (container) {
            container.scrollTop = 0;
        }
    } else {
        console.error('Screen not found:', screenId); // Отладка
        // Показываем список всех доступных экранов для отладки
        const allScreens = document.querySelectorAll('.screen');
        console.log('Available screens:', Array.from(allScreens).map(s => s.id)); // Отладка
        console.log('Looking for:', screenId); // Отладка
        // Попробуем найти элемент напрямую
        const directSearch = document.querySelector(`#${screenId}`);
        console.log('Direct querySelector result:', directSearch ? 'FOUND' : 'NOT FOUND'); // Отладка
    }
    
    // Обновляем активную кнопку навигации (только для основных экранов)
    const mainScreens = ['portfolio', 'market', 'leaderboard'];
    if (mainScreens.includes(screenName)) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const navBtn = document.getElementById(`nav-${screenName}`);
        if (navBtn) {
            navBtn.classList.add('active');
        }
    }
    
    // Загружаем данные для экрана, если нужно
    if (screenName === 'leaderboard') {
        loadLeaderboard();
    } else if (screenName === 'market') {
        loadPrices();
        updateMarketBuildings();
    }
}

// Загрузка рейтинга
async function loadLeaderboard() {
    try {
        const response = await fetch('/api/miniapp/leaderboard');
        if (!response.ok) return;

        const data = await response.json();
        updateLeaderboard(data.leaderboard || []);
    } catch (error) {
        console.error('Ошибка загрузки рейтинга:', error);
    }
}

// Обновление рейтинга
function updateLeaderboard(leaderboard) {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    if (leaderboard.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #3a2a1a; padding: 20px;">Рейтинг пуст</div>';
        return;
    }

    leaderboard.forEach((player, index) => {
        const rank = index + 1;
        const playerItem = document.createElement('div');
        playerItem.className = 'leaderboard-item';
        
        // Определяем стрелочку
        let arrowHtml = '';
        if (player.rank_change === 'up') {
            arrowHtml = '<span class="leaderboard-arrow leaderboard-arrow-up">↑</span>';
        } else if (player.rank_change === 'down') {
            arrowHtml = '<span class="leaderboard-arrow leaderboard-arrow-down">↓</span>';
        } else {
            arrowHtml = '<span class="leaderboard-arrow-empty"></span>';
        }
        
        // Формируем HTML для роста капитализации
        const growthRound = player.growth_round_percent || 0;
        const growthGame = player.growth_game_percent || 0;
        const growthRoundClass = growthRound >= 0 ? 'positive' : 'negative';
        const growthGameClass = growthGame >= 0 ? 'positive' : 'negative';
        
        playerItem.innerHTML = `
            <div class="leaderboard-rank">${rank}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${player.character_name || player.nickname || player.name || 'Игрок'}</div>
                <div class="leaderboard-capitalization">${Math.round(player.total_value || 0).toLocaleString('ru-RU')}</div>
                <div class="leaderboard-growth">
                    <div class="leaderboard-growth-box ${growthRoundClass}">
                        <div class="leaderboard-growth-value">${Math.round(growthRound)}%</div>
                    </div>
                    <div class="leaderboard-growth-box ${growthGameClass}">
                        <div class="leaderboard-growth-value">${Math.round(growthGame)}%</div>
                    </div>
                </div>
            </div>
            <div class="leaderboard-arrow-container">
                ${arrowHtml}
            </div>
        `;
        list.appendChild(playerItem);
    });
}

// Обновление цен (для страницы Биржа)
function updatePrices() {
    const list = document.getElementById('resources-market-list');
    if (!list) return; // Если элемент не найден, выходим
    
    list.innerHTML = '';

    prices.forEach(price => {
        const item = document.createElement('div');
        item.className = 'resource-market-item';
        
        const changeRoundClass = price.change_from_prev_percent >= 0 ? 'positive' : 'negative';
        const changeRoundSign = price.change_from_prev_percent >= 0 ? '+' : '';
        const changeGameClass = price.change_from_start_percent >= 0 ? 'positive' : 'negative';
        const changeGameSign = price.change_from_start_percent >= 0 ? '+' : '';
        
        item.style.cursor = 'pointer';
        item.onclick = () => showResourceScreen(price.resource);
        item.innerHTML = `
            <div class="resource-market-left">
                <span class="resource-market-name">${capitalizeFirst(price.resource)}</span>
            </div>
            <div class="resource-market-right">
                <div class="resource-market-changes">
                    <div class="resource-market-change-box ${changeRoundClass}">
                        <span class="resource-market-change-value">${changeRoundSign}${Math.round(price.change_from_prev_percent)}%</span>
                    </div>
                    <div class="resource-market-change-box ${changeGameClass}">
                        <span class="resource-market-change-value">${changeGameSign}${Math.round(price.change_from_start_percent)}%</span>
                    </div>
                </div>
                <span class="resource-market-price">${price.current_price.toLocaleString('ru-RU')}</span>
            </div>
        `;
        list.appendChild(item);
    });
}

// Обновление объектов на странице Биржа
async function updateMarketBuildings() {
    const grid = document.getElementById('buildings-market-grid');
    if (!grid) return;
    
    try {
        const response = await fetch('/api/buildings');
        if (!response.ok) return;
        
        const data = await response.json();
        const buildings = data.buildings || [];
        
        grid.innerHTML = '';
        
        // Все возможные объекты из конфига
        const allBuildings = [
            'Лесоповал', 'Каменоломня', 'Рыболовня', 'Трактир', 
            'Теплицы', 'Посевные поля', 'Ферма', 'Постоялый двор',
            'Куртизанские палатки', 'Кузнечная', 'Золотой рудник'
        ];
        
        // Маппинг изображений (из веб-интерфейса)
        const buildingImages = {
            'Лесоповал': '/static/images/buildings/лесоповал.png',
            'Каменоломня': '/static/images/buildings/каменоломня.png',
            'Рыболовня': '/static/images/buildings/рыболовня.png',
            'Трактир': '/static/images/buildings/Трактир.png',
            'Теплицы': '/static/images/buildings/теплицы.png',
            'Посевные поля': '/static/images/buildings/Посевные поля.png',
            'Ферма': '/static/images/buildings/ферма.png',
            'Постоялый двор': '/static/images/buildings/постоялый двор.png',
            'Куртизанские палатки': '/static/images/buildings/куртизанские палатки.png',
            'Кузнечная': '/static/images/buildings/кузнечная.png',
            'Золотой рудник': '/static/images/buildings/золотой рудник.png'
        };
        
        // Создаем карточки для всех объектов
        allBuildings.forEach(buildingName => {
            const buildingData = buildings.find(b => b.name === buildingName);
            const count = buildingData ? buildingData.count : 0;
            const playersPercentage = buildingData ? buildingData.players_percentage : 0;
            
            const card = document.createElement('div');
            card.className = 'building-market-card';
            card.style.cursor = 'pointer';
            card.onclick = () => showMarketBuildingScreen(buildingName);
            card.innerHTML = `
                <div class="building-market-name">${buildingName}</div>
                <img src="${buildingImages[buildingName] || ''}" alt="${buildingName}" class="building-market-image" onerror="this.style.display='none'">
                <div class="building-market-stats">
                    <span class="building-market-count">${count}</span>
                    <span class="building-market-percentage">${playersPercentage}%</span>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки объектов:', error);
    }
}

// Показ страницы ресурса
async function showResourceScreen(resourceName) {
    currentResource = resourceName;
    
    // Сохраняем текущий активный экран как предыдущий и исходный
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id !== 'resource-screen') {
        const screenName = activeScreen.id.replace('-screen', '');
        previousScreen = screenName;
        // Сохраняем исходный экран только если это портфель или биржа
        if (screenName === 'portfolio' || screenName === 'market') {
            originScreen = screenName;
        }
    }
    
    // Загружаем данные ресурса
    try {
        const response = await fetch(`/api/resource/${encodeURIComponent(resourceName)}`);
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных ресурса');
        }
        
        const data = await response.json();
        
        // Заполняем данные на странице
        document.getElementById('resource-screen-name').textContent = capitalizeFirst(resourceName);
        
        // Картинка
        const imageFile = resourceImages[resourceName] || `${resourceName}.png`;
        const imagePath = `/static/images/resources/${imageFile}`;
        const imageEl = document.getElementById('resource-screen-image');
        imageEl.src = imagePath;
        imageEl.alt = capitalizeFirst(resourceName);
        imageEl.style.display = 'block';
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        
        // Цена
        document.getElementById('resource-screen-price').textContent = `${data.current_price.toLocaleString('ru-RU')}`;
        
        // Изменения
        const changeRound = data.change_from_prev_percent || 0;
        const changeGame = data.change_from_start_percent || 0;
        const changeRoundClass = changeRound >= 0 ? 'positive' : 'negative';
        const changeGameClass = changeGame >= 0 ? 'positive' : 'negative';
        const changeRoundSign = changeRound >= 0 ? '+' : '';
        const changeGameSign = changeGame >= 0 ? '+' : '';
        
        const changeRoundEl = document.getElementById('resource-screen-change-round');
        const changeGameEl = document.getElementById('resource-screen-change-game');
        const changeRoundBox = document.getElementById('resource-screen-change-round-box');
        const changeGameBox = document.getElementById('resource-screen-change-game-box');
        
        changeRoundEl.textContent = `${changeRoundSign}${Math.round(changeRound)}%`;
        changeGameEl.textContent = `${changeGameSign}${Math.round(changeGame)}%`;
        changeRoundBox.className = `resource-screen-change-box ${changeRoundClass}`;
        changeGameBox.className = `resource-screen-change-box ${changeGameClass}`;
        
        // Спрос и предложение
        const demandEl = document.getElementById('resource-screen-demand');
        const supplyEl = document.getElementById('resource-screen-supply');
        const demandLevel = data.demand_level || 'базовый';
        const supplyLevel = data.supply_level || 'базовое';
        
        demandEl.textContent = demandLevel;
        supplyEl.textContent = supplyLevel;
        
        // Определяем классы для спроса и предложения
        // Низкие или высокие - красный (negative), нормальные/базовые/средние - зеленый (positive)
        const demandClass = (demandLevel === 'низкий' || demandLevel === 'low' || demandLevel === 'высокий' || demandLevel === 'high') ? 'negative' : 'positive';
        const supplyClass = (supplyLevel === 'низкое' || supplyLevel === 'low' || supplyLevel === 'высокое' || supplyLevel === 'high') ? 'negative' : 'positive';
        
        // Находим родительские элементы (indicator-item)
        const demandBox = demandEl.closest('.resource-screen-indicator-item');
        const supplyBox = supplyEl.closest('.resource-screen-indicator-item');
        
        if (demandBox) {
            demandBox.className = `resource-screen-indicator-item ${demandClass}`;
        }
        if (supplyBox) {
            supplyBox.className = `resource-screen-indicator-item ${supplyClass}`;
        }
        
        // Количество ресурса у игрока
        const amount = playerState?.resources?.[resourceName] || 0;
        document.getElementById('resource-screen-available-value').textContent = amount.toLocaleString('ru-RU');
        
        // График
        setTimeout(() => {
            drawPriceChartForResource(data.price_history);
        }, 100);
        
        // Показываем экран
        showScreen('resource');
    } catch (error) {
        console.error('Ошибка загрузки ресурса:', error);
        showToast('Ошибка загрузки данных ресурса', 'error');
    }
}

// Возврат назад со страницы ресурса
function goBackFromResource() {
    // Всегда возвращаемся на исходный экран (портфель или биржа)
    showScreen(originScreen);
    currentResource = null;
}

// Отрисовка графика цены для страницы ресурса
function drawPriceChartForResource(priceHistory) {
    const canvas = document.getElementById('resource-screen-chart');
    if (!canvas) {
        console.error('Canvas не найден');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Устанавливаем размер canvas
    const container = canvas.parentElement;
    if (container) {
        canvas.width = container.clientWidth - 20;
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
    
    // Убираем последнюю точку, если она дублирует предыдущую
    if (standardizedHistory.length > 2) {
        const lastPoint = standardizedHistory[standardizedHistory.length - 1];
        const prevPoint = standardizedHistory[standardizedHistory.length - 2];
        
        if (lastPoint.round === prevPoint.round || lastPoint.price === prevPoint.price) {
            standardizedHistory = standardizedHistory.slice(0, -1);
        }
    }
    
    // Находим минимальное и максимальное значение цены
    const prices = standardizedHistory.map(h => h.price);
    const minPrice = 0;
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    
    // Рисуем оси
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;
    
    // Ось X
    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Ось Y
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();
    
    // Рисуем сетку
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding + (chartHeight / gridLines) * i;
        const price = maxPrice - (priceRange / gridLines) * i;
        
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
        
        ctx.fillStyle = '#3a2a1a';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(price).toString(), padding - 10, y + 4);
    }
    
    ctx.setLineDash([]);
    
    // Рисуем график
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    let lineStarted = false;
    standardizedHistory.forEach((point, index) => {
        const x = padding + (chartWidth / (standardizedHistory.length - 1)) * index;
        const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        if (index === 0) {
            return;
        }
        
        if (!lineStarted) {
            ctx.moveTo(x, y);
            lineStarted = true;
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Рисуем точки
    ctx.fillStyle = '#006400';
    standardizedHistory.forEach((point, index) => {
        const x = padding + (chartWidth / (standardizedHistory.length - 1)) * index;
        const y = padding + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        if (index === 0 || index === standardizedHistory.length - 1 || index % Math.ceil(standardizedHistory.length / 5) === 0) {
            ctx.fillStyle = '#3a2a1a';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(point.round.toString(), x, canvas.height - padding + 20);
            ctx.fillStyle = '#006400';
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

// Показ экрана покупки ресурса
function showBuyResourceScreen() {
    if (!currentResource) return;
    
    // Сохраняем предыдущий экран (это всегда resource)
    previousScreen = 'resource';
    
    // Находим цену ресурса
    const price = prices.find(p => p.resource === currentResource);
    if (!price) {
        showToast('Ошибка: цена ресурса не найдена', 'error');
        return;
    }
    
    // Заполняем данные
    document.getElementById('buy-resource-screen-name').textContent = `Купить ${capitalizeFirst(currentResource)}`;
    
    // Картинка
    const imageFile = resourceImages[currentResource] || `${currentResource}.png`;
    const imagePath = `/static/images/resources/${imageFile}`;
    const imageEl = document.getElementById('buy-resource-image');
    imageEl.src = imagePath;
    imageEl.alt = capitalizeFirst(currentResource);
    imageEl.onerror = function() {
        this.style.display = 'none';
    };
    
    // Цена
    document.getElementById('buy-resource-price-value').textContent = price.current_price.toLocaleString('ru-RU');
    
    // Доступное количество (у вас есть)
    const amount = playerState?.resources?.[currentResource] || 0;
    document.getElementById('buy-resource-available-value').textContent = amount.toLocaleString('ru-RU');
    
    // Монеты
    const money = playerState?.money || 0;
    document.getElementById('buy-resource-money-value').textContent = money.toLocaleString('ru-RU');
    
    // Количество
    document.getElementById('buy-resource-quantity-input').value = 1;
    document.getElementById('buy-resource-quantity-input').max = '';
    updateBuyTotal();
    
    // Показываем экран
    showScreen('buy-resource');
}

// Показ экрана продажи ресурса
function showSellResourceScreen() {
    if (!currentResource) return;
    
    // Сохраняем предыдущий экран
    previousScreen = 'resource';
    
    // Находим цену и количество ресурса
    const price = prices.find(p => p.resource === currentResource);
    if (!price) {
        showToast('Ошибка: цена ресурса не найдена', 'error');
        return;
    }
    
    const amount = playerState?.resources?.[currentResource] || 0;
    if (amount === 0) {
        showToast('У вас нет этого ресурса', 'error');
        return;
    }
    
    // Заполняем данные
    document.getElementById('sell-resource-screen-name').textContent = `Продать ${capitalizeFirst(currentResource)}`;
    
    // Картинка
    const imageFile = resourceImages[currentResource] || `${currentResource}.png`;
    const imagePath = `/static/images/resources/${imageFile}`;
    const imageEl = document.getElementById('sell-resource-image');
    imageEl.src = imagePath;
    imageEl.alt = capitalizeFirst(currentResource);
    imageEl.onerror = function() {
        this.style.display = 'none';
    };
    
    // Цена
    document.getElementById('sell-resource-price-value').textContent = price.current_price.toLocaleString('ru-RU');
    
    // Доступное количество
    document.getElementById('sell-resource-available-value').textContent = amount.toLocaleString('ru-RU');
    
    // Монеты
    const money = playerState?.money || 0;
    document.getElementById('sell-resource-money-value').textContent = money.toLocaleString('ru-RU');
    
    // Количество
    const quantityInput = document.getElementById('sell-resource-quantity-input');
    quantityInput.value = 1;
    quantityInput.max = amount;
    updateSellTotal();
    
    // Показываем экран
    showScreen('sell-resource');
}

// Управление количеством при покупке
function increaseBuyQuantity() {
    const input = document.getElementById('buy-resource-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    input.value = currentValue + 1;
    updateBuyTotal();
}

function decreaseBuyQuantity() {
    const input = document.getElementById('buy-resource-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue > 1) {
        input.value = currentValue - 1;
        updateBuyTotal();
    }
}

function updateBuyTotal() {
    const quantity = parseInt(document.getElementById('buy-resource-quantity-input').value) || 1;
    const price = prices.find(p => p.resource === currentResource);
    if (price) {
        const total = quantity * price.current_price;
        document.getElementById('buy-resource-total-value').textContent = total.toLocaleString('ru-RU');
    }
}

// Управление количеством при продаже
function increaseSellQuantity() {
    const input = document.getElementById('sell-resource-quantity-input');
    const max = parseInt(input.max) || 1;
    const currentValue = parseInt(input.value) || 1;
    if (currentValue < max) {
        input.value = currentValue + 1;
        updateSellTotal();
    }
}

function decreaseSellQuantity() {
    const input = document.getElementById('sell-resource-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue > 1) {
        input.value = currentValue - 1;
        updateSellTotal();
    }
}

function updateSellTotal() {
    const quantity = parseInt(document.getElementById('sell-resource-quantity-input').value) || 1;
    const price = prices.find(p => p.resource === currentResource);
    if (price) {
        const total = quantity * price.current_price;
        document.getElementById('sell-resource-total-value').textContent = total.toLocaleString('ru-RU');
    }
}

// Подтверждение покупки
async function confirmBuyResource() {
    if (!currentResource) return;
    
    const quantity = parseInt(document.getElementById('buy-resource-quantity-input').value) || 1;
    if (quantity < 1) {
        showToast('Количество должно быть больше 0', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/miniapp/player/buy-resource', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': tg.initData
            },
            body: JSON.stringify({
                resource: currentResource,
                quantity: quantity
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const price = prices.find(p => p.resource === currentResource);
            const cost = quantity * (price ? price.current_price : 0);
            
            showToast('Ресурс успешно куплен!', 'success');
            
            // Обновляем данные
            await loadPlayerState();
            await loadPrices();
            
            // Обновляем количество монет на экране покупки, если он все еще открыт
            const moneyEl = document.getElementById('buy-resource-money-value');
            if (moneyEl && playerState) {
                moneyEl.textContent = (playerState.money || 0).toLocaleString('ru-RU');
            }
        } else {
            // Проверяем, это ошибка недостаточности средств?
            if (data.message && (data.message.includes('недостаточно') || data.message.includes('Недостаточно'))) {
                showToast(data.message || 'Недостаточно средств', 'error');
            } else {
                showToast(data.message || 'Ошибка при покупке ресурса', 'error');
            }
        }
    } catch (error) {
        console.error('Ошибка покупки ресурса:', error);
        showToast('Ошибка при покупке ресурса', 'error');
    }
}

// Подтверждение продажи
async function confirmSellResource() {
    if (!currentResource) return;
    
    const quantity = parseInt(document.getElementById('sell-resource-quantity-input').value) || 1;
    if (quantity < 1) {
        showToast('Количество должно быть больше 0', 'error');
        return;
    }
    
    const max = parseInt(document.getElementById('sell-resource-quantity-input').max) || 0;
    if (quantity > max) {
        showToast('Недостаточно ресурсов', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/miniapp/player/sell-resource', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': tg.initData
            },
            body: JSON.stringify({
                resource: currentResource,
                quantity: quantity
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const price = prices.find(p => p.resource === currentResource);
            const revenue = quantity * (price ? price.current_price : 0);
            
            showToast('Ресурс успешно продан!', 'success');
            
            // Обновляем данные
            await loadPlayerState();
            await loadPrices();
            
            // Обновляем количество монет на экране продажи, если он все еще открыт
            const moneyEl = document.getElementById('sell-resource-money-value');
            if (moneyEl && playerState) {
                moneyEl.textContent = (playerState.money || 0).toLocaleString('ru-RU');
            }
        } else {
            showToast(data.message || 'Ошибка при продаже ресурса', 'error');
        }
    } catch (error) {
        console.error('Ошибка продажи ресурса:', error);
        showToast('Ошибка при продаже ресурса', 'error');
    }
}

// Возврат назад с экранов покупки/продажи
function goBackFromBuyResource() {
    // Всегда возвращаемся на страницу ресурса
    showScreen('resource');
}

function goBackFromSellResource() {
    // Всегда возвращаемся на страницу ресурса
    showScreen('resource');
}

// Маппинг изображений объектов (глобальный)
const buildingImages = {
    'Лесоповал': '/static/images/buildings/лесоповал.png',
    'Каменоломня': '/static/images/buildings/каменоломня.png',
    'Рыболовня': '/static/images/buildings/рыболовня.png',
    'Трактир': '/static/images/buildings/Трактир.png',
    'Теплицы': '/static/images/buildings/теплицы.png',
    'Посевные поля': '/static/images/buildings/Посевные поля.png',
    'Ферма': '/static/images/buildings/ферма.png',
    'Постоялый двор': '/static/images/buildings/постоялый двор.png',
    'Куртизанские палатки': '/static/images/buildings/куртизанские палатки.png',
    'Кузнечная': '/static/images/buildings/кузнечная.png',
    'Золотой рудник': '/static/images/buildings/золотой рудник.png'
};

// Показ страницы объекта из портфеля
async function showPortfolioBuildingScreen(buildingName, buildingStatus) {
    currentBuilding = buildingName;
    currentBuildingStatus = buildingStatus;
    
    // Сохраняем текущий активный экран как предыдущий
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id !== 'portfolio-building-screen') {
        const screenName = activeScreen.id.replace('-screen', '');
        previousScreen = screenName;
        // Сохраняем исходный экран только если это портфель
        if (screenName === 'portfolio') {
            originScreen = screenName;
        }
    }
    
    // Загружаем данные объекта
    try {
        const response = await fetch(`/api/miniapp/player/building/${encodeURIComponent(buildingName)}?status=${buildingStatus}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных объекта');
        }
        
        const data = await response.json();
        
        // Заполняем данные на странице
        document.getElementById('portfolio-building-screen-name').textContent = buildingName;
        
        // Картинка
        const imagePath = buildingImages[buildingName] || '';
        const imageEl = document.getElementById('portfolio-building-image');
        imageEl.src = imagePath;
        imageEl.alt = buildingName;
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        imageEl.style.display = 'block';
        
        // Статус (с классом для стилизации)
        const statusEl = document.getElementById('portfolio-building-status');
        statusEl.textContent = getStatusText(buildingStatus);
        statusEl.className = `portfolio-building-status ${buildingStatus}`;
        
        // Количество
        document.getElementById('portfolio-building-count').textContent = data.count.toLocaleString('ru-RU');
        
        // Капитализация
        document.getElementById('portfolio-building-capitalization').textContent = data.capitalization.toLocaleString('ru-RU');
        
        // Изменения капитализации
        const changeRound = data.change_round_percent || 0;
        const changeGame = data.change_game_percent || 0;
        const changeRoundClass = changeRound >= 0 ? 'positive' : 'negative';
        const changeGameClass = changeGame >= 0 ? 'positive' : 'negative';
        const changeRoundSign = changeRound >= 0 ? '+' : '';
        const changeGameSign = changeGame >= 0 ? '+' : '';
        
        const changeRoundEl = document.getElementById('portfolio-building-change-round');
        const changeGameEl = document.getElementById('portfolio-building-change-game');
        const changeRoundBox = document.getElementById('portfolio-building-change-round-box');
        const changeGameBox = document.getElementById('portfolio-building-change-game-box');
        
        changeRoundEl.textContent = `${changeRoundSign}${Math.round(changeRound)}%`;
        changeGameEl.textContent = `${changeGameSign}${Math.round(changeGame)}%`;
        changeRoundBox.className = `portfolio-building-change-box ${changeRoundClass}`;
        changeGameBox.className = `portfolio-building-change-box ${changeGameClass}`;
        
        // Доход за раунд (базовый доход из конфига)
        const incomeEl = document.getElementById('portfolio-building-income');
        if (incomeEl) {
            incomeEl.innerHTML = '';
            if (data.income) {
                const incomeItems = [];
                
                // Монеты
                if (data.income.монеты && data.income.монеты > 0) {
                    incomeItems.push(`${data.income.монеты.toLocaleString('ru-RU')} монет`);
                }
                
                // Ресурсы
                if (data.income.ресурсы && Object.keys(data.income.ресурсы).length > 0) {
                    Object.entries(data.income.ресурсы).forEach(([resource, amount]) => {
                        if (amount > 0) {
                            incomeItems.push(`${amount.toLocaleString('ru-RU')} ${capitalizeFirst(resource)}`);
                        }
                    });
                }
                
                if (incomeItems.length > 0) {
                    incomeItems.forEach(item => {
                        const incomeItem = document.createElement('div');
                        incomeItem.className = 'portfolio-building-income-value';
                        incomeItem.textContent = item;
                        incomeEl.appendChild(incomeItem);
                    });
                } else {
                    const noIncome = document.createElement('div');
                    noIncome.className = 'portfolio-building-income-value';
                    noIncome.textContent = 'Нет дохода';
                    incomeEl.appendChild(noIncome);
                }
            }
        }
        
        // Показываем экран
        showScreen('portfolio-building');
    } catch (error) {
        console.error('Ошибка загрузки объекта:', error);
        showToast('Ошибка загрузки данных объекта', 'error');
    }
}

// Форматирование дохода для отображения
function formatIncome(income) {
    let html = '';
    
    if (income.monеты > 0) {
        html += `<span class="income-coins">${income.mонеты.toLocaleString('ru-RU')} монет</span>`;
    }
    
    const resources = Object.entries(income.ресурсы || {});
    if (resources.length > 0) {
        if (html) html += ', ';
        html += resources.map(([resource, amount]) => 
            `<span class="income-resource">${amount.toLocaleString('ru-RU')} ${capitalizeFirst(resource)}</span>`
        ).join(', ');
    }
    
    if (!html) {
        html = '<span class="income-none">0</span>';
    }
    
    return html;
}

// Возврат назад со страницы объекта из портфеля
function goBackFromPortfolioBuilding() {
    // Всегда возвращаемся на портфель
    showScreen('portfolio');
    currentBuilding = null;
    currentBuildingStatus = null;
}

// Показ страницы объекта на бирже
async function showMarketBuildingScreen(buildingName) {
    currentBuilding = buildingName;
    
    // Сохраняем текущий активный экран как предыдущий
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id !== 'market-building-screen') {
        const screenName = activeScreen.id.replace('-screen', '');
        previousScreen = screenName;
        // Сохраняем исходный экран (биржа)
        if (screenName === 'market') {
            originScreen = screenName;
        }
    }
    
    // Загружаем данные объекта
    try {
        const response = await fetch(`/api/miniapp/market/building/${encodeURIComponent(buildingName)}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных объекта');
        }
        
        const data = await response.json();
        
        // Сначала показываем экран, чтобы элементы были доступны в DOM
        showScreen('market-building');
        
        // Ждем обновления DOM - увеличиваем задержку
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Проверяем, что страница действительно отображена
        const screenEl = document.getElementById('market-building-screen');
        if (!screenEl || !screenEl.classList.contains('active')) {
            console.error('Страница market-building-screen не активна!');
        }
        
        // Заполняем данные на странице
        document.getElementById('market-building-screen-name').textContent = buildingName;
        
        // Картинка
        const imagePath = buildingImages[buildingName] || '';
        const imageEl = document.getElementById('market-building-image');
        imageEl.src = imagePath;
        imageEl.alt = buildingName;
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        imageEl.style.display = 'block';
        
        // Количество построенных объектов
        document.getElementById('market-building-count').textContent = data.count.toLocaleString('ru-RU');
        
        // Процент игроков
        document.getElementById('market-building-percentage').textContent = `${data.players_percentage}%`;
        
        // Стоимость в ресурсах (построчно с буллитами)
        const costResourcesEl = document.getElementById('market-building-cost-resources');
        costResourcesEl.innerHTML = '';
        if (data.cost_resources && Object.keys(data.cost_resources).length > 0) {
            Object.entries(data.cost_resources).forEach(([resource, amount]) => {
                const li = document.createElement('li');
                li.className = 'market-building-cost-resource-item';
                li.textContent = `${amount} ${resource}`;
                costResourcesEl.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'Нет данных';
            costResourcesEl.appendChild(li);
        }
        
        // Оценка в монетах (только цифра, выровнена по правому краю)
        document.getElementById('market-building-cost-coins').textContent = data.cost_coins.toLocaleString('ru-RU');
        
        // Приносит ресурса (в том же стиле, что и "Стоимость в ресурсах")
        let baseResourceListEl = document.getElementById('market-building-base-resource-list');
        
        // Если элемент не найден, создаем его динамически
        if (!baseResourceListEl) {
            console.log('Элемент не найден, создаем динамически...');
            // Находим блок "Оценка в монетах"
            const costCoinsItem = document.getElementById('market-building-cost-coins')?.closest('.market-building-stat-item');
            if (costCoinsItem && costCoinsItem.parentElement) {
                // Создаем новый блок
                const newBlock = document.createElement('div');
                newBlock.className = 'market-building-stat-item market-building-base-resource-item';
                newBlock.innerHTML = `
                    <div class="market-building-cost-resources-label">Приносит ресурса:</div>
                    <ul class="market-building-cost-resources-list" id="market-building-base-resource-list">
                        <!-- Заполняется через JS -->
                    </ul>
                `;
                // Вставляем после блока "Оценка в монетах"
                costCoinsItem.parentElement.insertBefore(newBlock, costCoinsItem.nextSibling);
                baseResourceListEl = document.getElementById('market-building-base-resource-list');
                console.log('Элемент создан динамически:', !!baseResourceListEl);
            } else {
                console.error('Не удалось найти место для вставки элемента');
            }
        }
        
        console.log('Поиск элемента market-building-base-resource-list:', !!baseResourceListEl);
        console.log('Данные income:', data.income);
        
        if (baseResourceListEl) {
            baseResourceListEl.innerHTML = '';
            if (data.income) {
                const resourceItems = [];
                
                // Монеты
                if (data.income.монеты && data.income.монеты > 0) {
                    resourceItems.push({ type: 'монеты', amount: data.income.монеты });
                }
                
                // Ресурсы
                if (data.income.ресурсы && Object.keys(data.income.ресурсы).length > 0) {
                    Object.entries(data.income.ресурсы).forEach(([resource, amount]) => {
                        if (amount > 0) {
                            resourceItems.push({ type: resource, amount: amount });
                        }
                    });
                }
                
                console.log('Ресурсы для отображения:', resourceItems);
                
                if (resourceItems.length > 0) {
                    resourceItems.forEach(item => {
                        const li = document.createElement('li');
                        li.className = 'market-building-cost-resource-item';
                        if (item.type === 'монеты') {
                            li.textContent = `${item.amount.toLocaleString('ru-RU')} монет`;
                        } else {
                            li.textContent = `${item.amount.toLocaleString('ru-RU')} ${item.type}`;
                        }
                        baseResourceListEl.appendChild(li);
                    });
                    console.log('Блок "Приносит ресурса" заполнен, элементов:', resourceItems.length);
                } else {
                    const li = document.createElement('li');
                    li.textContent = 'Нет данных';
                    baseResourceListEl.appendChild(li);
                    console.log('Блок "Приносит ресурса": нет ресурсов для отображения');
                }
            } else {
                const li = document.createElement('li');
                li.textContent = 'Нет данных';
                baseResourceListEl.appendChild(li);
                console.log('Блок "Приносит ресурса": data.income отсутствует');
            }
        } else {
            console.error('Элемент market-building-base-resource-list не найден!');
            // Попробуем найти через querySelector
            const screenEl = document.getElementById('market-building-screen');
            if (screenEl) {
                const foundEl = screenEl.querySelector('#market-building-base-resource-list');
                console.log('Поиск через querySelector:', !!foundEl);
            }
        }
        
        // Количество у игрока
        document.getElementById('market-building-player-count').textContent = data.player_count.toLocaleString('ru-RU');
        
        // Доход за раунд
        const incomeEl = document.getElementById('market-building-income');
        if (incomeEl) {
            incomeEl.innerHTML = '';
            if (data.income) {
                const incomeItems = [];
                
                // Монеты
                if (data.income.монеты && data.income.монеты > 0) {
                    incomeItems.push(`${data.income.монеты.toLocaleString('ru-RU')} монет`);
                }
                
                // Ресурсы
                if (data.income.ресурсы && Object.keys(data.income.ресурсы).length > 0) {
                    Object.entries(data.income.ресурсы).forEach(([resource, amount]) => {
                        if (amount > 0) {
                            incomeItems.push(`${amount.toLocaleString('ru-RU')} ${capitalizeFirst(resource)}`);
                        }
                    });
                }
                
                if (incomeItems.length > 0) {
                    incomeItems.forEach(item => {
                        const incomeItem = document.createElement('div');
                        incomeItem.className = 'market-building-income-value';
                        incomeItem.textContent = item;
                        incomeEl.appendChild(incomeItem);
                    });
                } else {
                    const noIncome = document.createElement('div');
                    noIncome.className = 'market-building-income-value';
                    noIncome.textContent = 'Нет дохода';
                    incomeEl.appendChild(noIncome);
                }
            }
        } else {
            console.error('Элемент market-building-income не найден');
        }
        
        // Список владельцев
        const ownersListEl = document.getElementById('market-building-owners-list');
        ownersListEl.innerHTML = '';
        if (data.owners && data.owners.length > 0) {
            data.owners.forEach(owner => {
                const ownerItem = document.createElement('div');
                ownerItem.className = 'market-building-owner-item';
                ownerItem.innerHTML = `
                    <span class="market-building-owner-name">${owner.name}</span>
                    <span class="market-building-owner-count">${owner.count}</span>
                `;
                ownersListEl.appendChild(ownerItem);
            });
        } else {
            ownersListEl.innerHTML = '<div style="text-align: center; color: #c9a961; padding: 10px;">Нет владельцев</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки данных объекта:', error);
        showToast('Ошибка загрузки данных объекта', 'error');
    }
}

// Возврат назад со страницы объекта на бирже
function goBackFromMarketBuilding() {
    // Возвращаемся на биржу
    showScreen('market');
    currentBuilding = null;
}

// Показ экрана строительства объекта с биржи
async function showBuildBuildingScreenFromMarket() {
    if (!currentBuilding) return;
    
    // Сохраняем предыдущий экран
    previousScreen = 'market-building';
    
    try {
        // Загружаем данные объекта для получения стоимости
        const response = await fetch(`/api/miniapp/market/building/${encodeURIComponent(currentBuilding)}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных объекта');
        }
        
        const data = await response.json();
        
        // Заполняем данные на странице
        document.getElementById('build-building-screen-name').textContent = `Построить ${currentBuilding}`;
        
        // Картинка
        const imagePath = buildingImages[currentBuilding] || '';
        const imageEl = document.getElementById('build-building-image');
        imageEl.src = imagePath;
        imageEl.alt = currentBuilding;
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        imageEl.style.display = 'block';
        
        // Доступные ресурсы у игрока (построчно с буллитами)
        const availableResourcesEl = document.getElementById('build-building-available-resources');
        availableResourcesEl.innerHTML = '';
        if (data.cost_resources && Object.keys(data.cost_resources).length > 0) {
            Object.entries(data.cost_resources).forEach(([resource, requiredAmount]) => {
                const availableAmount = playerState?.resources?.[resource] || 0;
                const canBuild = availableAmount >= requiredAmount;
                const li = document.createElement('li');
                li.className = canBuild ? 'build-building-available-resource-item' : 'build-building-available-resource-item insufficient';
                li.textContent = `${availableAmount}/${requiredAmount} ${resource}`;
                availableResourcesEl.appendChild(li);
            });
        }
        
        // Сбрасываем количество на 1
        document.getElementById('build-building-quantity-input').value = 1;
        updateBuildTotal();
        
        // Показываем экран
        showScreen('build-building');
    } catch (error) {
        console.error('Ошибка загрузки данных объекта:', error);
        showToast('Ошибка загрузки данных объекта', 'error');
    }
}

// Показ экрана продажи объекта с биржи
async function showSellBuildingScreenFromMarket() {
    if (!currentBuilding) return;
    
    // Сохраняем предыдущий экран
    previousScreen = 'market-building';
    
    // Находим объекты этого типа у игрока
    const buildings = playerState?.buildings || [];
    const matchingBuildings = buildings.filter(b => b.name === currentBuilding && b.status !== 'for_sale');
    
    if (matchingBuildings.length === 0) {
        showToast('У вас нет таких объектов для продажи', 'error');
        return;
    }
    
    try {
        // Получаем цену продажи одного объекта
        // Используем стоимость из конфига для расчета
        const response = await fetch(`/api/miniapp/market/building/${encodeURIComponent(currentBuilding)}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных объекта');
        }
        
        const data = await response.json();
        
        // Заполняем данные на странице
        document.getElementById('sell-building-screen-name').textContent = `Продать ${currentBuilding}`;
        
        // Картинка
        const imagePath = buildingImages[currentBuilding] || '';
        const imageEl = document.getElementById('sell-building-image');
        imageEl.src = imagePath;
        imageEl.alt = currentBuilding;
        imageEl.onerror = function() {
            this.style.display = 'none';
        };
        imageEl.style.display = 'block';
        
        // Цена за объект (стоимость в монетах)
        document.getElementById('sell-building-price-value').textContent = data.cost_coins.toLocaleString('ru-RU');
        
        // Количество у игрока
        const availableCount = matchingBuildings.length;
        document.getElementById('sell-building-available-value').textContent = availableCount;
        document.getElementById('sell-building-quantity-input').max = availableCount;
        document.getElementById('sell-building-quantity-input').value = 1;
        
        // Обновляем итоговую сумму
        updateSellBuildingTotal();
        
        // Показываем экран
        showScreen('sell-building');
    } catch (error) {
        console.error('Ошибка загрузки данных объекта:', error);
        showToast('Ошибка загрузки данных объекта', 'error');
    }
}

// Управление количеством при строительстве
function increaseBuildQuantity() {
    const input = document.getElementById('build-building-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    input.value = currentValue + 1;
    updateBuildTotal();
}

function decreaseBuildQuantity() {
    const input = document.getElementById('build-building-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue > 1) {
        input.value = currentValue - 1;
        updateBuildTotal();
    }
}

function updateBuildTotal() {
    // Блок "Итого" удален, функция оставлена для совместимости
    // но больше не обновляет UI
}

// Подтверждение строительства объекта
async function confirmBuildBuilding() {
    if (!currentBuilding) return;
    
    const quantity = parseInt(document.getElementById('build-building-quantity-input').value) || 1;
    if (quantity < 1) {
        showToast('Количество должно быть больше 0', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Строим объекты по одному
        let successCount = 0;
        let failedCount = 0;
        
        let lastErrorData = null;
        
        for (let i = 0; i < quantity; i++) {
            const response = await fetch('/api/miniapp/player/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify({
                    building_name: currentBuilding
                })
            });
            
            const data = await response.json();
            if (data.success) {
                successCount++;
            } else {
                failedCount++;
                lastErrorData = data; // Сохраняем последнюю ошибку
            }
        }
        
        if (successCount > 0) {
            showToast(successCount === 1 ? 'Объект начал строиться!' : 'Объекты начали строиться!', 'success');
            
            // Обновляем данные
            await loadPlayerState();
        } else {
            // Проверяем, это ошибка недостаточности ресурсов?
            if (failedCount > 0 && lastErrorData) {
                const errorMessage = lastErrorData.message || '';
                
                // Проверяем, содержит ли сообщение информацию о недостаточности ресурсов
                if (errorMessage.toLowerCase().includes('недостаточно') || 
                    errorMessage.toLowerCase().includes('ресурс')) {
                    // Получаем детали стоимости объекта
                    try {
                        const buildingResponse = await fetch('/api/miniapp/market/building/' + encodeURIComponent(currentBuilding), {
                            headers: {
                                'X-Telegram-Init-Data': tg.initData
                            }
                        });
                        const buildingData = await buildingResponse.json();
                        
                        if (buildingData.cost_in_resources) {
                            const missingResources = [];
                            const playerResources = playerState?.resources || {};
                            
                            for (const [resource, needed] of Object.entries(buildingData.cost_in_resources)) {
                                const available = playerResources[resource] || 0;
                                if (available < needed) {
                                    missingResources.push({
                                        label: capitalizeFirst(resource),
                                        value: `Нужно: ${needed}, есть: ${available}, не хватает: ${needed - available}`
                                    });
                                }
                            }
                            
                            if (missingResources.length > 0) {
                                showToast('Недостаточно ресурсов', 'error');
                            } else {
                                showToast(errorMessage || 'Ошибка строительства объекта', 'error');
                            }
                        } else {
                            showToast(errorMessage || 'Ошибка строительства объекта', 'error');
                        }
                    } catch (error) {
                        showToast(errorMessage || 'Ошибка строительства объекта', 'error');
                    }
                } else {
                    showToast(errorMessage || 'Ошибка строительства объекта', 'error');
                }
            } else {
                showToast('Ошибка строительства объекта', 'error');
            }
        }
    } catch (error) {
        console.error('Ошибка строительства объекта:', error);
        showToast('Ошибка при строительстве объекта', 'error');
    } finally {
        showLoading(false);
    }
}

// Возврат назад со страницы строительства
function goBackFromBuildBuilding() {
    showScreen('market-building');
}

// Управление количеством при продаже объекта
function increaseSellBuildingQuantity() {
    const input = document.getElementById('sell-building-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    const max = parseInt(input.max) || 0;
    if (currentValue < max) {
        input.value = currentValue + 1;
        updateSellBuildingTotal();
    }
}

function decreaseSellBuildingQuantity() {
    const input = document.getElementById('sell-building-quantity-input');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue > 1) {
        input.value = currentValue - 1;
        updateSellBuildingTotal();
    }
}

function updateSellBuildingTotal() {
    if (!currentBuilding) return;
    
    const quantity = parseInt(document.getElementById('sell-building-quantity-input').value) || 1;
    const pricePerBuilding = parseInt(document.getElementById('sell-building-price-value').textContent.replace(/\s/g, '')) || 0;
    const total = pricePerBuilding * quantity;
    
    document.getElementById('sell-building-total-value').textContent = total.toLocaleString('ru-RU');
}

// Подтверждение продажи объекта
async function confirmSellBuilding() {
    if (!currentBuilding) return;
    
    const quantity = parseInt(document.getElementById('sell-building-quantity-input').value) || 1;
    if (quantity < 1) {
        showToast('Количество должно быть больше 0', 'error');
        return;
    }
    
    const max = parseInt(document.getElementById('sell-building-quantity-input').max) || 0;
    if (quantity > max) {
        showToast('Недостаточно объектов для продажи', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // Находим объекты для продажи
        const buildings = playerState?.buildings || [];
        const matchingBuildings = buildings.filter(b => 
            b.name === currentBuilding && b.status !== 'for_sale'
        ).slice(0, quantity);
        
        if (matchingBuildings.length === 0) {
            showToast('Объекты не найдены', 'error');
            return;
        }
        
        // Продаем объекты
        const promises = matchingBuildings.map(building => 
            fetch('/api/miniapp/player/sell-building', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify({
                    building_id: building.id
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const allSuccess = results.every(r => r.success);
        
        if (allSuccess) {
            // Суммируем цены продажи
            const totalPrice = results.reduce((sum, r) => sum + (r.sale_price || 0), 0);
            
            showToast('Объект выставлен на продажу!', 'success');
            
            // Обновляем данные
            await loadPlayerState();
        } else {
            const failed = results.filter(r => !r.success);
            showToast(`Ошибка при продаже ${failed.length} объектов`, 'error');
        }
    } catch (error) {
        console.error('Ошибка продажи объектов:', error);
        showToast('Ошибка при продаже объектов', 'error');
    } finally {
        showLoading(false);
    }
}

// Возврат назад со страницы продажи
function goBackFromSellBuilding() {
    showScreen('market-building');
}

// Показ экрана продажи объекта
function showSellBuildingScreen() {
    if (!currentBuilding || !currentBuildingStatus) return;
    
    // Находим объекты этого типа и статуса
    const buildings = playerState?.buildings || [];
    const matchingBuildings = buildings.filter(b => 
        b.name === currentBuilding && b.status === currentBuildingStatus
    );
    
    if (matchingBuildings.length === 0) {
        showToast('Объект не найден', 'error');
        return;
    }
    
    // Продаем все объекты этого типа и статуса
    sellBuildingsFromPortfolio(matchingBuildings);
}

// Продажа объектов из портфеля
async function sellBuildingsFromPortfolio(buildings) {
    if (buildings.length === 0) return;
    
    showLoading(true);
    
    try {
        // Продаем все объекты
        const promises = buildings.map(building => 
            fetch('/api/miniapp/player/sell-building', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify({
                    building_id: building.id
                })
            })
        );
        
        const responses = await Promise.all(promises);
        const results = await Promise.all(responses.map(r => r.json()));
        
        const allSuccess = results.every(r => r.success);
        
        if (allSuccess) {
            // Суммируем цены продажи
            const totalPrice = results.reduce((sum, r) => sum + (r.sale_price || 0), 0);
            const buildingName = buildings[0]?.name || currentBuilding || 'Объект';
            
            showToast('Объект выставлен на продажу!', 'success');
            
            // Обновляем данные
            await loadPlayerState();
        } else {
            const failed = results.filter(r => !r.success);
            showToast(`Ошибка при продаже ${failed.length} объектов`, 'error');
        }
    } catch (error) {
        console.error('Ошибка продажи объектов:', error);
        showToast('Ошибка при продаже объектов', 'error');
    } finally {
        showLoading(false);
    }
}

// Вспомогательные функции

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Маппинг изображений ресурсов
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

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getStatusText(status) {
    const statusMap = {
        'building': 'Строится',
        'completed': 'Построен',
        'active': 'Активен',
        'for_sale': 'На продаже'
    };
    return statusMap[status] || status;
}

// Закрытие модальных окон при клике вне их
window.onclick = function(event) {
    const modals = ['buy-resource-modal', 'sell-resource-modal', 'build-modal', 'sell-building-modal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

