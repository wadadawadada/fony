async function fetchConfig() {
  const response = await fetch('/.netlify/functions/get-config');
  if (!response.ok) {
    throw new Error('Error fetching config');
  }
  return await response.json();
}

let GIST_ID;
let GITHUB_TOKEN;
let CHAT_FILENAME;

let currentGenre = '';
let username = localStorage.getItem('chatUsername') || '';

let lastChatETag = '';
let cachedChatData = {};

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

async function fetchChatData() {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { 
      Authorization: `token ${GITHUB_TOKEN}`,
      'If-None-Match': lastChatETag
    }
  });
  
  if (response.status === 304) {
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
  
  messagesElem.scrollTop = messagesElem.scrollHeight;
}

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

  renderChatMessages();
}

/**
 * .
 * @param {string} genre .
 */
export async function initChat(genre) {
  try {
    
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
  
  renderChatMessages();

  
  const sendBtn = getChatSendBtn();
  const chatInput = getChatInput();

  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  } else {
    console.error("Кнопка отправки (chatSendBtn) не найдена в DOM!");
  }

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  } else {
    console.error("Поле ввода (chatInput) не найдено в DOM!");
  }
}

/**
 * .
 * @param {string} genre - .
 */
export function updateChat(genre) {
  currentGenre = genre;
  getChatHeader().textContent = `Chat in /${genre.replace('genres/','').replace('.m3u','')} genre`;
  renderChatMessages();
}

// 
export function syncChat() {
  renderChatMessages();
}
