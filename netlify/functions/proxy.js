// netlify/functions/proxy.js
// Эта функция запрашивает указанный URL на серверной стороне и возвращает его содержимое через HTTPS
exports.handler = async function(event, context) {
    const url = event.queryStringParameters.url;
    if (!url) {
      return { statusCode: 400, body: "Missing url parameter" };
    }
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url);
      // Получаем тип контента исходного ответа
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const buffer = await response.buffer();
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
  