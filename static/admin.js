// Админ-панель JavaScript

let currentGameId = null;
let currentGameCode = null;
let adminToken = null;

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

// ========== АВТОРИЗАЦИЯ ==========

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            adminToken = data.token;
            localStorage.setItem('admin_token', adminToken);
            
            // Загружаем API ключ ImgBB после успешной авторизации
            getImgbbApiKey().catch(err => {
                console.warn('API ключ ImgBB не настроен. Загрузка изображений будет недоступна.');
            });
            
            showAdminPanel();
        } else {
            errorDiv.textContent = data.error || 'Неверный пароль';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка подключения к серверу';
        errorDiv.style.display = 'block';
    }
});

// Проверка сохраненного токена при загрузке
window.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
        adminToken = savedToken;
        // Проверяем токен
        checkAdminAuth();
    }
});

async function checkAdminAuth() {
    try {
        const response = await fetch('/api/admin/check', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.ok) {
            showAdminPanel();
        } else {
            localStorage.removeItem('admin_token');
            adminToken = null;
        }
    } catch (error) {
        localStorage.removeItem('admin_token');
        adminToken = null;
    }
}

function showAdminPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadActiveGames();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    adminToken = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
});

// ========== НАВИГАЦИЯ ==========

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const section = item.dataset.section;
        
        // Обновляем активное состояние
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Показываем нужную секцию
        document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`section-${section}`).classList.add('active');
        
        // Загружаем данные для секции
        if (section === 'games') {
            loadActiveGames();
        } else if (section === 'archive') {
            loadArchiveGames();
        } else if (section === 'settings') {
            loadGamesForSettings();
        }
    });
});

// ========== УПРАВЛЕНИЕ ИГРАМИ ==========

async function loadActiveGames() {
    const gamesList = document.getElementById('games-list');
    gamesList.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch('/api/admin/games/active', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки игр');
        
        const data = await response.json();
        const games = data.games || [];
        
        if (games.length === 0) {
            gamesList.innerHTML = '<div class="loading">Нет активных игр</div>';
            return;
        }
        
        gamesList.innerHTML = games.map(game => {
            const safeGameCode = escapeHtml(game.game_code || '');
            const safeGameId = game.id || 0;
            return `
            <div class="game-card" onclick="openGameModal('${safeGameCode}', ${safeGameId})">
                <div class="game-card-header">
                    <span class="game-code">${safeGameCode}</span>
                    <span class="game-status active">Активна</span>
                </div>
                <div class="game-info">
                    <div class="game-info-item">
                        <span class="game-info-label">Раунд:</span>
                        <span class="game-info-value">${game.current_round || 1}</span>
                    </div>
                    <div class="game-info-item">
                        <span class="game-info-label">Игроков:</span>
                        <span class="game-info-value">${game.num_players || 0}</span>
                    </div>
                    <div class="game-info-item">
                        <span class="game-info-label">Создана:</span>
                        <span class="game-info-value">${game.created_at ? new Date(game.created_at).toLocaleDateString('ru-RU') : '-'}</span>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки активных игр:', error);
        gamesList.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

async function loadArchiveGames() {
    const archiveList = document.getElementById('archive-list');
    archiveList.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch('/api/admin/games/archived', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки архива');
        
        const data = await response.json();
        const games = data.games || [];
        
        if (games.length === 0) {
            archiveList.innerHTML = '<div class="loading">Архив пуст</div>';
            return;
        }
        
        archiveList.innerHTML = games.map(game => {
            const safeGameCode = escapeHtml(game.game_code || '');
            const safeGameId = game.id || 0;
            const archiveDate = game.archived_at || game.updated_at;
            return `
            <div class="game-card" onclick="openGameModal('${safeGameCode}', ${safeGameId})">
                <div class="game-card-header">
                    <span class="game-code">${safeGameCode}</span>
                    <span class="game-status archived">Архив</span>
                </div>
                <div class="game-info">
                    <div class="game-info-item">
                        <span class="game-info-label">Раунд:</span>
                        <span class="game-info-value">${game.current_round || 1}</span>
                    </div>
                    <div class="game-info-item">
                        <span class="game-info-label">Игроков:</span>
                        <span class="game-info-value">${game.num_players || 0}</span>
                    </div>
                    <div class="game-info-item">
                        <span class="game-info-label">Завершена:</span>
                        <span class="game-info-value">${archiveDate ? new Date(archiveDate).toLocaleDateString('ru-RU') : '-'}</span>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки архива игр:', error);
        archiveList.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

// ========== СОЗДАНИЕ ИГРЫ ==========

document.getElementById('create-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const numPlayersInput = document.getElementById('game-num-players');
    const numPlayers = parseInt(numPlayersInput.value);
    const companyName = document.getElementById('game-company-name').value || null;
    const errorDiv = document.getElementById('create-game-error');
    const successDiv = document.getElementById('create-game-success');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    // Валидация на клиенте
    if (isNaN(numPlayers) || numPlayers < 5 || numPlayers > 30) {
        errorDiv.textContent = 'Количество игроков должно быть от 5 до 30';
        errorDiv.style.display = 'block';
        numPlayersInput.focus();
        return;
    }
    
    try {
        const response = await fetch('/api/admin/games/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                num_players: numPlayers,
                company_name: companyName
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.textContent = `Игра создана! Код: ${data.game_code}`;
            successDiv.style.display = 'block';
            document.getElementById('create-game-form').reset();
            document.getElementById('game-num-players').value = 10;
            loadActiveGames();
        } else {
            errorDiv.textContent = data.error || 'Ошибка создания игры';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = `Ошибка подключения к серверу: ${error.message}`;
        errorDiv.style.display = 'block';
        console.error('Ошибка создания игры:', error);
    }
});

// ========== МОДАЛЬНОЕ ОКНО ИГРЫ ==========

function openGameModal(gameCode, gameId) {
    currentGameCode = gameCode;
    currentGameId = gameId;
    
    document.getElementById('game-modal').style.display = 'flex';
    loadGameInfo();
    loadGamePlayers();
    loadRoundContent();
    loadRoundEvents();
    
    // Активируем первую вкладку
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="info"]').classList.add('active');
    document.getElementById('tab-info').classList.add('active');
}

function closeGameModal() {
    document.getElementById('game-modal').style.display = 'none';
    currentGameId = null;
    currentGameCode = null;
}

// Вкладки в модальном окне
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        // Загружаем данные для вкладки
        if (tab === 'players') {
            loadGamePlayers();
        } else if (tab === 'content') {
            loadRoundContent();
        } else if (tab === 'events') {
            loadRoundEvents();
        } else if (tab === 'rounds') {
            loadRoundSettings();
        } else if (tab === 'game-config') {
            loadGameConfig();
        }
    });
});

