// netlify/functions/audioProxy.js

const http = require('http');
const https = require('https');

/**
 * Пример serverless-функции Netlify, которая:
 *  1) Получает ?url=http://my-radio.com/stream
 *  2) Делает запрос к исходному серверу (http или https)
 *  3) Возвращает полученные данные клиенту
 * 
 * Внимание: из-за лимитов по времени на Netlify (10-26 секунд)
 *           может обрываться на длительных аудиопотоках!
 */
exports.handler = async (event, context) => {
  try {
    // 1. Получаем URL из query-параметра ?url=
    const stationUrl = event.queryStringParameters.url;
    if (!stationUrl) {
      return {
        statusCode: 400,
        body: 'Missing ?url= param',
      };
    }

    // 2. Определяем, http или https
    const isHttps = stationUrl.startsWith('https://');
    const lib = isHttps ? https : http;

    // 3. Возвращаем Promise, поскольку Lambda-функции
    //    должны быть асинхронными (async/await)
    return new Promise((resolve, reject) => {
      // Выполняем запрос к исходному потоку
      const req = lib.get(stationUrl, (res) => {
        // Если нужно отдать бинарные данные, нужно пометить isBase64Encoded
        // Но для простоты попробуем "перекинуть" всё одним куском.

        // Считываем данные с потока
        let rawData = [];
        res.on('data', (chunk) => {
          rawData.push(chunk);
        });

        res.on('end', () => {
          // Соединяем куски в один Buffer
          const bodyBuffer = Buffer.concat(rawData);

          // Возвращаем результат
          resolve({
            statusCode: 200,
            // Здесь выставляем заголовки по ситуации:
            // Типичный радиострим идет как audio/mpeg или audio/aacp, но бывает и другое
            headers: {
              'Content-Type': res.headers['content-type'] || 'audio/mpeg',
              // Нужно разрешить бинарную передачу
              'Content-Encoding': res.headers['content-encoding'] || '',
            },
            body: bodyBuffer.toString('base64'),
            isBase64Encoded: true,
          });
        });
      });

      req.on('error', (err) => {
        reject({
          statusCode: 500,
          body: 'Proxy request error: ' + err.message,
        });
      });

      // Если нужно, можно задать таймаут
      req.setTimeout(10000, () => {
        req.destroy(new Error('Request timed out'));
      });
    });
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Serverless function error: ' + error.message,
    };
  }
};
