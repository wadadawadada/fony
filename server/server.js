const http = require('http');
const url = require('url');
const icy = require('icy');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  // Разрешаем CORS для всех источников
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Парсим query параметры из URL
  const queryObject = url.parse(req.url, true).query;
  const streamUrl = queryObject.url;
  if (!streamUrl) {
    res.writeHead(400, {'Content-Type': 'text/plain'});
    res.end('Missing "url" parameter');
    return;
  }

  // Подключаемся к радиопотоку с помощью icy
  icy.get(streamUrl, (streamRes) => {
    // При получении метаданных событие 'metadata' срабатывает
    streamRes.on('metadata', (metadata) => {
      const parsed = icy.parse(metadata);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(parsed));
      // Закрываем соединение, так как метаданные получены
      streamRes.destroy();
    });

    // Таймаут – если метаданные не пришли за 15 секунд
    setTimeout(() => {
      res.writeHead(204); // No Content
      res.end();
      streamRes.destroy();
    }, 15000);
  }).on('error', (err) => {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Error: ' + err.toString());
  });
}).listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
