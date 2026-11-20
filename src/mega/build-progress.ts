// Botão "Atualizar análise": dispara um build no Netlify e acompanha até o results.json mudar.

import { byId, getJson } from '../shared/util';
import type { Results } from './types';

// Tempo estimado do build (~2 min de análise + instalação); a barra vai até 95% antes de terminar
const BUILD_EST_SEC = 240;
// Abandona o acompanhamento se o build passar deste tempo
const BUILD_TIMEOUT_SEC = 600;
const POLL_MS = 15000;

interface TriggerResponse { ok?: boolean; message?: string; error?: string }

let currentGeneratedAt: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
let elapsedSec = 0;
let onFinished: (data: Results) => void = () => {};

const fmtElapsed = (s: number) => {
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};

function showError(msg: string): void {
  const toast = byId('update-toast');
  toast.textContent = `✗ ${msg}`;
  toast.className = 'update-toast err show';
}

/** Única rotina de limpeza: para os timers, reabilita o botão e restaura o ícone. */
function stopBuildProgress(): void {
  clearInterval(elapsedTimer);
  clearInterval(pollTimer);
  elapsedTimer = pollTimer = undefined;
  const btn = byId<HTMLButtonElement>('update-btn');
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  btn.classList.remove('loading');
  const icon = btn.querySelector('.btn-icon');
  if (icon) icon.textContent = '↻';
}

function startBuildProgress(): void {
  elapsedSec = 0;
  const banner = byId('build-banner');
  const bar = byId('build-bar');
  const text = byId('build-text');
  banner.className = 'build-banner show';

  elapsedTimer = setInterval(() => {
    elapsedSec++;
    if (elapsedSec >= BUILD_TIMEOUT_SEC) {
      stopBuildProgress();
      const msg = 'O build demorou mais de 10 min. Verifique o painel do Netlify e tente novamente.';
      banner.className = 'build-banner show error';
      text.textContent = msg;
      showError(msg);
      setTimeout(() => {
        if (banner.classList.contains('error')) banner.className = 'build-banner';
      }, 10000);
      return;
    }
    bar.style.width = `${Math.min(95, (elapsedSec / BUILD_EST_SEC) * 100).toFixed(1)}%`;
    text.innerHTML = `Atualizando dados e treinando o modelo... <strong>${fmtElapsed(elapsedSec)}</strong>`;
  }, 1000);

  // Consulta o results.json até o generated_at mudar (erros durante o build são ignorados)
  pollTimer = setInterval(async () => {
    const data = await getJson<Results>(`./results.json?t=${Date.now()}`);
    if (data && data.meta.generated_at !== currentGeneratedAt) buildFinished(data);
  }, POLL_MS);
}

function buildFinished(data: Results): void {
  stopBuildProgress();
  const banner = byId('build-banner');
  banner.className = 'build-banner show done';
  byId('build-text').innerHTML = `Análise atualizada em <strong>${fmtElapsed(elapsedSec)}</strong>!`;
  currentGeneratedAt = data.meta.generated_at;
  onFinished(data);
  setTimeout(() => { banner.className = 'build-banner'; }, 4000);
}

async function triggerBuild(): Promise<void> {
  const btn = byId<HTMLButtonElement>('update-btn');
  const toast = byId('update-toast');

  stopBuildProgress();
  byId('build-banner').className = 'build-banner';
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('loading');
  toast.className = 'update-toast';
  toast.textContent = '';

  let data: TriggerResponse;
  try {
    const r = await fetch('/.netlify/functions/trigger-build', { method: 'POST' });
    data = (await r.json()) as TriggerResponse;
  } catch {
    stopBuildProgress();
    showError('Não foi possível conectar. Verifique se está no Netlify.');
    return;
  }
  if (data.ok) {
    startBuildProgress();
  } else {
    stopBuildProgress();
    showError(data.error || 'Erro desconhecido');
  }
}

/** Liga o botão; `render` é chamado com os dados novos quando o build termina. */
export function setupBuildButton(generatedAt: string | null, render: (data: Results) => void): void {
  currentGeneratedAt = generatedAt;
  onFinished = render;
}

export function initBuildButton(): void {
  byId('update-btn').addEventListener('click', () => { void triggerBuild(); });
}
