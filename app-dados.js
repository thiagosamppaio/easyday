// Armazenamento: IndexedDB (principal), localStorage (reserva), migração de versões,
// cópias automáticas diárias e "desfazer".
import { today, norm } from './app-util.js';

export const VERSAO_APP = '2.0';
const KEY_V1 = 'agenda.dados.v1';   // versão 1 (nunca é apagada: fica como cópia de segurança)
const KEY_V2 = 'agenda.dados.v2';   // reserva, usada só se o IndexedDB falhar
const DB_NOME = 'agenda', DB_VER = 1;

/** Estado global compartilhado pelos módulos. */
export const app = {
  db: null,
  st: { tab: 'inicio', dia: today(), modo: 'dia', filtro: '', tf: { status: 'abertas', prio: '', cat: '', periodo: '' }, busca: '', arquivados: false },
  nativo: window.AgendaNativa || null,
  render: () => {},
  aposSalvar: () => {},
  erroSalvar: () => {},
};

export function novo() {
  return {
    v: 2, nome: '',
    cfg: { discreto: false, boas: false, esfera: '', lembretePadrao: { atendimento: 15, compromisso: 15, atividade: 15, tarefa: 15 } },
    servicos: [], eventos: [], tarefas: [], pacientes: [], projetos: [], notas: [],
    exclusoes: [],   // registro de itens excluídos (preparação para sincronização futura)
  };
}

const parecePessoal = nome => /pessoal|familia|casa|filh|esposa|marido|lazer|saude pessoal/.test(norm(nome));

/** Converte qualquer versão salva para o formato atual (v2), sem perder dados. */
export function migrar(d) {
  const n = novo();
  if (!d || typeof d !== 'object') return n;
  const agora = Date.now();
  if ((d.v || 1) < 2) {
    n.nome = d.nome || '';
    n.cfg.discreto = !!(d.cfg && d.cfg.discreto);
    n.cfg.boas = !!(d.cfg && d.cfg.boas);
    n.servicos = (d.contextos || []).map(c => ({ id: c.id, nome: c.nome, cor: c.cor, esfera: parecePessoal(c.nome) ? 'pessoal' : 'profissional', arquivado: false, criadoEm: agora, atualizadoEm: agora }));
    n.eventos = (d.eventos || []).map(e => { const { ctx, ...r } = e; return { ...r, servico: ctx || '', occ: r.occ || {}, criadoEm: agora, atualizadoEm: agora }; });
    n.tarefas = (d.tarefas || []).map(t => {
      const { ctx, feita, feitaEm, criada, ...r } = t;
      return { ...r, servico: ctx || '', categoria: '', status: feita ? 'concluida' : 'pendente', concluidaEm: feita ? (feitaEm || agora) : null, subtarefas: [], historico: [{ em: criada || agora, txt: 'Criada' }], criadoEm: criada || agora, atualizadoEm: agora };
    });
    n.pacientes = (d.pacientes || []).map(p => { const { ctx, ...r } = p; return { ...r, servico: ctx || '', criadoEm: agora, atualizadoEm: agora }; });
    return n;
  }
  Object.assign(n, d);
  n.cfg = Object.assign(novo().cfg, d.cfg || {});
  n.cfg.lembretePadrao = Object.assign(novo().cfg.lembretePadrao, (d.cfg || {}).lembretePadrao || {});
  for (const k of ['servicos', 'eventos', 'tarefas', 'pacientes', 'projetos', 'notas', 'exclusoes']) if (!Array.isArray(n[k])) n[k] = [];
  n.tarefas.forEach(t => { t.subtarefas = t.subtarefas || []; t.historico = t.historico || []; t.status = t.status || 'pendente'; t.categoria = t.categoria || ''; });
  n.eventos.forEach(e => { e.occ = e.occ || {}; });
  n.servicos.forEach(s => { s.esfera = s.esfera || 'profissional'; });
  n.v = 2;
  return n;
}

