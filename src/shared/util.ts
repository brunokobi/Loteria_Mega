// Utilitários compartilhados pelas páginas da Mega-Sena e da Loteca.

/** Elemento obrigatório da página: falha cedo se o HTML e o script divergirem. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as T;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Escapa texto para interpolar em HTML. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c] ?? c);

/** '1996-03-11' -> '11/03/1996'; '2026-11-19 10:38' -> '19/11/2026 10:38'. */
export function fmtDate(s: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s ?? '');
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}` : '');
}

/** '21/11/2026' -> '2026-11-21' (ou null). */
export function brDateToIso(s: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });

/** Dia da semana por extenso de uma data ISO ('2026-11-21' -> 'sábado'). */
export const weekdayOf = (iso: string | null | undefined): string =>
  iso ? WEEKDAY_FMT.format(new Date(`${iso}T12:00:00Z`)) : '';

/** Busca JSON; devolve null se a resposta não for OK ou a rede falhar. */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, init);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Esconde o carregamento e mostra o conteúdo da página. */
export function showApp(): void {
  byId('loading').style.display = 'none';
  byId('app').classList.add('ready');
}
