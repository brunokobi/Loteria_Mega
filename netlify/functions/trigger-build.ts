// Dispara um novo build no Netlify (botão "Atualizar análise" da página da Mega-Sena).
// Precisa da variável de ambiente BUILD_HOOK_URL (Netlify > Site settings > Build hooks).

interface HandlerEvent {
  httpMethod: string;
}

interface HandlerResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const json = (statusCode: number, body: object): HandlerResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const hookUrl = process.env.BUILD_HOOK_URL;
  if (!hookUrl) {
    return json(500, {
      error: 'BUILD_HOOK_URL não configurada. Vá em Netlify > Site settings > Build hooks, crie um hook e adicione a URL como variável de ambiente.',
    });
  }

  try {
    await fetch(hookUrl, { method: 'POST' });
    return json(200, { ok: true, message: 'Build iniciado! A análise será atualizada em alguns minutos.' });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
};