// ---------- IndexedDB ----------
let idb = null, idbFalhou = false;
function abrirIDB() {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB_NOME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('copias')) d.createObjectStore('copias');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
function tx(store, modo, fn) {
  return new Promise((res, rej) => {
    const t = idb.transaction(store, modo);
    const req = fn(t.objectStore(store));
    let out;
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const lerJSON = x => { if (!x) return null; try { return typeof x === 'string' ? JSON.parse(x) : x; } catch (e) { return null; } };

/** Carrega os dados; retorna a origem ('idb', 'reserva', 'v1' ou 'novo'). */
export async function carregar() {
  idb = await abrirIDB();
  let d = null, origem = 'novo', bruto = null;
  if (idb) { try { d = lerJSON(await tx('kv', 'readonly', s => s.get('estado'))); if (d) origem = 'idb'; } catch (e) { /* segue */ } }
  if (!d) { d = lerJSON(localStorage.getItem(KEY_V2)); if (d) origem = 'reserva'; }
  if (!d) { bruto = localStorage.getItem(KEY_V1); d = lerJSON(bruto); if (d && d.v) origem = 'v1'; else d = null; }
  app.db = migrar(d);
  if (origem === 'v1') { await guardarCopia('antes-da-versao-2', bruto); await salvar(); }
  else if (origem === 'reserva' && idb) { await salvar(); }
  try { await copiaDiaria(); } catch (e) { /* cópia é opcional */ }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* opcional */ }
  return origem;
}

let fila = Promise.resolve();
async function escrever(json) {
  if (idb && !idbFalhou) {
    try { await tx('kv', 'readwrite', s => s.put(json, 'estado')); return; } catch (e) { idbFalhou = true; }
  }
  try { localStorage.setItem(KEY_V2, json); } catch (e) { app.erroSalvar(); }
}
/** Grava o estado atual (em fila, para nunca sobrepor gravações). */
export function salvar() {
  const json = JSON.stringify(app.db);
  fila = fila.then(() => escrever(json)).catch(() => app.erroSalvar());
  try { app.aposSalvar(); } catch (e) { /* ignora */ }
  return fila;
}

// ---------- cópias automáticas ----------
const temDados = () => ['eventos', 'tarefas', 'pacientes', 'servicos', 'projetos', 'notas'].some(k => app.db[k].length);
export async function guardarCopia(chave, dados) {
  if (!idb) return false;
  const json = typeof dados === 'string' ? dados : JSON.stringify(dados);
  if (!json) return false;
  await tx('copias', 'readwrite', s => s.put({ chave, em: Date.now(), json }, chave));
  return true;
}
export async function listarCopias() {
  if (!idb) return [];
  const todas = (await tx('copias', 'readonly', s => s.getAll())) || [];
  return todas.map(c => ({ chave: c.chave, em: c.em, tam: (c.json || '').length })).sort((a, b) => b.em - a.em);
}
export async function lerCopia(chave) {
  if (!idb) return null;
  const c = await tx('copias', 'readonly', s => s.get(chave));
  return c ? migrar(lerJSON(c.json)) : null;
}
async function apagarCopia(chave) { await tx('copias', 'readwrite', s => s.delete(chave)); }
/** Uma cópia por dia (estado ao abrir o app pela primeira vez no dia); mantém as 7 últimas. */
async function copiaDiaria() {
  if (!idb || !temDados()) return;
  const k = 'dia-' + today();
  const existe = await tx('copias', 'readonly', s => s.getKey(k));
  if (!existe) await guardarCopia(k, app.db);
  const todas = await listarCopias();
  for (const c of todas.filter(c => c.chave.startsWith('dia-')).slice(7)) await apagarCopia(c.chave);
  for (const c of todas.filter(c => c.chave.startsWith('antes-restaurar-')).slice(5)) await apagarCopia(c.chave);
}
/** Substitui os dados atuais, guardando uma cópia do estado anterior. */
export async function substituirDados(novos) {
  try { await guardarCopia('antes-restaurar-' + Date.now(), app.db); } catch (e) { /* segue */ }
  app.db = migrar(novos);
  await salvar();
}
export const idbDisponivel = () => !!idb && !idbFalhou;

// ---------- desfazer ----------
let ultimo = null;
/** Chame antes de uma ação destrutiva para permitir "Desfazer". */
export function marcarDesfazer() { ultimo = JSON.stringify(app.db); }
export function desfazer() {
  if (!ultimo) return false;
  app.db = migrar(JSON.parse(ultimo));
  ultimo = null;
  salvar();
  return true;
}

// ---------- utilidades de registro ----------
export function tocar(o) { o.atualizadoEm = Date.now(); if (!o.criadoEm) o.criadoEm = o.atualizadoEm; return o; }
export function registrarExclusao(tipo, id) {
  app.db.exclusoes.push({ tipo, id, em: Date.now() });
  if (app.db.exclusoes.length > 2000) app.db.exclusoes.splice(0, 500);
}
export const servico = id => app.db.servicos.find(s => s.id === id);
export const paciente = id => app.db.pacientes.find(p => p.id === id);