async function loadGameInfo() {
    if (!currentGameCode) {
        console.error('currentGameCode не установлен');
        return;
    }
    
    const modalGameCode = document.getElementById('modal-game-code');
    const modalGameId = document.getElementById('modal-game-id');
    const modalGameRound = document.getElementById('modal-game-round');
    const modalGamePlayersCount = document.getElementById('modal-game-players-count');
    const modalGameStatus = document.getElementById('modal-game-status');
    const archiveBtn = document.getElementById('archive-game-btn');
    
    if (!modalGameCode || !modalGameId || !modalGameRound || !modalGamePlayersCount || !modalGameStatus) {
        console.error('Не найдены элементы DOM для отображения информации об игре');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка загрузки информации (${response.status})`);
        }
        
        const data = await response.json();
        // Обрабатываем оба формата: {success: true, game: {...}} или прямой объект
        const game = data.game || data;
        
        modalGameCode.textContent = game.game_code || '-';
        modalGameId.textContent = game.game_id || game.id || '-';
        modalGameRound.textContent = game.current_round || 1;
        modalGamePlayersCount.textContent = game.num_players || 0;
        modalGameStatus.textContent = game.status === 'archived' ? 'Архив' : 'Активна';
        
        // Показываем/скрываем кнопку архивирования
        if (archiveBtn) {
            if (game.status === 'archived') {
                archiveBtn.style.display = 'none';
            } else {
                archiveBtn.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки информации об игре:', error);
        if (modalGameCode) {
            modalGameCode.textContent = 'Ошибка';
        }
        if (modalGameStatus) {
            modalGameStatus.textContent = 'Ошибка загрузки';
            modalGameStatus.style.color = '#d32f2f';
        }
    }
}

/** Загружает список персонажей игры (каталог для экрана выбора). Не путать с участниками игры (players). */
async function loadGamePlayers() {
    if (!currentGameCode) {
        console.error('currentGameCode не установлен');
        return;
    }
    
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/characters`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) throw new Error('Ошибка загрузки персонажей');
        
        const data = await response.json();
        const characters = data.characters || [];
        
        if (characters.length === 0) {
            playersList.innerHTML = '<div class="loading">Нет персонажей. Добавьте персонажей — они появятся на экране выбора в игре.</div>';
            return;
        }
        
        playersList.innerHTML = characters.map(char => {
            const name = char.name || char.character_name || 'Без имени';
            const safeName = escapeHtml(name);
            const safeNameForOnclick = safeName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const avatarUrl = (char.image || char.character_image || '').trim() || '/static/images/logo.png';
            const safeAvatarUrl = escapeHtml(avatarUrl);
            
            return `
            <div class="player-card" onclick="editCharacter('${safeNameForOnclick}')" data-character-name="${safeName}">
                <img src="${safeAvatarUrl}" 
                     alt="${safeName}" 
                     class="player-avatar"
                     onerror="this.onerror=null; this.src='/static/images/logo.png'">
                <div class="player-info">
                    <div class="player-name">${safeName}</div>
                    <div class="player-id">Персонаж для выбора</div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteCharacter('${safeNameForOnclick}')" title="Удалить персонажа">Удалить</button>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки персонажей:', error);
        playersList.innerHTML = `<div class="error-message">Ошибка загрузки персонажей: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

async function loadRoundContent() {
    if (!currentGameCode) {
        console.error('currentGameCode не установлен');
        return;
    }
    
    const contentList = document.getElementById('round-content-list');
    contentList.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-content`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка загрузки контента (${response.status})`);
        }
        
        const data = await response.json();
        const rounds = data.content || data.rounds || [];
        
        // Создаем карту существующих раундов (включая интро — round_number 0)
        const roundsMap = {};
        rounds.forEach(round => {
            roundsMap[round.round_number] = round;
        });
        
        const introRound = roundsMap[0];
        const introUrl = introRound ? (introRound.content_url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
        const introBlock = `
            <div class="round-content-item">
                <div class="round-content-header">
                    <span class="round-number">Интро</span>
                </div>
                <form class="round-content-form" onsubmit="saveRoundContent(event, 0)">
                    <div class="form-group">
                        <label>URL видео или ссылка на контент:</label>
                        <input type="url" class="form-input" 
                               id="round-0-content" 
                               value="${introUrl}"
                               placeholder="https://example.com/intro.mp4 или ссылка на YouTube/RuTube">
                    </div>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </form>
            </div>
        `;
        
        const roundsBlocks = Array.from({length: 10}, (_, i) => {
            const roundNum = i + 1;
            const round = roundsMap[roundNum];
            const contentUrl = round ? (round.content_url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
            return `
                <div class="round-content-item">
                    <div class="round-content-header">
                        <span class="round-number">Раунд ${roundNum}</span>
                    </div>
                    <form class="round-content-form" onsubmit="saveRoundContent(event, ${roundNum})">
                        <div class="form-group">
                            <label>URL видео или ссылка на контент:</label>
                            <input type="url" class="form-input" 
                                   id="round-${roundNum}-content" 
                                   value="${contentUrl}"
                                   placeholder="https://example.com/video.mp4 или /static/videos/round-${roundNum}.mp4">
                        </div>
                        <button type="submit" class="btn btn-primary">Сохранить</button>
                    </form>
                </div>
            `;
        }).join('');
        
        contentList.innerHTML = introBlock + roundsBlocks;
    } catch (error) {
        console.error('Ошибка загрузки контента раундов:', error);
        contentList.innerHTML = `<div class="error-message">Ошибка загрузки контента: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

async function loadRoundEvents() {
    if (!currentGameCode) {
        console.error('currentGameCode не установлен');
        return;
    }
    const listEl = document.getElementById('round-events-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Загрузка...</div>';
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-events`, {
            headers: { 'Authorization': `Bearer ${adminToken}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка загрузки (${response.status})`);
        }
        const data = await response.json();
        const rows = data.events || [];
        const map = {};
        rows.forEach((row) => {
            map[row.round_number] = row;
        });
        listEl.innerHTML = Array.from({ length: 10 }, (_, i) => {
            const roundNum = i + 1;
            const row = map[roundNum] || {};
            const rawText = row.event_text != null ? String(row.event_text) : '';
            const safeText = escapeHtml(rawText);
            const rawUrl = row.image_url != null ? String(row.image_url) : '';
            const safeUrlAttr = rawUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const previewSrc = rawUrl ? escapeHtml(rawUrl.trim()) : '';
            const previewHtml = previewSrc
                ? `<div class="round-event-preview" id="event-r-${roundNum}-preview"><img src="${previewSrc}" alt="" class="round-event-preview-img" onerror="this.parentNode.innerHTML=''"></div>`
                : `<div class="round-event-preview" id="event-r-${roundNum}-preview"></div>`;
            return `
            <div class="round-content-item">
                <div class="round-content-header">
                    <span class="round-number">Раунд ${roundNum}</span>
                </div>
                <form class="round-content-form" onsubmit="saveRoundEvent(event, ${roundNum})">
                    <div class="form-group">
                        <label>Текст события:</label>
                        <textarea class="form-input round-event-textarea" id="event-r-${roundNum}-text" rows="4" placeholder="Описание события для этого раунда">${safeText}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Картинка (URL):</label>
                        <input type="url" class="form-input" id="event-r-${roundNum}-image" value="${safeUrlAttr}"
                               placeholder="https://... или загрузите файл ниже"
                               oninput="updateRoundEventPreview(${roundNum})">
                    </div>
                    <div class="form-group round-event-upload-row">
                        <input type="file" id="event-r-${roundNum}-file" accept="image/*" style="display:none"
                               onchange="onRoundEventImageChosen(${roundNum}, this)">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('event-r-${roundNum}-file').click()">Загрузить картинку</button>
                        <span class="round-event-upload-status" id="event-r-${roundNum}-upload-status"></span>
                    </div>
                    ${previewHtml}
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </form>
            </div>`;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки событий раундов:', error);
        listEl.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

function updateRoundEventPreview(roundNum) {
    const imgInput = document.getElementById(`event-r-${roundNum}-image`);
    const box = document.getElementById(`event-r-${roundNum}-preview`);
    if (!box || !imgInput) return;
    const url = (imgInput.value || '').trim();
    if (!url) {
        box.innerHTML = '';
        return;
    }
    const safe = escapeHtml(url);
    box.innerHTML = `<img src="${safe}" alt="" class="round-event-preview-img" onerror="this.style.display='none'">`;
}

async function onRoundEventImageChosen(roundNum, fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const status = document.getElementById(`event-r-${roundNum}-upload-status`);
    if (status) status.textContent = 'Загрузка...';
    try {
        const url = await uploadImageToImgBB(file);
        const imgField = document.getElementById(`event-r-${roundNum}-image`);
        if (imgField) imgField.value = url;
        if (status) status.textContent = 'Готово';
        updateRoundEventPreview(roundNum);
    } catch (error) {
        console.error('Ошибка загрузки картинки события:', error);
        if (status) status.textContent = '';
        alert(error.message || 'Ошибка загрузки изображения');
    }
    fileInput.value = '';
}

async function saveRoundEvent(event, roundNumber) {
    event.preventDefault();
    const textEl = document.getElementById(`event-r-${roundNumber}-text`);
    const imgEl = document.getElementById(`event-r-${roundNumber}-image`);
    const event_text = textEl ? textEl.value : '';
    const image_url = imgEl ? (imgEl.value || '').trim() : '';
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-events/${roundNumber}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ event_text, image_url }),
        });
        if (response.ok) {
            alert('Событие сохранено!');
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(errorData.error || 'Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка сохранения события:', error);
        alert(`Ошибка подключения: ${error.message || 'Неизвестная ошибка'}`);
    }
}

async function saveRoundContent(event, roundNumber) {
    event.preventDefault();
    const contentUrl = document.getElementById(`round-${roundNumber}-content`).value;
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-content/${roundNumber}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ 
                content_url: contentUrl,
                content_type: 'video'  // По умолчанию видео
            })
        });
        
        if (response.ok) {
            alert('Контент сохранен!');
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(errorData.error || 'Ошибка сохранения контента');
        }
    } catch (error) {
        console.error('Ошибка сохранения контента:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
}

async function loadRoundSettings() {
    if (!currentGameCode) {
        console.error('currentGameCode не установлен');
        return;
    }
    
    const settingsDiv = document.getElementById('rounds-settings');
    settingsDiv.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-settings`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка загрузки настроек (${response.status})`);
        }
        
        const data = await response.json();
        const settings = data.settings || [];
        
        // Создаем карту существующих настроек
        const settingsMap = {};
        settings.forEach(setting => {
            settingsMap[setting.round_number] = setting;
        });
        
        // Получаем список ресурсов и объектов из конфига
        const resources = ['камень', 'дерево', 'железо', 'скот', 'овощи', 'рабы', 'золото', 'зерно', 'рыба'];
        const buildings = ['Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир', 'Посевные поля', 'Рыболовня', 
                          'Кузнечная', 'Ферма', 'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'];
        
        // Создаем форму для всех 10 раундов
        settingsDiv.innerHTML = Array.from({length: 10}, (_, i) => {
            const roundNum = i + 1;
            const setting = settingsMap[roundNum] || {};
            const resourceMods = setting.resource_modifiers || {};
            const buildingMods = setting.building_modifiers || {};
            
            return `
                <div class="round-content-item">
                    <div class="round-content-header">
                        <span class="round-number">Раунд ${roundNum}</span>
                    </div>
                    <form class="round-content-form" onsubmit="saveRoundSettings(event, ${roundNum})">
                        <h4 style="color: #d4af37; margin-bottom: 15px;">Коэффициенты ресурсов:</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px;">
                            ${resources.map(resource => `
                                <div class="form-group" style="margin-bottom: 10px;">
                                    <label style="font-size: 0.9em;">${resource}:</label>
                                    <input type="number" step="0.01" class="form-input" 
                                           id="round-${roundNum}-resource-${resource}" 
                                           value="${resourceMods[resource] || 1.0}"
                                           placeholder="1.0" style="font-size: 0.9em;">
                                </div>
                            `).join('')}
                        </div>
                        <h4 style="color: #d4af37; margin-bottom: 15px;">Коэффициенты объектов:</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px;">
                            ${buildings.map(building => `
                                <div class="form-group" style="margin-bottom: 10px;">
                                    <label style="font-size: 0.9em;">${building}:</label>
                                    <input type="number" step="0.01" class="form-input" 
                                           id="round-${roundNum}-building-${building}" 
                                           value="${buildingMods[building] || 1.0}"
                                           placeholder="1.0" style="font-size: 0.9em;">
                                </div>
                            `).join('')}
                        </div>
                        <button type="submit" class="btn btn-primary">Сохранить настройки</button>
                    </form>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки настроек раундов:', error);
        settingsDiv.innerHTML = `<div class="error-message">Ошибка загрузки настроек: ${error.message || 'Неизвестная ошибка'}</div>`;
    }
}

async function saveRoundSettings(event, roundNumber) {
    event.preventDefault();
    
    const resources = ['камень', 'дерево', 'железо', 'скот', 'овощи', 'рабы', 'золото', 'зерно', 'рыба'];
    const buildings = ['Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир', 'Посевные поля', 'Рыболовня', 
                      'Кузнечная', 'Ферма', 'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'];
    
    const resourceModifiers = {};
    resources.forEach(resource => {
        const input = document.getElementById(`round-${roundNumber}-resource-${resource}`);
        if (input && input.value) {
            resourceModifiers[resource] = parseFloat(input.value) || 1.0;
        }
    });
    
    const buildingModifiers = {};
    buildings.forEach(building => {
        const input = document.getElementById(`round-${roundNumber}-building-${building}`);
        if (input && input.value) {
            buildingModifiers[building] = parseFloat(input.value) || 1.0;
        }
    });
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/round-settings/${roundNumber}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                resource_modifiers: resourceModifiers,
                building_modifiers: buildingModifiers
            })
        });
        
        if (response.ok) {
            alert('Настройки сохранены!');
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(errorData.error || 'Ошибка сохранения настроек');
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек раунда:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
}

async function saveAllGameSettings() {
    if (!currentGameCode) {
        alert('Ошибка: код игры не установлен');
        return;
    }
    const adminToken = localStorage.getItem('admin_token');
    if (!adminToken) {
        alert('Нужна авторизация');
        return;
    }
    const statusEl = document.getElementById('save-all-settings-btn');
    const origText = statusEl?.textContent || 'Сохранить все настройки';
    if (statusEl) {
        statusEl.disabled = true;
        statusEl.textContent = 'Сохранение...';
    }
    let saved = 0;
    let errors = [];
    try {
        // Сохраняем контент: интро (0) и раунды 1..10
        for (let roundNum = 0; roundNum <= 10; roundNum++) {
            const input = document.getElementById(`round-${roundNum}-content`);
            if (!input) continue;
            const contentUrl = (input.value || '').trim();
            if (!contentUrl) continue; // не отправляем пустой URL — API возвращает 400
            const label = roundNum === 0 ? 'Интро' : `Раунд ${roundNum}`;
            try {
                const res = await fetch(`/api/admin/games/${currentGameCode}/round-content/${roundNum}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ content_url: contentUrl, content_type: 'video' })
                });
                if (res.ok) saved++; else errors.push(`${label} контент: ${(await res.json().catch(() => ({}))).error || res.status}`);
            } catch (e) {
                errors.push(`${label} контент: ${e.message}`);
            }
        }
        // Сохраняем настройки раундов (коэффициенты), если форма есть в DOM
        const resources = ['камень', 'дерево', 'железо', 'скот', 'овощи', 'рабы', 'золото', 'зерно', 'рыба'];
        const buildings = ['Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир', 'Посевные поля', 'Рыболовня',
            'Кузнечная', 'Ферма', 'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'];
        for (let roundNum = 1; roundNum <= 10; roundNum++) {
            const resourceInput = document.getElementById(`round-${roundNum}-resource-камень`);
            if (!resourceInput) continue;
            const resourceModifiers = {};
            resources.forEach(resource => {
                const input = document.getElementById(`round-${roundNum}-resource-${resource}`);
                if (input && input.value) resourceModifiers[resource] = parseFloat(input.value) || 1.0;
            });
            const buildingModifiers = {};
            buildings.forEach(building => {
                const input = document.getElementById(`round-${roundNum}-building-${building}`);
                if (input && input.value) buildingModifiers[building] = parseFloat(input.value) || 1.0;
            });
            try {
                const res = await fetch(`/api/admin/games/${currentGameCode}/round-settings/${roundNum}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ resource_modifiers: resourceModifiers, building_modifiers: buildingModifiers })
                });
                if (res.ok) saved++; else errors.push(`Раунд ${roundNum} настройки: ${(await res.json().catch(() => ({}))).error || res.status}`);
            } catch (e) {
                errors.push(`Раунд ${roundNum} настройки: ${e.message}`);
            }
        }
        // События раундов (текст + картинка), если форма была отрисована
        for (let roundNum = 1; roundNum <= 10; roundNum++) {
            const textEl = document.getElementById(`event-r-${roundNum}-text`);
            if (!textEl) continue;
            const imgEl = document.getElementById(`event-r-${roundNum}-image`);
            const event_text = textEl.value;
            const image_url = imgEl ? (imgEl.value || '').trim() : '';
            try {
                const res = await fetch(`/api/admin/games/${currentGameCode}/round-events/${roundNum}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`,
                    },
                    body: JSON.stringify({ event_text, image_url }),
                });
                if (res.ok) saved++;
                else errors.push(`Раунд ${roundNum} событие: ${(await res.json().catch(() => ({}))).error || res.status}`);
            } catch (e) {
                errors.push(`Раунд ${roundNum} событие: ${e.message}`);
            }
        }
        if (errors.length > 0) {
            alert('Сохранено частями. Ошибки:\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n...' : ''));
        } else {
            alert('Все настройки сохранены!');
        }
    } finally {
        if (statusEl) {
            statusEl.disabled = false;
            statusEl.textContent = origText;
        }
    }
}

document.getElementById('save-all-settings-btn')?.addEventListener('click', () => {
    saveAllGameSettings();
});

// ========== АРХИВИРОВАНИЕ ИГРЫ ==========

document.getElementById('archive-game-btn').addEventListener('click', async () => {
    if (!currentGameCode) {
        alert('Ошибка: код игры не установлен');
        return;
    }
    
    if (!confirm('Вы уверены, что хотите завершить игру и переместить её в архив?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/archive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        const data = await response.json().catch(() => ({}));
        
        if (response.ok) {
            alert(data.message || 'Игра перемещена в архив');
            closeGameModal();
            loadActiveGames();
            loadArchiveGames();
        } else {
            console.error('Ошибка архивирования:', data);
            alert(data.error || 'Ошибка архивирования игры');
        }
    } catch (error) {
        console.error('Ошибка архивирования игры:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
});

// ========== РЕДАКТИРОВАНИЕ ПЕРСОНАЖА (каталог для выбора) ==========

/** Открыть модалку редактирования персонажа по имени (из списка персонажей). */
async function editCharacter(characterName) {
    if (!currentGameCode) {
        alert('Ошибка: код игры не установлен');
        return;
    }
    const decoded = typeof characterName === 'string' ? characterName.replace(/\\'/g, "'").replace(/&quot;/g, '"') : characterName;
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/characters`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!response.ok) throw new Error('Ошибка загрузки персонажей');
        const data = await response.json();
        const characters = data.characters || [];
        const char = characters.find(c => (c.name || c.character_name) === decoded);
        if (!char) {
            alert('Персонаж не найден');
            return;
        }
        const name = char.name || char.character_name || '';
        const image = char.image || char.character_image || '';
        document.getElementById('edit-character-original-name').value = name;
        document.getElementById('edit-player-character-name').value = name;
        document.getElementById('edit-player-avatar').value = image;
        const preview = document.getElementById('edit-player-avatar-preview');
        if (preview) {
            preview.src = image || '';
            preview.style.display = image ? 'block' : 'none';
        }
        document.getElementById('edit-player-modal').style.display = 'flex';
    } catch (error) {
        console.error('Ошибка загрузки персонажа:', error);
        alert(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
}

/** Редактирование игрока по player_id (для обратной совместимости). */
async function editPlayer(playerId) {
    if (!currentGameCode) {
        alert('Ошибка: код игры не установлен');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/players`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки данных игрока');
        }
        
        const data = await response.json();
        const players = data.players || [];
        const player = players.find(p => String(p.player_id) === String(playerId));
        
        if (!player) {
            alert('Игрок не найден');
            return;
        }
        
        document.getElementById('edit-character-original-name').value = '';
        document.getElementById('edit-player-id').value = playerId;
        document.getElementById('edit-player-name').value = player.name || '';
        document.getElementById('edit-player-character-name').value = player.character_name || '';
        document.getElementById('edit-player-avatar').value = player.character_image || '';
        
        const preview = document.getElementById('edit-player-avatar-preview');
        if (preview && player.character_image) {
            preview.src = player.character_image;
            preview.style.display = 'block';
        }
        
        document.getElementById('edit-player-modal').style.display = 'flex';
    } catch (error) {
        console.error('Ошибка загрузки данных игрока:', error);
        alert(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
}

function closeEditPlayerModal() {
    document.getElementById('edit-player-modal').style.display = 'none';
    document.getElementById('edit-player-form').reset();
    const orig = document.getElementById('edit-character-original-name');
    if (orig) orig.value = '';
    
    const preview = document.getElementById('edit-player-avatar-preview');
    if (preview) {
        preview.style.display = 'none';
        preview.src = '';
    }
    const statusDiv = document.getElementById('edit-player-avatar-upload-status');
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
    }
    const fileInput = document.getElementById('edit-player-avatar-file');
    if (fileInput) fileInput.value = '';
}

// Обработчик загрузки изображения для редактирования игрока
document.getElementById('edit-player-avatar-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const urlInput = document.getElementById('edit-player-avatar');
    const statusDiv = document.getElementById('edit-player-avatar-upload-status');
    const preview = document.getElementById('edit-player-avatar-preview');
    
    if (!urlInput || !statusDiv) return;
    
    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
        statusDiv.textContent = '❌ Выберите изображение';
        statusDiv.style.color = '#d32f2f';
        statusDiv.style.display = 'block';
        return;
    }
    
    // Проверяем размер (макс 5 МБ)
    if (file.size > 5 * 1024 * 1024) {
        statusDiv.textContent = '❌ Размер файла не должен превышать 5 МБ';
        statusDiv.style.color = '#d32f2f';
        statusDiv.style.display = 'block';
        return;
    }
    
    urlInput.disabled = true;
    statusDiv.style.display = 'block';
    statusDiv.textContent = '⏳ Загрузка...';
    statusDiv.style.color = '#666';
    
    try {
        const imageUrl = await uploadImageToImgBB(file);
        urlInput.value = imageUrl;
        
        // Показываем успех
        statusDiv.textContent = '✅ Изображение загружено успешно';
        statusDiv.style.color = '#4caf50';
        
        // Показываем превью
        if (preview) {
            preview.src = imageUrl;
            preview.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        statusDiv.textContent = `❌ Ошибка: ${error.message}`;
        statusDiv.style.color = '#d32f2f';
        urlInput.disabled = false;
    }
});

// Обработчик формы редактирования (персонаж или игрок)
document.getElementById('edit-player-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const originalCharacterName = document.getElementById('edit-character-original-name').value.trim();
    const playerId = document.getElementById('edit-player-id').value.trim();
    const name = document.getElementById('edit-player-name').value.trim();
    const characterName = document.getElementById('edit-player-character-name').value.trim();
    const avatar = document.getElementById('edit-player-avatar').value.trim();
    const errorDiv = document.getElementById('edit-player-error');
    
    errorDiv.style.display = 'none';
    
    // Редактирование персонажа (каталог для выбора)
    if (originalCharacterName) {
        if (!characterName || !avatar) {
            errorDiv.textContent = 'Заполните имя персонажа и URL изображения';
            errorDiv.style.display = 'block';
            return;
        }
        try {
            if (characterName !== originalCharacterName) {
                const delRes = await fetch(`/api/admin/games/${currentGameCode}/characters/${encodeURIComponent(originalCharacterName)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${adminToken}` }
                });
                if (!delRes.ok) {
                    const d = await delRes.json().catch(() => ({}));
                    throw new Error(d.error || 'Не удалось удалить старую запись персонажа');
                }
            }
            const response = await fetch(`/api/admin/games/${currentGameCode}/characters`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    character_name: characterName,
                    character_image: avatar
                })
            });
            const data = await response.json();
            if (response.ok) {
                closeEditPlayerModal();
                loadGamePlayers();
            } else {
                errorDiv.textContent = data.error || 'Ошибка сохранения персонажа';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Ошибка сохранения персонажа:', error);
            errorDiv.textContent = error.message || 'Ошибка подключения к серверу';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    // Редактирование игрока (участника игры)
    if (!playerId || !name || !characterName || !avatar) {
        errorDiv.textContent = 'Заполните все поля';
        errorDiv.style.display = 'block';
        return;
    }
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/players/${playerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                name: name,
                character_name: characterName,
                character_image: avatar
            })
        });
        const data = await response.json();
        if (response.ok) {
            closeEditPlayerModal();
            loadGamePlayers();
        } else {
            errorDiv.textContent = data.error || 'Ошибка обновления игрока';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка обновления игрока:', error);
        errorDiv.textContent = `Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`;
        errorDiv.style.display = 'block';
    }
});

// ========== ДОБАВЛЕНИЕ ИГРОКА ==========

document.getElementById('add-player-btn').addEventListener('click', () => {
    document.getElementById('add-player-modal').style.display = 'flex';
});

function closeAddPlayerModal() {
    document.getElementById('add-player-modal').style.display = 'none';
    document.getElementById('add-player-form').reset();
    
    // Очищаем превью изображения
    const preview = document.getElementById('player-avatar-preview');
    if (preview) {
        preview.style.display = 'none';
        preview.src = '';
    }
    
    // Очищаем статус загрузки
    const statusDiv = document.getElementById('player-avatar-upload-status');
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
    }
    
    // Очищаем файл
    const fileInput = document.getElementById('player-avatar-file');
    if (fileInput) {
        fileInput.value = '';
    }
}

// Обработчик загрузки изображения для игрока
document.getElementById('player-avatar-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const urlInput = document.getElementById('player-avatar');
    const statusDiv = document.getElementById('player-avatar-upload-status');
    const preview = document.getElementById('player-avatar-preview');
    
    if (!urlInput || !statusDiv) return;
    
    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
        statusDiv.textContent = '❌ Выберите изображение';
        statusDiv.style.color = '#d32f2f';
        statusDiv.style.display = 'block';
        return;
    }
    
    // Проверяем размер (макс 5 МБ)
    if (file.size > 5 * 1024 * 1024) {
        statusDiv.textContent = '❌ Размер файла не должен превышать 5 МБ';
        statusDiv.style.color = '#d32f2f';
        statusDiv.style.display = 'block';
        return;
    }
    
    urlInput.disabled = true;
    statusDiv.style.display = 'block';
    statusDiv.textContent = '⏳ Загрузка...';
    statusDiv.style.color = '#666';
    
    try {
        const imageUrl = await uploadImageToImgBB(file);
        urlInput.value = imageUrl;
        
        // Показываем успех
        statusDiv.textContent = '✅ Изображение загружено успешно';
        statusDiv.style.color = '#4caf50';
        
        // Показываем превью
        if (preview) {
            preview.src = imageUrl;
            preview.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        statusDiv.textContent = `❌ Ошибка: ${error.message}`;
        statusDiv.style.color = '#d32f2f';
        urlInput.disabled = false;
    }
});

document.getElementById('add-player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const characterName = document.getElementById('player-character-name').value.trim();
    const avatar = document.getElementById('player-avatar').value.trim();
    const errorDiv = document.getElementById('add-player-error');
    
    errorDiv.style.display = 'none';
    
    if (!characterName || !avatar) {
        errorDiv.textContent = 'Заполните имя персонажа и URL изображения';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        // Добавляем только в каталог персонажей (экран выбора). В игру участник попадёт только после выбора персонажа.
        const response = await fetch(`/api/admin/games/${currentGameCode}/characters`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                character_name: characterName,
                character_image: avatar
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeAddPlayerModal();
            loadGamePlayers();
        } else {
            errorDiv.textContent = data.error || 'Ошибка добавления персонажа';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка добавления персонажа:', error);
        errorDiv.textContent = `Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`;
        errorDiv.style.display = 'block';
    }
});

// ========== ЗАГРУЗКА ИГР ДЛЯ НАСТРОЕК ==========

async function loadGamesForSettings() {
    const select = document.getElementById('settings-game-select');
    select.innerHTML = '<option value="">Выберите игру...</option>';
    
    try {
        const response = await fetch('/api/admin/games/active', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            data.games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.game_code;
                option.textContent = `${game.game_code} (Раунд ${game.current_round})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки игр:', error);
    }
}

/** Удалить персонажа из каталога (по имени). */
async function deleteCharacter(characterName) {
    if (!characterName) return;
    const decoded = typeof characterName === 'string' ? characterName.replace(/\\'/g, "'").replace(/&quot;/g, '"') : characterName;
    if (!confirm(`Удалить персонажа «${decoded}» из списка для выбора?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/characters/${encodeURIComponent(decoded)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.ok) {
            alert('Персонаж удален');
            loadGamePlayers();
        } else {
            const data = await response.json().catch(() => ({}));
            alert(data.error || 'Ошибка удаления персонажа');
        }
    } catch (error) {
        console.error('Ошибка удаления персонажа:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
}

/** Удалить игрока (оставлено для совместимости, в UI вкладки «Персонажи» не используется). */
async function deletePlayer(playerId) {
    if (!confirm(`Вы уверены, что хотите удалить игрока ${playerId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/players/${playerId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (response.ok) {
            alert('Игрок удален');
            loadGamePlayers();
        } else {
            const data = await response.json().catch(() => ({}));
            alert(data.error || 'Ошибка удаления игрока');
        }
    } catch (error) {
        console.error('Ошибка удаления игрока:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
}

// ========== ЗАГРУЗКА ИЗОБРАЖЕНИЙ ЧЕРЕЗ IMGBB ==========

let imgbbApiKey = null; // Для хранения API ключа ImgBB

/**
 * Получить API ключ ImgBB с сервера
 */
async function getImgbbApiKey() {
    if (imgbbApiKey) return imgbbApiKey; // Используем кэшированный ключ
    
    try {
        const response = await fetch('/api/admin/imgbb-api-key', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Ошибка получения API ключа ImgBB (${response.status})`);
        }
        
        const data = await response.json();
        imgbbApiKey = data.api_key;
        return imgbbApiKey;
    } catch (error) {
        console.error('Ошибка получения API ключа ImgBB:', error);
        throw new Error(`Не удалось получить API ключ ImgBB: ${error.message}`);
    }
}

/**
 * Загрузить изображение на ImgBB
 */
async function uploadImageToImgBB(file) {
    const apiKey = await getImgbbApiKey();
    
    if (!apiKey) {
        throw new Error('API ключ ImgBB не настроен. Обратитесь к администратору.');
    }
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('key', apiKey);
    
    try {
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Ошибка загрузки (${response.status})`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return data.data.url; // Прямой URL изображения
        } else {
            throw new Error(data.error?.message || 'Ошибка загрузки изображения');
        }
    } catch (error) {
        console.error('Ошибка загрузки изображения на ImgBB:', error);
        throw error;
    }
}

// Функции handleImageFileSelect и showImagePreview удалены - больше не используются
// Теперь загрузка изображений для игроков обрабатывается напрямую через обработчик player-avatar-file

// ========== УПРАВЛЕНИЕ ПЕРСОНАЖАМИ ==========
// УДАЛЕНО: Персонажи объединены с игроками
// Теперь при добавлении игрока сразу указывается имя и изображение персонажа

// ========== НАСТРОЙКА РЕСУРСОВ/ОБЪЕКТОВ ==========

async function loadGameConfig() {
    const configContent = document.getElementById('game-config-content');
    configContent.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        // Загружаем текущую конфигурацию игры
        const response = await fetch(`/api/admin/games/${currentGameCode}/config`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            // Если эндпоинт не существует, показываем дефолтную конфигурацию
            showDefaultGameConfig();
            return;
        }
        
        const data = await response.json();
        showGameConfig(data);
    } catch (error) {
        // Показываем дефолтную конфигурацию при ошибке
        showDefaultGameConfig();
    }
}

function showDefaultGameConfig() {
    const configContent = document.getElementById('game-config-content');
    configContent.innerHTML = `
        <div class="info-message">
            <p>Настройка ресурсов и объектов для игры находится в разработке.</p>
            <p>В данный момент используются ресурсы и объекты из конфигурации по умолчанию.</p>
        </div>
    `;
}

function showGameConfig(config) {
    const configContent = document.getElementById('game-config-content');
    
    if (!config || !config.config) {
        showDefaultGameConfig();
        return;
    }
    
    const gameConfig = config.config;
    const enabledResources = gameConfig.enabled_resources || [];
    const enabledBuildings = gameConfig.enabled_buildings || [];
    
    // Дефолтные значения из game_config.py
    const defaultResourcePrices = {
        "камень": 20, "дерево": 15, "железо": 40, "скот": 50, "овощи": 25,
        "рабы": 80, "золото": 100, "зерно": 30, "рыба": 35
    };
    const defaultBuildingCosts = {
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
    const defaultBuildingIncome = {
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
    
    // Текущие кастомные значения (если есть)
    const customResourcePrices = gameConfig.resource_prices || {};
    const customBuildingCosts = gameConfig.building_costs || {};
    const customBuildingIncome = gameConfig.building_income || {};
    
    // Получаем все доступные ресурсы и объекты из дефолтной конфигурации
    const allResources = ['камень', 'дерево', 'железо', 'скот', 'овощи', 'рабы', 'золото', 'зерно', 'рыба'];
    const allBuildings = ['Лесоповал', 'Каменоломня', 'Теплицы', 'Трактир', 'Посевные поля', 'Рыболовня', 
                          'Кузнечная', 'Ферма', 'Постоялый двор', 'Куртизанские палатки', 'Золотой рудник'];
    
    // Создаем форму для настройки
    let html = `
        <form id="game-config-form" class="admin-form" onsubmit="saveGameConfig(event)">
            <div class="config-section">
                <h4 style="color: #d4af37; margin-bottom: 15px;">Доступные ресурсы:</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px;">
    `;
    
    // Чекбоксы для ресурсов
    allResources.forEach(resource => {
        const isEnabled = enabledResources.includes(resource);
        const safeResource = escapeHtml(resource);
        html += `
            <div class="form-group" style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" 
                           name="resource" 
                           value="${safeResource}" 
                           ${isEnabled ? 'checked' : ''}
                           style="margin-right: 8px; width: 20px; height: 20px;">
                    <span>${safeResource}</span>
                </label>
            </div>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <div class="config-section" style="margin-top: 30px;">
                <h4 style="color: #d4af37; margin-bottom: 15px;">Доступные объекты:</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px;">
    `;
    
    // Чекбоксы для объектов
    allBuildings.forEach(building => {
        const isEnabled = enabledBuildings.includes(building);
        const safeBuilding = escapeHtml(building);
        html += `
            <div class="form-group" style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" 
                           name="building" 
                           value="${safeBuilding}" 
                           ${isEnabled ? 'checked' : ''}
                           style="margin-right: 8px; width: 20px; height: 20px;">
                    <span>${safeBuilding}</span>
                </label>
            </div>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <!-- Кастомные цены на ресурсы -->
            <div class="config-section" style="margin-top: 30px; padding: 20px; background: rgba(28, 24, 16, 0.6); border-radius: 8px; border: 1px solid #8b4513;">
                <h4 style="color: #d4af37; margin-bottom: 15px;">
                    Кастомные цены на ресурсы
                    <button type="button" onclick="resetResourcePrices()" class="btn btn-secondary btn-sm" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8em;">Сбросить к дефолтным</button>
                </h4>
                <p style="color: #c9a961; font-size: 0.9em; margin-bottom: 15px;">Настройте цены на ресурсы (в монетах). Оставьте пустым для использования дефолтных значений.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
    `;
    
    // Поля ввода для цен на ресурсы (только для включенных)
    enabledResources.forEach(resource => {
        const safeResource = escapeHtml(resource);
        const currentPrice = customResourcePrices[resource] || defaultResourcePrices[resource] || '';
        const defaultPrice = defaultResourcePrices[resource] || '';
        const isCustom = customResourcePrices[resource] !== undefined && customResourcePrices[resource] !== defaultPrice;
        html += `
            <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                <label style="min-width: 100px; color: #d4af37;">${safeResource}:</label>
                <input type="number" 
                       name="resource_price_${safeResource}" 
                       value="${currentPrice}" 
                       min="1" 
                       step="1"
                       placeholder="${defaultPrice}"
                       style="flex: 1; padding: 8px; border: 1px solid #8b4513; border-radius: 4px; background: rgba(28, 24, 16, 0.8); color: #e8d5b7;">
                <span style="color: #c9a961; font-size: 0.85em;">монет</span>
                ${isCustom ? '<span style="color: #4caf50; font-size: 0.8em;">(кастомное)</span>' : ''}
            </div>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <!-- Кастомные стоимости объектов -->
            <div class="config-section" style="margin-top: 30px; padding: 20px; background: rgba(28, 24, 16, 0.6); border-radius: 8px; border: 1px solid #8b4513;">
                <h4 style="color: #d4af37; margin-bottom: 15px;">
                    Кастомные стоимости объектов
                    <button type="button" onclick="resetBuildingCosts()" class="btn btn-secondary btn-sm" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8em;">Сбросить к дефолтным</button>
                </h4>
                <p style="color: #c9a961; font-size: 0.9em; margin-bottom: 15px;">Настройте стоимости строительства объектов (в ресурсах). Оставьте пустым для использования дефолтных значений.</p>
    `;
    
    // Поля ввода для стоимостей объектов (только для включенных)
    enabledBuildings.forEach(building => {
        const safeBuilding = escapeHtml(building);
        const currentCosts = customBuildingCosts[building] || defaultBuildingCosts[building] || {};
        const defaultCosts = defaultBuildingCosts[building] || {};
        const isCustom = JSON.stringify(currentCosts) !== JSON.stringify(defaultCosts);
        
        html += `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(20, 18, 12, 0.6); border-radius: 6px; border-left: 3px solid #d4af37;">
                <h5 style="color: #d4af37; margin-bottom: 10px;">
                    ${safeBuilding}
                    ${isCustom ? '<span style="color: #4caf50; font-size: 0.8em; margin-left: 10px;">(кастомное)</span>' : ''}
                </h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
        `;
        
        // Поля для каждого ресурса, который используется в стоимости этого объекта
        const allResourcesForCosts = new Set();
        if (defaultCosts) {
            Object.keys(defaultCosts).forEach(r => allResourcesForCosts.add(r));
        }
        if (currentCosts) {
            Object.keys(currentCosts).forEach(r => allResourcesForCosts.add(r));
        }
        
        Array.from(allResourcesForCosts).forEach(resource => {
            if (!enabledResources.includes(resource)) return; // Пропускаем ресурсы, не включенные в игру
            
            const safeResource = escapeHtml(resource);
            const currentAmount = currentCosts[resource] || '';
            const defaultAmount = defaultCosts[resource] || '';
            html += `
                <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                    <label style="min-width: 80px; color: #c9a961;">${safeResource}:</label>
                    <input type="number" 
                           name="building_cost_${safeBuilding}_${safeResource}" 
                           value="${currentAmount}" 
                           min="0" 
                           step="1"
                           placeholder="${defaultAmount}"
                           style="flex: 1; padding: 6px; border: 1px solid #8b4513; border-radius: 4px; background: rgba(28, 24, 16, 0.8); color: #e8d5b7;">
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <!-- Кастомные доходы объектов -->
            <div class="config-section" style="margin-top: 30px; padding: 20px; background: rgba(28, 24, 16, 0.6); border-radius: 8px; border: 1px solid #8b4513;">
                <h4 style="color: #d4af37; margin-bottom: 15px;">
                    Кастомные доходы объектов
                    <button type="button" onclick="resetBuildingIncome()" class="btn btn-secondary btn-sm" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8em;">Сбросить к дефолтным</button>
                </h4>
                <p style="color: #c9a961; font-size: 0.9em; margin-bottom: 15px;">Настройте доходы от объектов (монеты и ресурсы). Оставьте пустым для использования дефолтных значений.</p>
    `;
    
    // Поля ввода для доходов объектов (только для включенных)
    enabledBuildings.forEach(building => {
        const safeBuilding = escapeHtml(building);
        const currentIncome = customBuildingIncome[building] || defaultBuildingIncome[building] || {"монеты": 0, "ресурсы": {}};
        const defaultIncome = defaultBuildingIncome[building] || {"монеты": 0, "ресурсы": {}};
        const isCustom = JSON.stringify(currentIncome) !== JSON.stringify(defaultIncome);
        
        html += `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(20, 18, 12, 0.6); border-radius: 6px; border-left: 3px solid #d4af37;">
                <h5 style="color: #d4af37; margin-bottom: 10px;">
                    ${safeBuilding}
                    ${isCustom ? '<span style="color: #4caf50; font-size: 0.8em; margin-left: 10px;">(кастомное)</span>' : ''}
                </h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                        <label style="min-width: 80px; color: #c9a961;">Монеты:</label>
                        <input type="number" 
                               name="building_income_${safeBuilding}_монеты" 
                               value="${currentIncome.монеты || 0}" 
                               min="0" 
                               step="1"
                               placeholder="${defaultIncome.монеты || 0}"
                               style="flex: 1; padding: 6px; border: 1px solid #8b4513; border-radius: 4px; background: rgba(28, 24, 16, 0.8); color: #e8d5b7;">
                    </div>
        `;
        
        // Поля для ресурсов в доходах
        const currentResources = currentIncome.ресурсы || {};
        const defaultResources = defaultIncome.ресурсы || {};
        const allResourcesForIncome = new Set();
        if (defaultResources) {
            Object.keys(defaultResources).forEach(r => allResourcesForIncome.add(r));
        }
        if (currentResources) {
            Object.keys(currentResources).forEach(r => allResourcesForIncome.add(r));
        }
        
        Array.from(allResourcesForIncome).forEach(resource => {
            if (!enabledResources.includes(resource)) return; // Пропускаем ресурсы, не включенные в игру
            
            const safeResource = escapeHtml(resource);
            const currentAmount = currentResources[resource] || '';
            const defaultAmount = defaultResources[resource] || '';
            html += `
                <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                    <label style="min-width: 80px; color: #c9a961;">${safeResource}:</label>
                    <input type="number" 
                           name="building_income_${safeBuilding}_${safeResource}" 
                           value="${currentAmount}" 
                           min="0" 
                           step="1"
                           placeholder="${defaultAmount}"
                           style="flex: 1; padding: 6px; border: 1px solid #8b4513; border-radius: 4px; background: rgba(28, 24, 16, 0.8); color: #e8d5b7;">
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <div class="modal-actions" style="margin-top: 30px;">
                <button type="submit" class="btn btn-primary">Сохранить конфигурацию</button>
            </div>
        </form>
    `;
    
    configContent.innerHTML = html;
}

async function saveGameConfig(event) {
    event.preventDefault();
    
    if (!currentGameCode) {
        alert('Код игры не установлен');
        return;
    }
    
    // Собираем выбранные ресурсы
    const resourceCheckboxes = document.querySelectorAll('#game-config-form input[name="resource"]:checked');
    const enabledResources = Array.from(resourceCheckboxes).map(cb => cb.value);
    
    // Собираем выбранные объекты
    const buildingCheckboxes = document.querySelectorAll('#game-config-form input[name="building"]:checked');
    const enabledBuildings = Array.from(buildingCheckboxes).map(cb => cb.value);
    
    // Валидация: должна быть хотя бы одна выбранная опция
    if (enabledResources.length === 0) {
        alert('Выберите хотя бы один ресурс');
        return;
    }
    
    if (enabledBuildings.length === 0) {
        alert('Выберите хотя бы один объект');
        return;
    }
    
    // Дефолтные значения
    const defaultResourcePrices = {
        "камень": 20, "дерево": 15, "железо": 40, "скот": 50, "овощи": 25,
        "рабы": 80, "золото": 100, "зерно": 30, "рыба": 35
    };
    const defaultBuildingCosts = {
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
    const defaultBuildingIncome = {
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
    
    // Собираем кастомные цены на ресурсы
    const resourcePrices = {};
    for (const resource of enabledResources) {
        const input = document.querySelector(`input[name="resource_price_${resource}"]`);
        if (input && input.value.trim() !== '') {
            const price = parseInt(input.value, 10);
            if (isNaN(price) || price <= 0) {
                alert(`Цена на ресурс "${resource}" должна быть положительным числом`);
                return;
            }
            resourcePrices[resource] = price;
        } else {
            // Используем дефолтную цену
            const defaultPrice = defaultResourcePrices[resource];
            if (defaultPrice && defaultPrice > 0) {
                resourcePrices[resource] = defaultPrice;
            } else {
                alert(`Не указана цена для ресурса "${resource}" и нет дефолтного значения`);
                return;
            }
        }
    }
    
    // Собираем кастомные стоимости объектов
    const buildingCosts = {};
    for (const building of enabledBuildings) {
        buildingCosts[building] = {};
        // Получаем все ресурсы, которые могут быть в стоимости этого объекта
        const defaultCosts = defaultBuildingCosts[building] || {};
        const allResourcesForCosts = new Set(Object.keys(defaultCosts));
        
        // Проверяем все поля ввода для этого объекта
        for (const resource of enabledResources) {
            const input = document.querySelector(`input[name="building_cost_${building}_${resource}"]`);
            if (input) {
                if (input.value.trim() !== '') {
                    const amount = parseInt(input.value, 10);
                    if (isNaN(amount) || amount < 0) {
                        alert(`Количество ресурса "${resource}" для объекта "${building}" должно быть неотрицательным числом`);
                        return;
                    }
                    buildingCosts[building][resource] = amount;
                } else {
                    // Если поле пустое, используем дефолтное значение (если есть)
                    if (defaultCosts[resource] !== undefined) {
                        buildingCosts[building][resource] = defaultCosts[resource];
                    }
                    // Если дефолтного значения нет, не добавляем ресурс (это нормально)
                }
            }
        }
        
        // Удаляем пустые объекты (если объект не имеет ни одного ресурса в стоимости)
        if (Object.keys(buildingCosts[building]).length === 0) {
            // Используем дефолтные значения, если они есть
            if (Object.keys(defaultCosts).length > 0) {
                Object.assign(buildingCosts[building], defaultCosts);
            }
        }
    }
    
    // Собираем кастомные доходы объектов
    const buildingIncome = {};
    for (const building of enabledBuildings) {
        buildingIncome[building] = {"монеты": 0, "ресурсы": {}};
        
        // Монеты
        const coinsInput = document.querySelector(`input[name="building_income_${building}_монеты"]`);
        if (coinsInput && coinsInput.value.trim() !== '') {
            const coins = parseInt(coinsInput.value, 10);
            if (isNaN(coins) || coins < 0) {
                alert(`Доход в монетах для объекта "${building}" должен быть неотрицательным числом`);
                return;
            }
            buildingIncome[building].монеты = coins;
        } else {
            // Используем дефолтное значение
            const defaultIncome = defaultBuildingIncome[building] || {"монеты": 0, "ресурсы": {}};
            buildingIncome[building].монеты = defaultIncome.монеты || 0;
        }
        
        // Ресурсы
        for (const resource of enabledResources) {
            const input = document.querySelector(`input[name="building_income_${building}_${resource}"]`);
            if (input) {
                if (input.value.trim() !== '') {
                    const amount = parseInt(input.value, 10);
                    if (isNaN(amount) || amount < 0) {
                        alert(`Доход в ресурсе "${resource}" для объекта "${building}" должен быть неотрицательным числом`);
                        return;
                    }
                    buildingIncome[building].ресурсы[resource] = amount;
                } else {
                    // Если поле пустое, используем дефолтное значение (если есть)
                    const defaultIncome = defaultBuildingIncome[building] || {"монеты": 0, "ресурсы": {}};
                    if (defaultIncome.ресурсы && defaultIncome.ресурсы[resource] !== undefined) {
                        buildingIncome[building].ресурсы[resource] = defaultIncome.ресурсы[resource];
                    }
                    // Если дефолтного значения нет, не добавляем ресурс (это нормально)
                }
            }
        }
    }
    
    // Формируем конфигурацию
    const config = {
        enabled_resources: enabledResources,
        enabled_buildings: enabledBuildings,
        resource_prices: resourcePrices,
        building_costs: buildingCosts,
        building_income: buildingIncome
    };
    
    try {
        const response = await fetch(`/api/admin/games/${currentGameCode}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ config })
        });
        
        if (response.ok) {
            alert('Конфигурация сохранена!');
            loadGameConfig(); // Перезагружаем для отображения
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(errorData.error || 'Ошибка сохранения конфигурации');
        }
    } catch (error) {
        console.error('Ошибка сохранения конфигурации:', error);
        alert(`Ошибка подключения к серверу: ${error.message || 'Неизвестная ошибка'}`);
    }
}

// Функции для сброса к дефолтным значениям
function resetResourcePrices() {
    const defaultResourcePrices = {
        "камень": 20, "дерево": 15, "железо": 40, "скот": 50, "овощи": 25,
        "рабы": 80, "золото": 100, "зерно": 30, "рыба": 35
    };
    
    Object.keys(defaultResourcePrices).forEach(resource => {
        const input = document.querySelector(`input[name="resource_price_${resource}"]`);
        if (input) {
            input.value = defaultResourcePrices[resource];
        }
    });
}

function resetBuildingCosts() {
    const defaultBuildingCosts = {
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
    
    Object.keys(defaultBuildingCosts).forEach(building => {
        const costs = defaultBuildingCosts[building];
        Object.keys(costs).forEach(resource => {
            const input = document.querySelector(`input[name="building_cost_${building}_${resource}"]`);
            if (input) {
                input.value = costs[resource];
            }
        });
    });
}

function resetBuildingIncome() {
    const defaultBuildingIncome = {
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
    
    Object.keys(defaultBuildingIncome).forEach(building => {
        const income = defaultBuildingIncome[building];
        
        // Монеты
        const coinsInput = document.querySelector(`input[name="building_income_${building}_монеты"]`);
        if (coinsInput) {
            coinsInput.value = income.монеты || 0;
        }
        
        // Ресурсы
        if (income.ресурсы) {
            Object.keys(income.ресурсы).forEach(resource => {
                const input = document.querySelector(`input[name="building_income_${building}_${resource}"]`);
                if (input) {
                    input.value = income.ресурсы[resource];
                }
            });
        }
    });
}

// Экспорт функций для использования в HTML
window.openGameModal = openGameModal;
window.closeGameModal = closeGameModal;
window.closeAddPlayerModal = closeAddPlayerModal;
window.editPlayer = editPlayer;
window.editCharacter = editCharacter;
window.closeEditPlayerModal = closeEditPlayerModal;
window.saveRoundContent = saveRoundContent;
window.saveRoundSettings = saveRoundSettings;
window.deletePlayer = deletePlayer;
window.deleteCharacter = deleteCharacter;
window.saveGameConfig = saveGameConfig;
window.resetResourcePrices = resetResourcePrices;
window.resetBuildingCosts = resetBuildingCosts;
window.resetBuildingIncome = resetBuildingIncome;

// Обновление списков
document.getElementById('refresh-games-btn')?.addEventListener('click', loadActiveGames);
document.getElementById('refresh-archive-btn')?.addEventListener('click', loadArchiveGames);
