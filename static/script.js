let ws = null;
let reconnectInterval = null;
let gameCode = null; // Код игры (6 цифр)

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

/**
 * Экранирование HTML для предотвращения XSS
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========== GAME CODE HELPERS ==========

/**
 * Валидация кода игры (6 цифр, 100000-999999)
 */
function validateGameCode(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(code)) {
        return false;
    }
    const codeNum = parseInt(code, 10);
    return codeNum >= 100000 && codeNum <= 999999;
}

/**
 * Сохранить код игры в localStorage
 */
function saveGameCode(code) {
    if (validateGameCode(code)) {
        localStorage.setItem('web_game_code', code);
        gameCode = code;
        return true;
    }
    return false;
}

/**
 * Получить код игры из localStorage
 */
function getGameCode() {
    if (gameCode) {
        return gameCode;
    }
    const saved = localStorage.getItem('web_game_code');
    if (saved && validateGameCode(saved)) {
        gameCode = saved;
        return saved;
    }
    return null;
}

/**
 * Очистить сохраненный код игры
 */
function clearGameCode() {
    localStorage.removeItem('web_game_code');
    gameCode = null;
}

/**
 * Добавить game_code к URL как query-параметр
 */
function addGameCodeToUrl(url) {
    const code = getGameCode();
    if (!code) {
        return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}game_code=${encodeURIComponent(code)}`;
}

/**
 * Проверить статус игры перед подключением
 */
async function checkGameStatus(code) {
    try {
        console.log('checkGameStatus: проверяю код', code);
        const url = `/api/game-state?game_code=${encodeURIComponent(code)}`;
        console.log('checkGameStatus: запрос к', url);
        const response = await fetch(url);
        console.log('checkGameStatus: статус ответа', response.status);
        
        if (response.status === 403) {
            const data = await response.json().catch(() => ({}));
            console.log('checkGameStatus: игра в архиве', data);
            return { allowed: false, error: data.detail || 'Игра завершена и перемещена в архив' };
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.log('checkGameStatus: ошибка ответа', response.status, data);
            return { allowed: false, error: data.detail || 'Игра не найдена или недоступна' };
        }
        console.log('checkGameStatus: игра доступна');
        return { allowed: true };
    } catch (error) {
        console.error('Ошибка проверки статуса игры:', error);
        return { allowed: false, error: 'Ошибка подключения к серверу: ' + (error.message || 'Неизвестная ошибка') };
    }
}

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

// Включить/выключить видео (false = видео отключены, показываются вручную на проекторе)
const ENABLE_VIDEOS = false;

// Состояние игры
let gameState = {
    currentScreen: 'start', // start, video, intro-complete, game, final-results
    currentRound: 0, // 0 означает, что раунд еще не установлен вручную
    isVideoPlaying: false,
    roundManuallySet: false // Флаг, что раунд был установлен вручную
};

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const code = getGameCode();
    let wsUrl = `${protocol}//${window.location.host}/ws`;
    
    // Добавляем game_code к WebSocket URL, если он есть
    if (code) {
        wsUrl += `?game_code=${encodeURIComponent(code)}`;
    }
    
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
            // Загружаем контент для нового раунда и обновляем видимость кнопки
            // Вызываем асинхронно, не блокируя обновление UI
            loadRoundContentForCurrentRound().catch(error => {
                console.error('Ошибка загрузки контента раунда:', error);
            });
        }
    }
    if (data.num_players !== undefined) {
        document.getElementById('num-players').textContent = data.num_players;
    }
    
    // Обновляем турнирную таблицу
    // API возвращает leaderboard как массив напрямую, но WebSocket может отправлять как объект
    const leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : (data.leaderboard?.leaderboard || []);
    if (leaderboard && leaderboard.length > 0) {
        updateLeaderboard(leaderboard);
    }
    
    // Обновляем цены
    // API возвращает prices как массив напрямую, но WebSocket может отправлять как объект
    const prices = Array.isArray(data.prices) ? data.prices : (data.prices?.prices || []);
    if (prices && prices.length > 0) {
        updatePrices(prices);
    }
    
    // Обновляем объекты (всегда показываем карточки всех типов, при отсутствии данных — с нулями)
    const buildings = Array.isArray(data.buildings) ? data.buildings : (data.buildings?.buildings || []);
    updateBuildings(buildings || []);
}

function mergeLeaderboardRows(incoming, previous) {
    if (!incoming || !incoming.length) return [];
    if (!previous || !previous.length) return incoming.slice();
    const prevById = {};
    previous.forEach(function (p) {
        if (p && p.player_id != null) prevById[String(p.player_id)] = p;
    });
    const enrichKeys = ['buildings_portfolio', 'growth_percent', 'growth_round_percent', 'growth_game_percent'];
    return incoming.map(function (p) {
        if (!p || p.player_id == null) return p;
        const old = prevById[String(p.player_id)];
        if (!old) return p;
        const out = Object.assign({}, p);
        enrichKeys.forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(out, k) && Object.prototype.hasOwnProperty.call(old, k)) {
                out[k] = old[k];
            }
        });
        return out;
    });
}

function updateLeaderboard(leaderboard) {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    const incoming = Array.isArray(leaderboard) ? leaderboard : [];
    const merged = mergeLeaderboardRows(incoming, lastLeaderboardData);
    lastLeaderboardData = merged.slice();

    if (lastLeaderboardData.length > 0 && !Object.prototype.hasOwnProperty.call(lastLeaderboardData[0], 'buildings_portfolio')) {
        if (!leaderboardEnrichPromise) {
            leaderboardEnrichPromise = fetch(addGameCodeToUrl('/api/leaderboard'))
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    leaderboardEnrichPromise = null;
                    var lb = data && data.leaderboard;
                    if (lb && lb.length) {
                        updateLeaderboard(lb);
                    }
                })
                .catch(function () { leaderboardEnrichPromise = null; });
        }
    }

    if (merged.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #e8d5b7;">Игроки еще не добавлены</td></tr>';
        return;
    }
    
    merged.forEach((player, index) => {
        const row = document.createElement('tr');
        row.classList.add('leaderboard-row-clickable');
        row.setAttribute('data-player-index', String(index));
        
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
        
        const safePlayerName = escapeHtml(player.character_name || player.name || 'Игрок');
        row.innerHTML = `
            <td><strong style="color: #3a2a1a;">${index + 1}</strong></td>
            <td style="color: #3a2a1a;">${safePlayerName}</td>
            <td style="color: #3a2a1a;">${Math.round(player.total_value)} монет</td>
            <td class="${growthRoundClass}">${growthRoundSign}${Math.round(growthRound)}%</td>
            <td class="${growthGameClass}">${growthGameSign}${Math.round(growthGame)}%</td>
        `;
        
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPlayerModal(index);
        });
        
        tbody.appendChild(row);
    });
}

