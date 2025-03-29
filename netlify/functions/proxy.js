// netlify/functions/proxy.js
// Эта функция получает URL, делает запрос к нему и буферизует данные в течение 5 секунд,
// затем возвращает накопленный фрагмент как Base64-строку с правильным Content-Type.
exports.handler = async function(event, context) {
    const url = event.queryStringParameters.url;
    if (!url) {
      return { statusCode: 400, body: "Missing url parameter" };
    }
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const reader = response.body.getReader();
      let chunks = [];
      let totalLength = 0;
      const startTime = Date.now();
      // Читаем данные в течение 5 секунд (5000 мс)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
        if (Date.now() - startTime >= 5000) {
          break;
        }
      }
      // Объединяем полученные чанки
      const buffer = Buffer.concat(chunks, totalLength);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400"
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    } catch (error) {
      return { statusCode: 500, body: error.toString() };
    }
  };
  