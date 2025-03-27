// netlify/functions/radioTrack.js
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  const query = event.queryStringParameters.query;
  if (!query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Не передан параметр query" })
    };
  }
  // Формируем запрос к API Radio Browser.
  // Используем endpoint для поиска станций: json/stations/search
  const apiUrl = `https://fi1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Ошибка запроса к Radio Browser API" })
      };
    }
    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*" // разрешаем запросы с любого источника
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.toString() })
    };
  }
};
