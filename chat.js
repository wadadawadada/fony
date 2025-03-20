// chat.js

// Функция для получения конфигурации из Netlify Functions
async function fetchConfig() {
  const response = await fetch('/.netlify/functions/get-config');
  if (!response.ok) {
    throw new Error('Error fetching config');
  }
  return await response.json();
}

// Глобальные переменные для хранения конфигурационных данных
let GIST_ID;
let GITHUB_TOKEN;
let CHAT_FILENAME;

let currentGenre = '';
let username = localStorage.getItem('chatUsername') || '';

// Переменные для кэширования данных чата
let lastChatETag = '';
let cachedChatData = {};

// Геттеры для элементов чата
function getChatMessagesElement() {
  return document.getElementById('chatMessages');
}
function getChatInput() {
  return document.getElementById('chatInput');
}
function getChatSendBtn() {
  return document.getElementById('chatSendBtn');
}
function getChatHeader() {
  return document.getElementById('chatGenre');
}
function getChatUsernameInput() {
  return document.getElementById('chatUsernameInput');
}

// Инициализация имени пользователя
function initChatUsername() {
  const usernameInput = getChatUsernameInput();
  if (username) {
    usernameInput.value = username;
  }
  usernameInput.addEventListener('change', () => {
    username = usernameInput.value.trim();
    if (username) {
      localStorage.setItem('chatUsername', username);
    }
  });
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      username = usernameInput.value.trim();
      if (username) {
        localStorage.setItem('chatUsername', username);
        usernameInput.blur();
      }
    }
  });
}

// Загрузка чата с Gist с кэшированием через ETag
async function fetchChatData() {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`,
      'If-None-Match': lastChatETag
    }
  });
  
  if (response.status === 304) {
    // Данные не изменились – возвращаем закэшированное значение
    return cachedChatData;
  }
  
  lastChatETag = response.headers.get('ETag');
  const gist = await response.json();
  let data = {};
  if (gist && gist.files && gist.files[CHAT_FILENAME]) {
    try {
      data = JSON.parse(gist.files[CHAT_FILENAME].content);
    } catch (e) {
      console.error('Ошибка парсинга radiochat.json', e);
    }
  }
  cachedChatData = data;
  return data;
}

// Обновление чата в Gist
async function updateChatData(updatedData) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${GITHUB_TOKEN}`
    },
    body: JSON.stringify({
      files: {
        [CHAT_FILENAME]: {
          content: JSON.stringify(updatedData, null, 2)
        }
      }
    })
  });
}

// Отрисовка сообщений в блоке #chatMessages
export async function renderChatMessages() {
  const messagesElem = getChatMessagesElement();
  messagesElem.innerHTML = '';
  const data = await fetchChatData();
  const messages = data[currentGenre] || [];
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-message');
    msgDiv.innerHTML = `<strong>${msg.username}</strong> [${new Date(msg.timestamp).toLocaleTimeString()}]: ${msg.text}`;
    messagesElem.appendChild(msgDiv);
  });
  // Прокрутка вниз
  messagesElem.scrollTop = messagesElem.scrollHeight;
}

// Отправка нового сообщения с мгновенным обновлением UI
export async function sendMessage() {
  const input = getChatInput();
  const text = input.value.trim();
  if (!text) return;
  if (!username) {
    username = 'Anonymous';
    localStorage.setItem('chatUsername', username);
  }
  const data = await fetchChatData();
  if (!data[currentGenre]) {
    data[currentGenre] = [];
  }
  data[currentGenre].push({
    username: username,
    text: text,
    timestamp: Date.now()
  });
  await updateChatData(data);
  input.value = '';
  // Обновляем сообщения сразу после отправки
  renderChatMessages();
}

/**
 * Инициализация чата.
 * Функция сначала получает конфигурацию с помощью Netlify Functions,
 * затем инициализирует элементы чата.
 *
 * @param {string} genre - Жанр (например, значение из плейлиста), для которого открывается чат.
 */
export async function initChat(genre) {
  try {
    // Получаем конфигурационные значения из Netlify Functions
    const config = await fetchConfig();
    GIST_ID = config.GIST_ID;
    GITHUB_TOKEN = config.GITHUB_TOKEN;
    CHAT_FILENAME = config.CHAT_FILENAME;
  } catch (error) {
    console.error('Ошибка инициализации конфигурации:', error);
    return;
  }
  
  currentGenre = genre;
  getChatHeader().textContent = `Chat in /${genre.replace('genres/','').replace('.m3u','')} genre`;
  initChatUsername();
  // Первичная отрисовка сообщений
  renderChatMessages();
}

/**
 * Обновление чата при смене жанра.
 * @param {string} genre - Новый жанр.
 */
export function updateChat(genre) {
  currentGenre = genre;
  getChatHeader().textContent = `Chat in /${genre.replace('genres/','').replace('.m3u','')} genre`;
  renderChatMessages();
}

// Для синхронизации чата из глобального цикла обновления
export function syncChat() {
  renderChatMessages();
}