function updatePrices(prices) {
    const pricesByResource = {};
    (prices || []).forEach(p => { pricesByResource[p.resource] = p; });
    const ordered = allResourcesOrder.map(res => pricesByResource[res]).filter(Boolean);
    const n = ordered.length;
    const size = Math.ceil(n / 3) || 1;
    const chunks = [
        ordered.slice(0, size),
        ordered.slice(size, size * 2),
        ordered.slice(size * 2, size * 3)
    ];
    [1, 2, 3].forEach((i, idx) => {
        const tbody = document.getElementById('prices-body-' + i);
        if (!tbody) return;
        tbody.innerHTML = '';
        const chunk = chunks[idx] || [];
        if (chunk.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #3a2a1a;">—</td></tr>';
            return;
        }
        chunk.forEach(price => {
            const row = document.createElement('tr');
            const prevClass = price.change_from_prev_percent > 0 ? 'positive' : price.change_from_prev_percent < 0 ? 'negative' : 'neutral';
            const startClass = price.change_from_start_percent > 0 ? 'positive' : price.change_from_start_percent < 0 ? 'negative' : 'neutral';
            const prevSign = price.change_from_prev_percent > 0 ? '+' : '';
            const startSign = price.change_from_start_percent > 0 ? '+' : '';
            const resourceName = escapeHtml(price.resource.charAt(0).toUpperCase() + price.resource.slice(1));
            const resourceIconName = price.resource.charAt(0).toUpperCase() + price.resource.slice(1) + '.png';
            const resourceIconPath = '/design/icons/' + encodeURIComponent(resourceIconName);
            row.innerHTML = `
                <td class="prices-resource-cell">
                    <img src="${resourceIconPath}" alt="" class="prices-resource-icon" onerror="this.style.display='none'">
                    <strong style="color: #3a2a1a;">${resourceName}</strong>
                </td>
                <td style="color: #3a2a1a;">${Math.round(price.current_price)}</td>
                <td class="${prevClass}">${prevSign}${Math.round(price.change_from_prev_percent)}%</td>
                <td class="${startClass}">${startSign}${Math.round(price.change_from_start_percent)}%</td>
            `;
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof openResourceModal === 'function') openResourceModal(price.resource);
            });
            tbody.appendChild(row);
        });
    });
}

/** Картинка объекта в модалке: design/картинки для карточек объектов/<имя в нижнем регистре> (1).png */
function webBuildingModalImageUrl(buildingName) {
    if (!buildingName) return '';
    const dir = 'картинки для карточек объектов';
    const file = buildingName.toLowerCase() + ' (1).png';
    return '/design/' + encodeURIComponent(dir) + '/' + encodeURIComponent(file);
}

/** Картинка ресурса в модалке: design/картинки для веба (ресурсы)/<Имя> (1).png */
function webResourceModalImageUrl(resourceName) {
    if (!resourceName) return '';
    const name = resourceName.charAt(0).toUpperCase() + resourceName.slice(1);
    const dir = 'картинки для веба (ресурсы)';
    const file = name + ' (1).png';
    return '/design/' + encodeURIComponent(dir) + '/' + encodeURIComponent(file);
}

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

/** Последние данные турнирной таблицы (для карточки игрока) */
let lastLeaderboardData = [];
/** Если WS отдаёт строки без buildings_portfolio — один раз подтягиваем GET /api/leaderboard (полный build_enriched). */
let leaderboardEnrichPromise = null;
let currentPlayerModalIndex = 0;
let playerModalEl = null;

function buildingIconUrlForName(buildingName) {
    if (!buildingName) return '';
    return '/design/icons/' + encodeURIComponent(buildingName) + '.png';
}

/** Подписи статусов как в мини-приложении (портфель, updateBuildings). */
function portfolioStatusText(status) {
    const s = (status == null) ? '' : String(status);
    const statusMap = {
        building: 'Строится',
        active: 'Активен',
        for_sale: 'Продается',
        sold: 'Продан',
        completed: 'Активен',
    };
    return statusMap[s] || status;
}

