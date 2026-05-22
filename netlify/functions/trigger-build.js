const https = require('https');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const hookUrl = process.env.BUILD_HOOK_URL;
  if (!hookUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'BUILD_HOOK_URL nao configurada. Va em Netlify > Site settings > Build hooks, crie um hook e adicione a URL como variavel de ambiente.' })
    };
  }

  return new Promise((resolve) => {
    const req = https.request(hookUrl, { method: 'POST' }, () => {
      resolve({
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, message: 'Build iniciado! A analise sera atualizada em alguns minutos.' })
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: err.message })
      });
    });

    req.end();
  });
};
