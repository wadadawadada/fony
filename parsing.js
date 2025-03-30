function secureUrl(url) {
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

export async function fetchIcyMetadata(url) {
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
      console.warn("Icy-metaint header not available");
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
    console.error("ICY Metadata Error:", error);
    return null;
  }
}

export async function resolveStreamUrl(url) {
  try {
    // 0. Прямые медиафайлы — mp3, ogg, aac, etc.
    if (url.match(/\.(mp3|ogg|aac|m4a|opus)(\?.*)?$/i)) {
      return url;
    }

    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // .pls
    if (text.includes('[playlist]') || contentType.includes('audio/x-scpls')) {
      const match = text.match(/File\d+=(.+)/i);
      if (match) return match[1].trim();
    }

    // .m3u / .m3u8
    if (text.includes('#EXTM3U') || contentType.includes('audio/x-mpegurl')) {
      const lines = text.split('\n').filter(line => line && !line.startsWith('#'));
      if (lines.length > 0) return lines[0].trim();
    }

    // .xspf
    if (text.includes('<playlist') || contentType.includes('application/xspf+xml')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "application/xml");
      const loc = doc.querySelector("location");
      if (loc) return loc.textContent.trim();
    }

    // .asx
    if (text.includes('<asx') || contentType.includes('video/x-ms-asf')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "application/xml");
      const ref = doc.querySelector('ref');
      if (ref?.getAttribute('href')) return ref.getAttribute('href').trim();
    }

    // .ram / .txt — просто ссылка внутри
    const lines = text.trim().split('\n');
    const firstLine = lines.find(line => line.match(/^https?:\/\/.+$/));
    if (firstLine) return firstLine.trim();

    return url;
  } catch (err) {
    console.warn("resolveStreamUrl() error:", err);
    return url;
  }
}

export async function fetchRSSMetadata(url) {
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
    console.error("RSS Parsing Error:", error);
    return null;
  }
}

export async function getStreamMetadata(streamUrl) {
  const icy = await fetchIcyMetadata(streamUrl);
  if (icy && icy.trim().length > 0) return icy;

  const resolved = await resolveStreamUrl(streamUrl);
  if (resolved && resolved !== streamUrl) {
    const fallbackIcy = await fetchIcyMetadata(resolved);
    if (fallbackIcy && fallbackIcy.trim().length > 0) return fallbackIcy;
  }

  const rss = await fetchRSSMetadata(streamUrl);
  return rss || "No Metadata";
}

export async function getTickerRSS() {
  try {
    const feedUrl = 'http://feeds.bbci.co.uk/news/world/rss.xml';
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error("Network error");
    const data = await response.json();
    const items = data.items;
    if (!items || items.length === 0) return "No News";
    const shuffled = items.slice().sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    const itemsHtml = selected.map(item => {
      return `<a href="${item.link}" target="_blank" style="text-decoration:none; color:inherit;">${item.title}</a>`;
    });
    return itemsHtml.join(" | ");
  } catch (error) {
    console.error("RSS Ticker Error:", error);
    return "RSS unavailable";
  }
}