function fillPlayerModalCard(player, rankIndex) {
    const name = player.character_name || player.name || 'Игрок';
    const money = typeof player.money === 'number' ? player.money : parseFloat(player.money) || 0;
    const totalVal = player.total_value != null && player.total_value !== ''
        ? Number(player.total_value)
        : NaN;
    const displayCapitalization = Number.isFinite(totalVal) ? totalVal : money;
    const gr = player.growth_round_percent != null ? player.growth_round_percent : (player.growth_percent || 0);
    const gg = player.growth_game_percent != null ? player.growth_game_percent : 0;

    const nameEl = document.getElementById('player-modal-name');
    const moneyValueEl = document.getElementById('player-modal-money-value');
    const rankNumEl = document.getElementById('player-modal-rank-num');
    const pillRound = document.getElementById('player-modal-pill-round');
    const pillGame = document.getElementById('player-modal-pill-game');
    const listEl = document.getElementById('player-modal-buildings');
    const imgEl = document.getElementById('player-modal-avatar');
    const fbEl = document.getElementById('player-modal-avatar-fallback');

    if (nameEl) nameEl.textContent = name;
    if (rankNumEl) rankNumEl.textContent = String(rankIndex + 1);
    if (moneyValueEl) moneyValueEl.textContent = Math.round(displayCapitalization).toLocaleString('ru-RU');

    if (pillRound) {
        const signR = gr > 0 ? '+' : '';
        pillRound.textContent = `${signR}${Math.round(gr)}%`;
        pillRound.classList.toggle('negative', gr < 0);
    }
    if (pillGame) {
        const signG = gg > 0 ? '+' : '';
        pillGame.textContent = `${signG}${Math.round(gg)}%`;
        pillGame.classList.toggle('negative', gg < 0);
    }

    const photo = player.character_image;
    if (photo && imgEl && fbEl) {
        imgEl.onload = () => {
            imgEl.style.display = 'block';
            fbEl.style.display = 'none';
        };
        imgEl.onerror = () => {
            imgEl.style.display = 'none';
            fbEl.style.display = 'flex';
            fbEl.textContent = (name.charAt(0) || '?').toUpperCase();
        };
        imgEl.src = photo;
        if (imgEl.complete && imgEl.naturalWidth > 0) {
            imgEl.style.display = 'block';
            fbEl.style.display = 'none';
        }
    } else if (imgEl && fbEl) {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
        fbEl.style.display = 'flex';
        fbEl.textContent = (name.charAt(0) || '?').toUpperCase();
    }

    if (listEl) {
        listEl.innerHTML = '';
        const portfolio = (player.buildings_portfolio || []).filter(function (row) {
            return row && row.status !== 'sold';
        });
        if (portfolio.length > 0) {
            portfolio.forEach((row) => {
                const li = document.createElement('li');
                const icon = document.createElement('img');
                icon.className = 'player-modal-building-icon';
                icon.alt = '';
                icon.src = buildingIconUrlForName(row.name);
                icon.onerror = () => { icon.style.visibility = 'hidden'; };
                const label = document.createElement('span');
                label.className = 'player-modal-building-name';
                label.textContent = row.name;
                const pill = document.createElement('span');
                pill.className = 'building-status-pill ' + (row.status || '');
                pill.textContent = portfolioStatusText(row.status);
                li.appendChild(icon);
                li.appendChild(label);
                li.appendChild(pill);
                listEl.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.className = 'player-modal-buildings-empty';
            li.textContent = 'Нет объектов';
            listEl.appendChild(li);
        }
    }
}

/** Карточка игрока: при урезанных данных WS подгружаем строку из GET /api/leaderboard. */
function fillPlayerModalFromIndex(index) {
    const base = lastLeaderboardData[index];
    if (!base) return;
    if (Object.prototype.hasOwnProperty.call(base, 'buildings_portfolio')) {
        fillPlayerModalCard(base, index);
        return;
    }
    fillPlayerModalCard(base, index);
    fetch(addGameCodeToUrl('/api/leaderboard'))
        .then(function (res) { return res.json(); })
        .then(function (data) {
            const lb = data && data.leaderboard;
            if (lb && lb.length) {
                const row = lb.find(function (p) { return p.player_id === base.player_id; });
                if (row) lastLeaderboardData[index] = row;
            }
            fillPlayerModalCard(lastLeaderboardData[index], index);
        })
        .catch(function () {});
}

function updatePlayerModalNavButtons() {
    const left = document.getElementById('player-modal-nav-left');
    const right = document.getElementById('player-modal-nav-right');
    const n = lastLeaderboardData.length;
    if (left) left.disabled = n <= 1 || currentPlayerModalIndex <= 0;
    if (right) right.disabled = n <= 1 || currentPlayerModalIndex >= n - 1;
}

function openPlayerModal(playerIndex) {
    if (!lastLeaderboardData.length || playerIndex < 0 || playerIndex >= lastLeaderboardData.length) {
        return;
    }
    currentPlayerModalIndex = playerIndex;
    fillPlayerModalFromIndex(currentPlayerModalIndex);
    updatePlayerModalNavButtons();
    if (playerModalEl) {
        playerModalEl.style.display = 'block';
    }
}

function closePlayerModal() {
    if (playerModalEl) {
        playerModalEl.style.display = 'none';
    }
}

function navigatePlayerModal(delta) {
    const n = lastLeaderboardData.length;
    if (n <= 1) return;
    let next = currentPlayerModalIndex + delta;
    if (next < 0 || next >= n) return;
    currentPlayerModalIndex = next;
    fillPlayerModalFromIndex(currentPlayerModalIndex);
    updatePlayerModalNavButtons();
}

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
        
        // Картинки для карточек — только из папки design/картинки для карточек объектов (название (1).png)
        const cardImageFile = buildingName.toLowerCase() + ' (1).png';
        const imagePath = '/design/картинки%20для%20карточек%20объектов/' + encodeURIComponent(cardImageFile);
        
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
        
        const income = buildingIncome[buildingName] || {};
        
        // Ресурс/доход для нижнего блока карточки (как на макете)
        let resourceText = '';
        if (income.монеты > 0) {
            resourceText = `монеты: ${income.монеты}`;
        } else if (income.ресурсы && Object.keys(income.ресурсы).length > 0) {
            const first = Object.entries(income.ресурсы)[0];
            resourceText = first ? `${first[0]}: ${first[1]}` : '';
        }
        
        const safeBuildingName = escapeHtml(building.name);
        const displayName = building.name.toUpperCase();
        const pct = Math.round(building.players_percentage);
        const tr = building.players_pct_trend;
        const trend = tr === 'up' || tr === 'down' ? tr : 'same';
        card.innerHTML = `
            <div class="building-card-image-wrap">
                <img src="${imagePath}" alt="${safeBuildingName}" class="building-image" onerror="this.style.display='none'">
            </div>
            <div class="building-card-content">
                <div class="building-name">${displayName}</div>
                <div class="building-stats">
                    <div class="building-count">${building.count}</div>
                    <div class="building-percentage-container">
                        <span class="building-percentage">${pct}%</span>
                        <span class="building-percentage-label">игроков</span>
                    </div>
                    <span class="building-trend building-trend-${trend}" aria-label="${trend === 'up' ? 'Рост' : trend === 'down' ? 'Спад' : 'Без изменений'}"></span>
                </div>
                ${resourceText ? `<div class="building-resource">${escapeHtml(resourceText)}</div>` : ''}
            </div>
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
const modalClose = document.getElementById('building-modal-close');

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

// Закрытие модального окна объекта
if (modalClose) {
    modalClose.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// Навигация с клавиатуры
document.addEventListener('keydown', (event) => {
    if (typeof playerModalEl !== 'undefined' && playerModalEl && playerModalEl.style.display === 'block') {
        return;
    }
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
function openBuildingModal(buildingName, cardCount, cardPercentage) {
    // Находим индекс текущего объекта
    currentBuildingIndex = allBuildingsOrder.indexOf(buildingName);
    if (currentBuildingIndex === -1) {
        currentBuildingIndex = 0;
    }
    
    loadBuildingModalData(buildingName, cardCount, cardPercentage);
    
    // Обновляем состояние кнопок навигации
    updateNavigationButtons();
}

// Функция для загрузки данных объекта в модальное окно
function loadBuildingModalData(buildingName, cardCount, cardPercentage) {
    try {
        // Используем данные из кэша, если они есть, иначе из параметров
        const cachedData = buildingsDataCache[buildingName];
        const count = cachedData ? cachedData.count : cardCount;
        const percentage = cachedData ? cachedData.percentage : cardPercentage;
        
        const imagePath = webBuildingModalImageUrl(buildingName);
        const imageEl = document.getElementById('modal-building-image');
        imageEl.src = imagePath;
        imageEl.alt = buildingName;
        imageEl.style.display = 'block';
        imageEl.onerror = function () {
            this.style.display = 'none';
        };
        
        document.getElementById('modal-building-name').textContent = buildingName;
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
function navigateToPrevious() {
    if (currentBuildingIndex > 0) {
        currentBuildingIndex--;
        const buildingName = allBuildingsOrder[currentBuildingIndex];
        const cachedData = buildingsDataCache[buildingName] || { count: 0, percentage: 0 };
        loadBuildingModalData(buildingName, cachedData.count, cachedData.percentage);
        updateNavigationButtons();
    }
}

// Функция для переключения на следующий объект
function navigateToNext() {
    if (currentBuildingIndex < allBuildingsOrder.length - 1) {
        currentBuildingIndex++;
        const buildingName = allBuildingsOrder[currentBuildingIndex];
        const cachedData = buildingsDataCache[buildingName] || { count: 0, percentage: 0 };
        loadBuildingModalData(buildingName, cachedData.count, cachedData.percentage);
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
        const response = await fetch(addGameCodeToUrl(`/api/resource/${encodeURIComponent(resourceName)}`));
        
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
        document.getElementById('resource-modal-name').textContent = escapeHtml(resourceNameCapitalized);
        document.getElementById('resource-modal-price').textContent = `${data.current_price} монет`;
        
        // Загружаем картинку ресурса
        const imagePath = webResourceModalImageUrl(resourceName);
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

// Функция для отрисовки графика цены (логика совпадает с миниапом: drawPriceChartForResource)
function drawPriceChart(priceHistory) {
    const canvas = document.getElementById('resource-price-chart');
    if (!canvas) {
        console.error('Canvas не найден');
        return;
    }

    const ctx = canvas.getContext('2d');

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

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    const byRound = new Map();
    for (const p of priceHistory) {
        if (!p || typeof p.round !== 'number' || p.round < 1) continue;
        byRound.set(p.round, { round: p.round, price: Number(p.price) });
    }
    let standardizedHistory = Array.from(byRound.keys())
        .sort((a, b) => a - b)
        .map((r) => byRound.get(r));
    if (standardizedHistory.length === 0) {
        ctx.fillStyle = '#3a2a1a';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для графика', canvas.width / 2, canvas.height / 2);
        return;
    }

    const prices = standardizedHistory.map((h) => h.price);
    const minPrice = 0;
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.stroke();

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

    const n = standardizedHistory.length;

    function xForIndex(index) {
        if (n <= 1) return padding;
        return padding + (chartWidth / (n - 1)) * index;
    }
    function yForPrice(price) {
        return padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    }

    if (n >= 2) {
        ctx.strokeStyle = '#006400';
        ctx.lineWidth = 3;
        ctx.beginPath();
        standardizedHistory.forEach((point, index) => {
            const x = xForIndex(index);
            const y = yForPrice(point.price);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    }

    ctx.fillStyle = '#006400';
    const labelStride = n > 12 ? Math.ceil(n / 8) : 1;
    standardizedHistory.forEach((point, index) => {
        const x = xForIndex(index);
        const y = yForPrice(point.price);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        const showLabel =
            n <= 12 || index === 0 || index === n - 1 || index % labelStride === 0;
        if (showLabel) {
            ctx.fillStyle = '#3a2a1a';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(String(point.round), x, canvas.height - padding + 20);
            ctx.fillStyle = '#006400';
        }
    });

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
    // Загружаем сохраненный game_code при загрузке страницы
    const savedCode = getGameCode();
    const gameCodeInput = document.getElementById('game-code-input');
    const changeGameBtn = document.getElementById('change-game-btn');
    
    if (gameCodeInput && savedCode) {
        gameCodeInput.value = savedCode;
        if (changeGameBtn) {
            changeGameBtn.style.display = 'block';
        }
    }
    
    // Обработка ввода только цифр в поле game_code
    if (gameCodeInput) {
        // Убеждаемся, что поле доступно для ввода
        gameCodeInput.disabled = false;
        gameCodeInput.readOnly = false;
        
        gameCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
        
        gameCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('start-game-btn')?.click();
            }
        });
        
        // Фокус на поле при загрузке, если нет сохраненного кода
        if (!savedCode) {
            setTimeout(() => {
                gameCodeInput.focus();
            }, 100);
        }
    }
    
    // Кнопка "Сменить игру"
    if (changeGameBtn) {
        changeGameBtn.addEventListener('click', () => {
            clearGameCode();
            if (gameCodeInput) {
                gameCodeInput.value = '';
                gameCodeInput.focus();
            }
            changeGameBtn.style.display = 'none';
        });
    }
    
    // Кнопка "Начать игру"
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            try {
                // Проверяем и сохраняем game_code
                const code = gameCodeInput?.value.trim() || '';
                const errorDiv = document.getElementById('game-code-error');
                
                if (!code) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Введите код игры (6 цифр)';
                        errorDiv.style.display = 'block';
                    }
                    gameCodeInput?.focus();
                    return;
                }
                
                if (!validateGameCode(code)) {
                    if (errorDiv) {
                        errorDiv.textContent = 'Код должен состоять из 6 цифр (100000-999999)';
                        errorDiv.style.display = 'block';
                    }
                    gameCodeInput?.focus();
                    return;
                }
                
                // Проверяем статус игры
                console.log('Проверяю статус игры для кода:', code);
                const statusCheck = await checkGameStatus(code);
                console.log('Результат проверки статуса:', statusCheck);
                
                if (!statusCheck.allowed) {
                    if (errorDiv) {
                        errorDiv.textContent = statusCheck.error || 'Игра недоступна';
                        errorDiv.style.display = 'block';
                    }
                    gameCodeInput?.focus();
                    return;
                }
                
                // Сохраняем код
                saveGameCode(code);
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                }
                if (changeGameBtn) {
                    changeGameBtn.style.display = 'block';
                }
                
                console.log('Переход к экрану intro-complete');
                // Переходим на экран с кнопками
                showScreen('intro-complete');
            } catch (error) {
                console.error('Ошибка при запуске игры:', error);
                const errorDiv = document.getElementById('game-code-error');
                if (errorDiv) {
                    errorDiv.textContent = 'Ошибка при запуске игры: ' + (error.message || 'Неизвестная ошибка');
                    errorDiv.style.display = 'block';
                }
            }
        });
    }

    // Кнопка "Х" — открыть/закрыть меню (Новая игра, Начать сначала, Подвести итоги)
    const headerMenuBtn = document.getElementById('header-menu-btn');
    const headerMenuDropdown = document.getElementById('header-menu-dropdown');
    if (headerMenuBtn && headerMenuDropdown) {
        headerMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = headerMenuDropdown.style.display === 'block';
            headerMenuDropdown.style.display = isOpen ? 'none' : 'block';
        });
        document.addEventListener('click', () => {
            headerMenuDropdown.style.display = 'none';
        });
        headerMenuDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.classList.contains('header-menu-item')) {
                headerMenuDropdown.style.display = 'none';
            }
        });
    }

    // Кнопка "Новая игра" — переход на экран ввода кода (без вызова API)
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            if (confirm('Начать новую игру? Вы перейдёте на экран ввода кода игры.')) {
                clearGameCode();
                const gameCodeInput = document.getElementById('game-code-input');
                if (gameCodeInput) {
                    gameCodeInput.value = '';
                }
                showScreen('start');
            }
        });
    }

    // Кнопка "Посмотреть интро" — контент из админки (round_number = 0), модалка как у видео раундов
    const showIntroBtn = document.getElementById('show-intro-btn');
    if (showIntroBtn) {
        showIntroBtn.addEventListener('click', async () => {
            const code = getGameCode();
            if (!code) {
                alert('Введите код игры');
                return;
            }
            try {
                const response = await fetch(addGameCodeToUrl('/api/intro/content'));
                const data = await response.json().catch(() => ({}));
                if (data.success && data.content_url) {
                    window.currentRoundNumber = 0;
                    window.roundContent = { content_url: data.content_url, content_type: data.content_type || 'video' };
                    showRoundVideo();
                } else {
                    alert(data.message || 'Интро не настроено');
                }
            } catch (err) {
                console.error('Ошибка загрузки интро:', err);
                alert('Не удалось загрузить интро. Попробуйте позже.');
            }
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
            const currentRound = gameState.currentRound || parseInt(document.getElementById('current-round')?.textContent) || 1;
            const code = getGameCode();
            const reqUrl = addGameCodeToUrl('/api/game/next-round');
            if (currentRound < 10) {
                const nextRound = currentRound + 1;
                try {
                    const response = await fetch(reqUrl, { method: 'POST' });
                    const data = await response.json().catch(() => ({}));
                    if (response.ok && data.success) {
                        startRound(data.current_round);
                        return;
                    }
                } catch (error) {
                    console.warn('Не удалось обновить раунд на сервере (продолжаем локально):', error);
                }
                startRound(nextRound);
            }
        });
    }

    // Кнопка "Начать сначала" — откат к снимку 0 (базовое состояние из админки)
    const restartGameBtn = document.getElementById('restart-game-btn');
    if (restartGameBtn) {
        restartGameBtn.addEventListener('click', async () => {
            if (!confirm('Откатить игру к начальному состоянию? Все раунды будут сброшены.')) {
                return;
            }
            try {
                const response = await fetch(addGameCodeToUrl('/api/game/rollback'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ round_number: 0 })
                });
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success) {
                    startRound(data.current_round || 1);
                    await loadGameState();
                } else {
                    alert(data.detail || data.error || 'Не удалось откатить игру');
                }
            } catch (e) {
                console.error('Ошибка отката:', e);
                alert('Ошибка сети. Попробуйте ещё раз.');
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
    
    // Загружаем контент для нового раунда (до обновления на сервере)
    await loadRoundContentForCurrentRound();
    
    // Обновляем раунд на сервере (если endpoint доступен)
    try {
        const response = await fetch(addGameCodeToUrl('/api/game/set-round'), {
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
                await loadGameState();
            }
        } else {
            console.warn('Не удалось обновить раунд на сервере, продолжаем локально');
        }
    } catch (error) {
        console.warn('Ошибка обновления раунда на сервере (продолжаем локально):', error);
    }
    
    // Показываем видео раунда (или пропускаем, если видео отключены)
    if (ENABLE_VIDEOS) {
        playVideo(`Раунд ${gameState.currentRound}.mp4`, () => {
            // После видео показываем основной экран
            showScreen('game');
            connectWebSocket();
            updateRoundControls(gameState.currentRound);
        });
    } else {
        // Видео отключены - сразу переходим к игровому экрану
        showScreen('game');
        connectWebSocket();
        updateRoundControls(gameState.currentRound);
    }
}

function updateRoundControls(roundNumber) {
    const nextRoundBtn = document.getElementById('next-round-btn');
    const finalResultsBtn = document.getElementById('final-results-btn');
    const restartGameBtn = document.getElementById('restart-game-btn');
    
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
    
    if (restartGameBtn) {
        restartGameBtn.style.display = roundNumber >= 1 ? 'block' : 'none';
    }
    
    // Обновляем видимость кнопки видео
    updateVideoButtonVisibility();
}

async function loadGameState() {
    try {
        const code = getGameCode();
        if (!code) {
            console.error('loadGameState: код игры не найден');
            return;
        }
        
        console.log('loadGameState: загружаю состояние игры для кода', code);
        const response = await fetch(`/api/game-state?game_code=${encodeURIComponent(code)}`);
        
        if (!response.ok) {
            console.error('loadGameState: ошибка загрузки', response.status);
            return;
        }
        
        const data = await response.json();
        console.log('loadGameState: данные получены', Object.keys(data));
        
        // Обновляем UI с полученными данными
        updateUI(data);
        
        // Загружаем контент раунда
        await loadRoundContentForCurrentRound();
    } catch (error) {
        console.error('loadGameState: ошибка', error);
    }
}

function showScreen(screenName) {
    console.log('showScreen: переключение на экран', screenName);
    // Скрываем все экраны
    const screens = ['start-screen', 'video-screen', 'intro-complete-screen', 'rules-screen', 'game-screen', 'final-results-screen'];
    screens.forEach(screen => {
        const el = document.getElementById(screen);
        if (el) {
            el.style.display = 'none';
            console.log('showScreen: скрыт экран', screen);
        }
    });
    
    // Показываем нужный экран
    const targetScreenId = `${screenName}-screen`;
    const targetScreen = document.getElementById(targetScreenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
        console.log('showScreen: показан экран', targetScreenId);
    } else {
        console.error('showScreen: экран не найден', targetScreenId);
    }
    
    gameState.currentScreen = screenName;
    
    // Если показываем игровой экран, сразу показываем карточки объектов (пустые), затем загружаем данные
    if (screenName === 'game') {
        updateBuildings([]);
        loadGameState().catch(error => {
            console.error('Ошибка загрузки состояния игры:', error);
        });
        
        // Также обновляем видимость кнопки видео
        setTimeout(() => {
            updateVideoButtonVisibility();
        }, 500); // Небольшая задержка для загрузки данных
    }
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
        const response = await fetch(addGameCodeToUrl('/api/leaderboard'));
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка загрузки рейтинга:', data.error);
            return;
        }
        
        if (!data.leaderboard || data.leaderboard.length === 0) {
            console.error('Рейтинг пустой!');
            return;
        }
        
        const leaderboard = data.leaderboard;
        lastLeaderboardData = leaderboard.slice();
        const tbody = document.getElementById('final-leaderboard-body');
        if (!tbody) {
            console.error('Элемент final-leaderboard-body не найден!');
            return;
        }
        
        tbody.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            row.classList.add('leaderboard-row-clickable');
            row.setAttribute('data-player-index', String(index));
            
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
            
            const safePlayerName = escapeHtml(player.character_name || player.name || 'Игрок');
            row.innerHTML = `
                <td><strong style="color: #3a2a1a;">${index + 1}</strong></td>
                <td style="color: #3a2a1a;">${safePlayerName}</td>
                <td style="color: #3a2a1a;">${Math.round(player.total_value)} монет</td>
                <td class="${growthRoundClass}">${growthRoundSign}${Math.round(growthRound)}%</td>
                <td class="${growthGameClass}">${growthGameSign}${Math.round(growthGame)}%</td>
            `;
            
            row.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openPlayerModal(index);
            });
            
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
    const playerName = escapeHtml(player.character_name || player.name || 'Игрок');
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
        if (playerModalEl && playerModalEl.style.display === 'block') {
            return;
        }
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
    
    // Карточка игрока (турнирная таблица)
    playerModalEl = document.getElementById('player-modal');
    const playerModalClose = document.getElementById('player-modal-close');
    const playerModalNavLeft = document.getElementById('player-modal-nav-left');
    const playerModalNavRight = document.getElementById('player-modal-nav-right');
    if (playerModalClose) {
        playerModalClose.addEventListener('click', () => closePlayerModal());
    }
    if (playerModalNavLeft) {
        playerModalNavLeft.addEventListener('click', () => navigatePlayerModal(-1));
    }
    if (playerModalNavRight) {
        playerModalNavRight.addEventListener('click', () => navigatePlayerModal(1));
    }
    document.addEventListener('click', (event) => {
        if (playerModalEl && event.target === playerModalEl) {
            closePlayerModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (!playerModalEl || playerModalEl.style.display !== 'block') {
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            navigatePlayerModal(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            navigatePlayerModal(1);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closePlayerModal();
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
        let response = await fetch(addGameCodeToUrl(`/api/round/${roundNumber}/summary`));
        console.log(`Ответ от основного endpoint: status=${response.status}, ok=${response.ok}`);
        
        // Если основной не работает, пробуем альтернативный
        if (!response.ok) {
            console.log('Основной endpoint не работает, пробуем альтернативный...');
            response = await fetch(addGameCodeToUrl(`/api/round-summary/${roundNumber}`));
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
        
        // Сохраняем номер раунда для кнопки видео
        window.currentRoundNumber = roundNumber;
        
        // Загружаем контент раунда (видео) и обновляем видимость кнопок
        await loadRoundContentForCurrentRound();
        
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
                name.textContent = escapeHtml(resource.name.charAt(0).toUpperCase() + resource.name.slice(1));
                
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
                name.textContent = escapeHtml(building.name);
                
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
    
    // Закрытие модального окна видео по клику на фон
    const videoModal = document.getElementById('round-video-modal');
    if (videoModal) {
        videoModal.addEventListener('click', (e) => {
            if (e.target === videoModal) {
                closeRoundVideo();
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoModal.style.display === 'flex') {
                closeRoundVideo();
            }
        });
    }
});


// ========== ЗАГРУЗКА И ПОКАЗ ВИДЕО РАУНДА ==========

/**
 * Загрузить контент (видео) для раунда
 */
async function loadRoundContent(roundNumber) {
    try {
        const url = addGameCodeToUrl(`/api/round/${roundNumber}/content`);
        const response = await fetch(url);
        const data = response.ok ? await response.json() : null;
        if (response.ok) {
            if (data.success && data.content_url) {
                window.roundContent = data;
                console.log('Контент раунда загружен:', data);
                return data;
            } else {
                console.log('Контент для раунда не найден или не настроен');
                window.roundContent = null;
                return null;
            }
        } else {
            console.log('Контент для раунда не найден или не настроен');
            window.roundContent = null;
            return null;
        }
    } catch (error) {
        console.error('Ошибка загрузки контента раунда:', error);
        window.roundContent = null;
        return null;
    }
}

/**
 * Загрузить контент для текущего раунда и обновить видимость кнопки
 */
async function loadRoundContentForCurrentRound() {
    try {
        const currentRoundEl = document.getElementById('current-round');
        if (!currentRoundEl) {
            return;
        }
        
        const roundNumber = parseInt(currentRoundEl.textContent, 10);
        if (!roundNumber || roundNumber < 1 || roundNumber > 10) {
            return;
        }
        // Сохраняем номер раунда
        window.currentRoundNumber = roundNumber;
        
        // Загружаем контент
        const content = await loadRoundContent(roundNumber);
        
        // Обновляем видимость кнопки видео в header
        const videoButton = document.getElementById('show-round-video-header-btn');
        if (videoButton) {
            if (content && content.content_url) {
                videoButton.style.display = 'block';
            } else {
                videoButton.style.display = 'none';
            }
        }
        
        // Обновляем видимость кнопки в контейнере (если есть)
        const videoButtonContainer = document.getElementById('round-video-button-container');
        if (videoButtonContainer) {
            const hasContent = content && content.content_url;
            videoButtonContainer.style.display = hasContent ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Ошибка в loadRoundContentForCurrentRound:', error);
        // Скрываем кнопку при ошибке
        const videoButton = document.getElementById('show-round-video-header-btn');
        if (videoButton) {
            videoButton.style.display = 'none';
        }
    }
}

/**
 * Показать видео раунда в модальном окне
 */
function showRoundVideo() {
    const roundNumber = window.currentRoundNumber;
    const content = window.roundContent;
    if (roundNumber === undefined || roundNumber === null) {
        console.error('Номер раунда не установлен');
        return;
    }
    
    if (!content || !content.content_url) {
        alert('Видео для этого раунда не настроено');
        return;
    }
    const modal = document.getElementById('round-video-modal');
    const titleEl = document.getElementById('round-video-title');
    const containerEl = document.getElementById('round-video-container');
    if (!modal || !titleEl || !containerEl) {
        console.error('Элементы модального окна видео не найдены');
        return;
    }
    
    // Для интро и раундов просто показываем модалку поверх текущего экрана (z-index 3000 > 1000)
    // Не скрываем экран — модалка отображается поверх, как при «Показать видео раунда»
    
    // Устанавливаем заголовок (0 = интро)
    titleEl.textContent = roundNumber === 0 ? 'Интро' : `Видео раунда ${roundNumber}`;
    
    // Очищаем контейнер
    containerEl.innerHTML = '';
    
    // Определяем тип контента и создаем соответствующий элемент
    const contentUrl = content.content_url;
    const contentType = content.content_type || 'video';
    
    let videoElement;
    
    // Проверяем, является ли URL YouTube
    if (isYouTubeUrl(contentUrl)) {
        const videoId = extractYouTubeId(contentUrl);
        if (videoId) {
            videoElement = document.createElement('iframe');
            videoElement.src = `https://www.youtube.com/embed/${videoId}`;
            videoElement.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            videoElement.allowFullscreen = true;
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.minHeight = '400px';
            videoElement.style.border = 'none';
        } else {
            containerEl.innerHTML = '<p style="color: #d32f2f;">Ошибка: не удалось извлечь ID видео из YouTube URL</p>';
            modal.style.display = 'flex';
            return;
        }
    }
    // Проверяем, является ли URL Vimeo
    else if (isVimeoUrl(contentUrl)) {
        const videoId = extractVimeoId(contentUrl);
        if (videoId) {
            videoElement = document.createElement('iframe');
            videoElement.src = `https://player.vimeo.com/video/${videoId}`;
            videoElement.allow = 'autoplay; fullscreen; picture-in-picture';
            videoElement.allowFullscreen = true;
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.minHeight = '400px';
            videoElement.style.border = 'none';
        } else {
            containerEl.innerHTML = '<p style="color: #d32f2f;">Ошибка: не удалось извлечь ID видео из Vimeo URL</p>';
            modal.style.display = 'flex';
            return;
        }
    }
    // Проверяем, является ли URL RuTube
    else if (isRuTubeUrl(contentUrl)) {
        const rutube = extractRuTubeId(contentUrl);
        if (rutube && rutube.id) {
            videoElement = document.createElement('iframe');
            let embedSrc = `https://rutube.ru/play/embed/${rutube.id}`;
            if (rutube.privateKey) embedSrc += `?p=${encodeURIComponent(rutube.privateKey)}`;
            videoElement.src = embedSrc;
            videoElement.allow = 'autoplay; fullscreen; picture-in-picture';
            videoElement.allowFullscreen = true;
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.minHeight = '400px';
            videoElement.style.border = 'none';
        } else {
            containerEl.innerHTML = '<p style="color: #d32f2f;">Ошибка: не удалось извлечь ID видео из RuTube URL</p>';
            modal.style.display = 'flex';
            return;
        }
    }
    // Прямой URL видео (MP4, WebM и т.д.)
    else {
        videoElement = document.createElement('video');
        videoElement.src = contentUrl;
        videoElement.controls = true;
        videoElement.autoplay = false;
        videoElement.style.width = '100%';
        videoElement.style.maxHeight = '70vh';
    }
    if (!videoElement) {
        containerEl.innerHTML = '<p style="color: #d32f2f;">Не удалось создать плеер для этого URL</p>';
    } else {
        containerEl.appendChild(videoElement);
    }
    modal.style.display = 'flex';
}

