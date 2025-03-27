// parsing.js

// Функция для преобразования URL в HTTPS, если он начинается с "http://"
function secureUrl(url) {
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

// Метод 1: Извлечение метаданных через Icy-MetaData
export async function fetchIcyMetadata(url) {
  // Преобразуем URL в HTTPS, если требуется
  url = secureUrl(url);
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
      console.warn("Icy-metaint header no avaliable");
      return null;
    }
    const metaInt = parseInt(metaIntHeader);
    const reader = response.body.getReader();
    let received = new Uint8Array(0);

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

    await readBytes(metaInt);
    const lengthByteArray = await readBytes(1);
    if (lengthByteArray.length === 0) return null;
    const metadataLength = lengthByteArray[0] * 16;
    if (metadataLength === 0) return null;
    const metadataBytes = await readBytes(metadataLength);
    const metadataString = new TextDecoder("utf-8").decode(metadataBytes);
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

// Метод 4: Парсинг RSS/Atom-фида
export async function fetchRSSMetadata(url) {
  // Преобразуем URL в HTTPS
  url = secureUrl(url);
  try {
    const response = await fetch(url);
    const rssText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rssText, "application/xml");
    const item = doc.querySelector("item");
    if (item) {
      const titleElem = item.querySelector("title");
      if (titleElem && titleElem.textContent.trim().length > 0) {
        return titleElem.textContent.trim();
      }
    }
    return null;
  } catch (error) {
    console.error("error RSS parsing:", error);
    return null;
  }
}

// Основная функция получения метаданных: сначала через ICY, затем через RSS
export async function getStreamMetadata(url) {
  const icyMetadata = await fetchIcyMetadata(url);
  if (icyMetadata && icyMetadata.trim().length > 0) {
    return icyMetadata;
  }
  const rssData = await fetchRSSMetadata(url);
  return rssData || "No Metadata";
}

// Функция для получения данных RSS для бегущей строки (новости Global News)
export async function getTickerRSS() {
  try {
    const feedUrl = 'http://feeds.bbci.co.uk/news/world/rss.xml';
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    const items = data.items;
    if (!items || items.length === 0) {
      return "No News";
    }
    // Перемешиваем массив новостей случайным образом
    const shuffled = items.slice().sort(() => Math.random() - 0.5);
    // Выбираем первые три новости
    const selected = shuffled.slice(0, 3);
    // Формируем HTML-ссылки с открытием в новом окне
    const itemsHtml = selected.map(item => {
      return `<a href="${item.link}" target="_blank" style="text-decoration:none; color:inherit;">
                ${item.title}
              </a>`;
    });
    return itemsHtml.join(" | ");
  } catch (error) {
    console.error("RSS Ticker ERROR:", error);
    return "RSS unavailable";
  }
}
