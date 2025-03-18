// netlify/functions/proxy.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Получаем URL из query-параметра
  const { url } = event.queryStringParameters;
  if (!url) {
    return {
      statusCode: 400,
      body: 'URL parameter is required',
    };
  }

  try {
    // Запрашиваем ресурс по указанному URL
    const response = await fetch(url);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `Error fetching resource: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type');
    const buffer = await response.buffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        // Разрешаем кросс-доменный доступ
        'Access-Control-Allow-Origin': '*',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Server Error: ${error.message}`,
    };
  }
};