/**
 * Закрыть модальное окно видео
 */
function closeRoundVideo() {
    const modal = document.getElementById('round-video-modal');
    const containerEl = document.getElementById('round-video-container');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Останавливаем и очищаем видео
    if (containerEl) {
        const video = containerEl.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
        }
        const iframe = containerEl.querySelector('iframe');
        if (iframe) {
            iframe.src = '';
        }
        containerEl.innerHTML = '';
    }
}

/**
 * Проверить, является ли URL YouTube
 */
function isYouTubeUrl(url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
}

/**
 * Извлечь ID видео из YouTube URL
 */
function extractYouTubeId(url) {
    if (!url) return null;
    
    // Формат: https://www.youtube.com/watch?v=VIDEO_ID
    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
    
    // Формат: https://youtu.be/VIDEO_ID
    match = url.match(/youtu\.be\/([^?&]+)/);
    if (match) return match[1];
    
    // Формат: https://www.youtube.com/embed/VIDEO_ID
    match = url.match(/embed\/([^?&]+)/);
    if (match) return match[1];
    
    return null;
}

/**
 * Проверить, является ли URL Vimeo
 */
function isVimeoUrl(url) {
    if (!url) return false;
    return url.includes('vimeo.com');
}

/**
 * Извлечь ID видео из Vimeo URL
 */
