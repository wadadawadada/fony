// chat.js

const GIST_ID = '30ec86f3084db72d8189d63b0414e202'; // замените на реальный Gist ID
const GITHUB_TOKEN = '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'; // ваш GitHub-токен
const CHAT_FILENAME = 'radiochat.json';

let currentGenre = '';
let pollInterval = null;
let username = localStorage.getItem('chatUsername') || '';

// Функции-«геттеры» для элементов чата
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

// Загрузка чата с Gist
async function fetchChatData() {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  const gist = await response.json();
  let data = {};
  if (gist && gist.files && gist.files[CHAT_FILENAME]) {
    try {
      data = JSON.parse(gist.files[CHAT_FILENAME].content);
    } catch (e) {
      console.error('Ошибка парсинга radiochat.json', e);
    }
  }
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
async function renderChatMessages() {
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

// Отправка нового сообщения
async function sendMessage() {
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
  await renderChatMessages();
}

// Запуск опроса чата (обновление каждые 10 секунд)
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    renderChatMessages();
  }, 10000);
}

// Инициализация чата
export function initChat(genre) {
  currentGenre = genre;
  getChatHeader().textContent = `Chat in /${genre.replace('genres/','').replace('.m3u','')} genre`;
  initChatUsername();
  renderChatMessages();
  startPolling();

  // Событие на кнопку «отправить»
  getChatSendBtn().addEventListener('click', sendMessage);
  // Отправка по Enter
  getChatInput().addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
}

// Обновление чата при смене жанра
export function updateChat(genre) {
  currentGenre = genre;
  getChatHeader().textContent = `Chat in /${genre.replace('genres/','').replace('.m3u','')} genre`;
  renderChatMessages();
}
