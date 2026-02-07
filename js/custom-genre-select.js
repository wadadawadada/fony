import { getGenreIcon } from './playlist.js';

let currentSelectedValue = null;
let currentSelectedName = null;
const GENRE_DROPDOWN_ICON_COLOR = "#FFFFFF";
const genreIconCache = new Map();

// Получить раскрашенный SVG URL
async function getColoredIconUrl(iconPath, color) {
  const cacheKey = `${iconPath}:${color}`;
  if (genreIconCache.has(cacheKey)) return genreIconCache.get(cacheKey);

  try {
    const res = await fetch(iconPath);
    if (!res.ok) throw new Error("Icon fetch failed");
    const svgText = await res.text();
    const coloredSvg = svgText.replace(/fill="[^"]*"/g, `fill="${color}"`);
    const blob = new Blob([coloredSvg], { type: "image/svg+xml" });
    const dataUrl = URL.createObjectURL(blob);
    genreIconCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (e) {
    console.error("Failed to color icon:", e);
    return iconPath;
  }
}

// Создать иконку как img элемент
async function createIconElement(genreName) {
  try {
    const iconPath = getGenreIcon(genreName);
    const dataUrl = await getColoredIconUrl(iconPath, GENRE_DROPDOWN_ICON_COLOR);
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = genreName;
    return img;
  } catch (e) {
    console.error("Failed to create icon element:", e);
    return null;
  }
}

// Инициализировать кастомный dropdown
export async function initCustomGenreSelect(playlists, onSelect, options = {}) {
  const customSelect = document.getElementById('customGenreSelect');
  const header = document.getElementById('genreSelectHeader');
  const dropdown = document.getElementById('genreSelectDropdown');
  const list = document.getElementById('genreSelectList');
  const headerText = document.getElementById('genreSelectText');
  const headerIcon = document.getElementById('genreSelectIcon');

  // Заполнить список элементов
  list.innerHTML = '';
  for (const playlist of playlists) {
    const li = document.createElement('li');
    li.className = 'genre-select-item';
    li.dataset.value = playlist.file;
    li.dataset.name = playlist.name;

    // Иконка
    const iconSpan = document.createElement('span');
    iconSpan.className = 'genre-select-item-icon';
    const icon = await createIconElement(playlist.name);
    if (icon) iconSpan.appendChild(icon);

    // Текст
    const textSpan = document.createElement('span');
    textSpan.textContent = playlist.name;

    li.appendChild(iconSpan);
    li.appendChild(textSpan);

    // Обработчик клика
    li.addEventListener('click', async () => {
      currentSelectedValue = playlist.file;
      currentSelectedName = playlist.name;

      // Обновить header
      headerText.textContent = playlist.name;
      headerIcon.innerHTML = '';
      const headerIconImg = await createIconElement(playlist.name);
      if (headerIconImg) headerIcon.appendChild(headerIconImg);

      // Обновить стили выбранного элемента
      document.querySelectorAll('.genre-select-item').forEach(item => {
        item.classList.remove('selected');
      });
      li.classList.add('selected');

      // Закрыть dropdown
      dropdown.classList.remove('open');

      // Вызвать колбэк
      if (onSelect) onSelect(playlist.file, playlist.name);
    });

    list.appendChild(li);
  }

  // Обработчик клика на header
  header.addEventListener('click', () => {
    dropdown.classList.toggle('open');
  });

  // Закрытие dropdown при клике вне
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Закрытие dropdown при нажатии Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  // Установить первый элемент как выбранный по умолчанию
  const autoSelectFirst = options.autoSelectFirst !== false;
  if (autoSelectFirst && playlists.length > 0) {
    const firstItem = list.querySelector('.genre-select-item');
    if (firstItem) {
      firstItem.click();
    }
  }
}

// Обновить выбранный жанр (например, при загрузке)
export async function setSelectedGenre(file, name) {
  const headerText = document.getElementById('genreSelectText');
  const headerIcon = document.getElementById('genreSelectIcon');
  const list = document.getElementById('genreSelectList');

  currentSelectedValue = file;
  currentSelectedName = name;

  headerText.textContent = name;
  headerIcon.innerHTML = '';
  const headerIconImg = await createIconElement(name);
  if (headerIconImg) headerIcon.appendChild(headerIconImg);

  // Обновить стили
  document.querySelectorAll('.genre-select-item').forEach(item => {
    if (item.dataset.value === file) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Получить выбранный жанр
export function getSelectedGenre() {
  return {
    file: currentSelectedValue,
    name: currentSelectedName
  };
}

// Получить элемент кастомного select для совместимости со старым кодом
export function createPlaylistSelectPolyfill() {
  const polyfill = {
    addEventListener: function(event, handler) {
      const header = document.getElementById('genreSelectHeader');
      if (event === 'change') {
        // Сохранить обработчик для использования при изменении выбора
        window.__genreSelectChangeHandler = handler;
      }
    }
  };
  return polyfill;
}

// Expose functions to window for global access
if (typeof window !== 'undefined') {
  window.initCustomGenreSelect = initCustomGenreSelect;
  window.setSelectedGenre = setSelectedGenre;
  window.getSelectedGenre = getSelectedGenre;
}
