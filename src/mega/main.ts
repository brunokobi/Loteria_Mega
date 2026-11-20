// Página da Mega-Sena (index.html).

import { byId } from '../shared/util';
import { initBuildButton, setupBuildButton } from './build-progress';
import { initHero } from './hero';
import { loadHistory, refreshNextDrawFromCaixa, renderNextDraw } from './history';
import { render } from './render';
import type { Results } from './types';

initHero();
initBuildButton();

async function main(): Promise<void> {
  let data: Results;
  try {
    const r = await fetch('./results.json');
    if (!r.ok) throw new Error('not found');
    data = (await r.json()) as Results;
  } catch {
    showMissingData();
    return;
  }
  setupBuildButton(data.meta.generated_at, render);
  render(data);
  renderNextDraw(data.meta.next_draw);
  void refreshNextDrawFromCaixa();
  void loadHistory();
}

function showMissingData(): void {
  byId('loading').innerHTML = `
    <div style="text-align:center;padding:40px;max-width:480px">
      <div style="font-size:48px;margin-bottom:20px">⚠️</div>
      <h2 style="font-size:22px;margin-bottom:12px;color:#f1f5f9">results.json não encontrado</h2>
      <p style="color:#64748b;margin-bottom:24px;font-size:14px">
        Execute o script para gerar os dados antes de abrir a interface:
      </p>
      <code style="
        background:#0e1220;border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;padding:12px 20px;display:inline-block;
        font-family:'JetBrains Mono',monospace;font-size:14px;color:#22d3a0
      ">python generate_results.py</code>
    </div>
  `;
}

void main();
