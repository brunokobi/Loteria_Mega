// API pública de resultados da Caixa (permite CORS: o navegador consulta direto).
// Só os campos que as páginas usam estão tipados.

import { getJson } from './util';

const BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';

export interface CaixaMegaResult {
  numero: number;
  dataApuracao?: string;          // '19/11/2026'
  listaDezenas?: string[];        // ['04', '10', ...]
  numeroConcursoProximo?: number;
  dataProximoConcurso?: string;   // '21/11/2026'
}

export interface CaixaLotecaGameResult {
  nuSequencial: number;
  nuGolEquipeUm: number;
  nuGolEquipeDois: number;
}

export interface CaixaLotecaResult {
  numero: number;
  listaResultadoEquipeEsportiva?: CaixaLotecaGameResult[];
}

export interface CaixaLotecaGame {
  nuSequencial: number;
  dtJogo?: string;
  diaSemana?: string;
  nomeEquipeUm?: string;
  nomeEquipeDois?: string;
  siglaUFUm?: string;
  siglaPaisUm?: string;
  siglaUFDois?: string;
  siglaPaisDois?: string;
}

/** Concurso aberto da programação; a lista de jogos vem num campo cujo nome varia. */
export interface CaixaLotecaProgramacao {
  nuConcurso: number;
  dataProximoConcurso?: string;
  diaSemana?: string;
  dataFimApostas?: string;
  horarioFimApostas?: string;
  valorEstimadoProximoConcurso?: number;
  [key: string]: unknown;
}

const opts: RequestInit = { headers: { Accept: 'application/json' } };

/** Último resultado da Mega-Sena (sem número) ou um concurso específico. */
export const fetchMega = (concurso?: number) =>
  getJson<CaixaMegaResult>(`${BASE}/megasena/${concurso ?? ''}`, opts);

export const fetchLoteca = (concurso: number) =>
  getJson<CaixaLotecaResult>(`${BASE}/loteca/${concurso}`, opts);

export const fetchLotecaProgramacao = () =>
  getJson<CaixaLotecaProgramacao[]>(`${BASE}/loteca/programacao`, opts);
