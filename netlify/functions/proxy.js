// netlify/functions/proxy.js
// Эта функция запрашивает указанный URL на серверной стороне и возвращает его содержимое по HTTPS
exports.handler = async function(event, context) {
    const url = event.queryStringParameters.url;
    if (!url) {
      return { statusCode: 400, body: "Missing url parameter" };
    }
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url);
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const bodyBuffer = await response.buffer();
      return {
        statusCode: response.status,
        headers,
        body: bodyBuffer.toString('base64'),
        isBase64Encoded: true,
      };
    } catch (error) {
      return { statusCode: 500, body: error.toString() };
    }
  };
  