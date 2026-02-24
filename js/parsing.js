const FONY_PROXY_PRIMARY = "https://fonyserver.onrender.com";
const FONY_PROXY_FALLBACK = "https://fonyserver.up.railway.app";

let activeFonyProxyBase = FONY_PROXY_PRIMARY;

function switchToFallback() {
  if (activeFonyProxyBase !== FONY_PROXY_FALLBACK) {
    activeFonyProxyBase = FONY_PROXY_FALLBACK;
  }
}

async function fetchWithProxyFallback(path, options = {}) {
  const primaryUrl = `${activeFonyProxyBase}${path}`;

  try {
    const response = await fetch(primaryUrl, options);
    if (!response.ok && activeFonyProxyBase === FONY_PROXY_PRIMARY) {
      switchToFallback();
      return fetch(`${activeFonyProxyBase}${path}`, options);
    }
    return response;
  } catch (error) {
    if (activeFonyProxyBase === FONY_PROXY_PRIMARY) {
      switchToFallback();
      return fetch(`${activeFonyProxyBase}${path}`, options);
    }
    throw error;
  }
}

export function secureUrl(url) {
  if (url.startsWith("http://")) {
    return `${activeFonyProxyBase}/stream?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function fetchIcyMetadata(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const requestOptions = {
      headers: { 'Icy-MetaData': '1' },
      signal: controller.signal
    };

    const response = url.startsWith("http://")
      ? await fetchWithProxyFallback(`/stream?url=${encodeURIComponent(url)}`, requestOptions)
      : await fetch(url, requestOptions);

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("Icy metadata request failed, status:", response.status);
      return null;
    }

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
    console.error("Error fetching Icy metadata:", error);
    return null;
  }
}

export async function getNowPlaying(streamUrl) {
  try {
    const response = await fetchWithProxyFallback(`/?url=${encodeURIComponent(streamUrl)}&t=${Date.now()}`);
    if (!response.ok) {
      console.warn("Metadata not received, status: " + response.status);
      return null;
    }

    const rawText = await response.text();
    if (!rawText) return null;

    try {
      const metadata = JSON.parse(rawText);
      return metadata.StreamTitle || null;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("Error getting Now Playing:", error);
    return null;
  }
}

export { getNowPlaying as getStreamMetadata };
