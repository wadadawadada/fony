addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Заголовки, разрешающие CORS и передачу заголовка icy-metadata
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'icy-metadata, Content-Type'
  };

  // Если это preflight-запрос, сразу возвращаем ответ
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing "url" parameter', { status: 400, headers: corsHeaders });
  }

  try {
    // Здесь делаем запрос к целевому URL с нужным заголовком
    const response = await fetch(target, {
      headers: { 'Icy-MetaData': '1' }
    });
    // Клонируем заголовки ответа и добавляем CORS-заголовки
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response('Error: ' + error.toString(), { status: 500, headers: corsHeaders });
  }
}