function extractVimeoId(url) {
    if (!url) return null;
    
    // Формат: https://vimeo.com/VIDEO_ID
    let match = url.match(/vimeo\.com\/(\d+)/);
    if (match) return match[1];
    
    // Формат: https://player.vimeo.com/video/VIDEO_ID
    match = url.match(/video\/(\d+)/);
    if (match) return match[1];
    
    return null;
}

/**
 * Проверить, является ли URL RuTube
 */
function isRuTubeUrl(url) {
    if (!url) return false;
    return url.includes('rutube.ru') || url.includes('rutube.com');
}

/**
 * Извлечь ID видео из RuTube URL (и опционально ключ ?p= для приватных)
 * Возвращает { id, privateKey } или null.
 */
function extractRuTubeId(url) {
    if (!url) return null;
    // Приватное видео: https://rutube.ru/video/private/HEX_ID/?p=ACCESS_KEY
    let match = url.match(/rutube\.(ru|com)\/video\/private\/([a-f0-9]+)/i);
    if (match) {
        const id = match[2];
        const pMatch = url.match(/[?&]p=([^&]+)/);
        return { id, privateKey: pMatch ? pMatch[1] : null };
    }
    // Формат: https://rutube.ru/play/embed/VIDEO_ID
    match = url.match(/rutube\.(ru|com)\/play\/embed\/([a-zA-Z0-9_-]+)/);
    if (match) return { id: match[2], privateKey: null };
    // Формат: https://rutube.ru/video/VIDEO_ID/ (публичное, не private)
    match = url.match(/rutube\.(ru|com)\/video\/(?!private\/)([a-zA-Z0-9_-]+)/);
    if (match) return { id: match[2], privateKey: null };
    return null;
}

