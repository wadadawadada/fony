const PROXY_SERVERS = [
  'https://fonyserver.onrender.com',
  'https://fonyserver.up.railway.app'
];

let _activeProxy = PROXY_SERVERS[0];

// Probe servers on load to find the first reachable one
(async () => {
  for (const server of PROXY_SERVERS) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 6000);
      await fetch(server + '/', { mode: 'no-cors', signal: ctrl.signal });
      _activeProxy = server;
      return;
    } catch {
      // timeout or network error — try next server
    }
  }
})();

export function secureUrl(url) {
  if (url.startsWith("http://")) {
    return _activeProxy + '/stream?url=' + encodeURIComponent(url);
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
    console.error("Error fetching Icy metadata:", error);
    return null;
  }
}

export async function getNowPlaying(streamUrl) {
  for (const server of PROXY_SERVERS) {
    try {
      const apiUrl = `${server}/?url=${encodeURIComponent(streamUrl)}&t=${Date.now()}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const response = await fetch(apiUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!response.ok) {
        console.warn(`[fony] getNowPlaying: ${server} returned ${response.status}`);
        continue;
      }
      const metadata = await response.json();
      return metadata.StreamTitle || null;
    } catch (err) {
      console.warn(`[fony] getNowPlaying: ${server} failed`, err);
    }
  }
  return null;
}

export { getNowPlaying as getStreamMetadata };
