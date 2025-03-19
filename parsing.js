// Импорт jsmediatags из CDN как namespace
import * as jsmediatags from 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.js';

// parsing.js
// Модуль для безсерверного парсинга метаданных радиопотоков с использованием нескольких методов.

// Метод 1: Извлечение метаданных через Icy-MetaData
export async function fetchIcyMetadata(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      headers: { 'Icy-MetaData': '1' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const metaIntHeader = response.headers.get("icy-metaint");
    if (!metaIntHeader) {
      console.warn("Icy-metaint header не найден");
      return null;
    }
    const metaInt = parseInt(metaIntHeader);
    const reader = response.body.getReader();
    let received = new Uint8Array(0);

    // Функция для накопления n байт
    async function readBytes(n) {
      while (received.length < n) {
        const { done, value } = await reader.read();
        if (done) break;
        const newArray = new Uint8Array(received.length + value.length);
        newArray.set(received);
        newArray.set(value, received.length);
        received = newArray;
      }
      const result = received.slice(0, n);
      received = received.slice(n);
      return result;
    }

    // Пропускаем аудио-данные до metaInt байт
    await readBytes(metaInt);
    // Читаем 1 байт, задающий длину блока метаданных
    const lengthByteArray = await readBytes(1);
    if (lengthByteArray.length === 0) return null;
    const metadataLength = lengthByteArray[0] * 16;
    if (metadataLength === 0) return null;
    const metadataBytes = await readBytes(metadataLength);
    const metadataString = new TextDecoder("utf-8").decode(metadataBytes);
    // Обычно формат: StreamTitle='Artist - Track';
    const regex = /StreamTitle='([^']*)';/;
    const match = regex.exec(metadataString);
    if (match && match[1].trim().length > 0) {
      return match[1];
    }
    return null;
  } catch (error) {
    console.error("Ошибка Icy-MetaData:", error);
    return null;
  }
}

// Метод 2: Извлечение ID3-тегов (для MP3) с использованием jsmediatags
export async function fetchID3Metadata(url) {
  return new Promise((resolve, reject) => {
    jsmediatags.read(url, {
      onSuccess: function(tag) {
        // Извлекаем, например, название трека из тега
        const title = tag.tags.title || null;
        resolve(title);
      },
      onError: function(error) {
        console.error("ID3 ошибка:", error);
        resolve(null);
      }
    });
  });
}

// Метод 3: Парсинг метаданных из HTML-страницы
export async function fetchHTMLMetadata(url) {
  try {
    const response = await fetch(url);
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    // Пример: поиск элемента с id="currentTrack"
    const metaElem = doc.getElementById("currentTrack");
    if (metaElem && metaElem.textContent.trim().length > 0) {
      return metaElem.textContent.trim();
    }
    return null;
  } catch (error) {
    console.error("Ошибка HTML парсинга:", error);
    return null;
  }
}

// Метод 4: Парсинг RSS/Atom-фида
export async function fetchRSSMetadata(url) {
  try {
    const response = await fetch(url);
    const rssText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rssText, "application/xml");
    // Пример: получение заголовка из первого элемента <item>
    const item = doc.querySelector("item");
    if (item) {
      const titleElem = item.querySelector("title");
      if (titleElem && titleElem.textContent.trim().length > 0) {
        return titleElem.textContent.trim();
      }
    }
    return null;
  } catch (error) {
    console.error("Ошибка RSS парсинга:", error);
    return null;
  }
}

// Метод 5: Парсинг манифестов (например, HLS/DASH)
export async function fetchManifestMetadata(url) {
  try {
    const response = await fetch(url);
    const manifestText = await response.text();
    // Пример: поиск строки вида "#STREAMTITLE: название трека"
    const regex = /#STREAMTITLE:(.+)/i;
    const match = regex.exec(manifestText);
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
    return null;
  } catch (error) {
    console.error("Ошибка парсинга манифеста:", error);
    return null;
  }
}

// Метод 6: Экспериментальный анализ аудио через Web Audio API
export async function fetchAudioAnalysisMetadata(url) {
  // Этот метод требует реализации алгоритма анализа аудиосигнала.
  // В рамках данного примера возвращаем null.
  return null;
}

// Основная функция, которая последовательно пытается получить метаданные.
// Если ни один из методов не дал результата, возвращается "No Metadata".
export async function getStreamMetadata(url) {
  let metadata = await fetchIcyMetadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  metadata = await fetchID3Metadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  metadata = await fetchHTMLMetadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  metadata = await fetchRSSMetadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  metadata = await fetchManifestMetadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  metadata = await fetchAudioAnalysisMetadata(url);
  if (metadata && metadata.trim().length > 0) return metadata;

  return "No Metadata";
}