/**
 * Показать события раунда из header (кнопка "События раунда")
 */
window.showRoundEventsFromHeader = function showRoundEventsFromHeader() {
    const currentRoundEl = document.getElementById('current-round');
    const roundNumber = currentRoundEl ? parseInt(currentRoundEl.textContent, 10) : 1;
    const r = (roundNumber >= 1 && roundNumber <= 10) ? roundNumber : 1;
    showRoundSummary(r);
};

/**
 * Показать видео раунда из header (кнопка в правом верхнем углу)
 */
// Экспорт функции для использования в onclick
window.showRoundVideoFromHeader = async function showRoundVideoFromHeader() {
    try {
        // Получаем текущий номер раунда
        const currentRoundEl = document.getElementById('current-round');
        if (!currentRoundEl) {
            console.error('Элемент current-round не найден');
            alert('Не удалось определить номер раунда');
            return;
        }
        
        const roundNumber = parseInt(currentRoundEl.textContent, 10);
        if (!roundNumber || roundNumber < 1 || roundNumber > 10) {
            alert('Некорректный номер раунда');
            return;
        }
        // Сохраняем номер раунда
        window.currentRoundNumber = roundNumber;
        
        // Загружаем контент раунда
        const content = await loadRoundContent(roundNumber);
        
        // Проверяем, есть ли контент
        if (!content || !content.content_url) {
            alert('Видео для этого раунда не настроено');
            return;
        }
        
        // Показываем видео
        showRoundVideo();
    } catch (error) {
        console.error('Ошибка при показе видео раунда:', error);
        alert('Ошибка при загрузке видео. Попробуйте позже.');
    }
}

/**
 * Обновить видимость кнопки видео в header
 */
async function updateVideoButtonVisibility() {
    try {
        const videoButton = document.getElementById('show-round-video-header-btn');
        if (!videoButton) return;
        
        // Получаем текущий номер раунда
        const currentRoundEl = document.getElementById('current-round');
        if (!currentRoundEl) {
            videoButton.style.display = 'none';
            return;
        }
        
        const roundNumber = parseInt(currentRoundEl.textContent, 10);
        if (!roundNumber || roundNumber < 1 || roundNumber > 10) {
            videoButton.style.display = 'none';
            return;
        }
        
        // Если контент еще не загружен или раунд изменился, загружаем его
        if (!window.roundContent || window.currentRoundNumber !== roundNumber) {
            await loadRoundContent(roundNumber);
        }
        
        // Показываем кнопку, если есть контент
        const content = window.roundContent;
        if (content && content.content_url) {
            videoButton.style.display = 'block';
        } else {
            videoButton.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка в updateVideoButtonVisibility:', error);
        // Скрываем кнопку при ошибке
        const videoButton = document.getElementById('show-round-video-header-btn');
        if (videoButton) {
            videoButton.style.display = 'none';
        }
    }
}