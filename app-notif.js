// Lembretes: aviso dentro do app, notificação do navegador e alarmes nativos (APK).
import { $, esc, ic, today, addDays, at, fmtShort, LEMB, MAX_REP_LEMB } from './app-util.js';
import { app, servico } from './app-dados.js';
import { ocorrencias, evTitulo, aberta, atrasada } from './app-regras.js';
import { acoes } from './app-ui.js';

const NKEY = 'agenda.avisados';
let swReg = null;
export const definirSW = r => { swReg = r; };

export function permissaoAtual() {
  if (app.nativo) { try { return app.nativo.permissao(); } catch (e) { return 'indisponivel'; } }
  return ('Notification' in window) ? Notification.permission : 'indisponivel';
}
/** auto=true: só pergunta se ainda não foi perguntado (não abre ajustes). */
export function pedirPermissao(auto) {
  if (app.nativo) { if (!auto || permissaoAtual() === 'default') { try { app.nativo.pedirPermissao(); } catch (e) { /* ignora */ } } return; }
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission().then(() => app.render()); } catch (e) { /* ignora */ }
  }
}
window.aoMudarPermissao = () => { if (app.st.tab === 'mais') app.render(); };

function bip() {
  try {
    const A = window.AudioContext || window.webkitAudioContext; const a = new A();
    [0, 0.28].forEach(t => {
      const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.25); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.26);
    });
  } catch (e) { /* sem som */ }
}
export function avisar(titulo, corpo, tag, acao, aoVer) {
  const ant = tag && document.querySelector(`#alerts .al[data-tag="${CSS.escape(tag)}"]`); if (ant) ant.remove();
  const el = document.createElement('div'); el.className = 'al'; if (tag) el.dataset.tag = tag;
  el.innerHTML = `${ic('bell')}<div class="grow"><b>${esc(titulo)}</b><span>${esc(corpo)}</span></div><button>${aoVer ? 'Visto' : 'OK'}</button>`;
  el.querySelector('button').onclick = e => { e.stopPropagation(); el.remove(); if (aoVer) aoVer(); };
  el.onclick = () => { el.remove(); if (aoVer) aoVer(); if (acao) acao(); };
  $('#alerts').appendChild(el); bip();
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignora */ }
  if (app.nativo) { if (tag === 'teste') { try { app.nativo.notificarAgora(titulo, corpo); } catch (e) { /* ignora */ } } return; }
  if ('Notification' in window && Notification.permission === 'granted') {
    const opt = { body: corpo, tag, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200], renotify: true };
    try { if (swReg) swReg.showNotification(titulo, opt); else new Notification(titulo, opt); } catch (e) { /* ignora */ }
  }
}

const textoQuando = (lemb, ini) => lemb === 0 ? 'Agora, às ' + ini : lemb >= 1440 ? 'Amanhã às ' + ini : 'Às ' + ini + ' · ' + LEMB[String(lemb)];
/** Lista de lembretes futuros (para os alarmes nativos), independente dos filtros da tela. */
export function lembretesFuturos(dias = 30) {
  const agora = Date.now(), t0 = today(), limite = at(addDays(t0, dias + 1), '00:00').getTime(), out = [];
  for (const o of ocorrencias(addDays(t0, -1), addDays(t0, dias + 1), false)) {
    const ev = o.ev;
    if (!(ev.lembrete >= 0) || o.status) continue;
    const p = proximoToque(at(o.data, o.ini).getTime() - ev.lembrete * 60000, ev.repLemb, agora);
    if (!p || p.quando > limite) continue;
    const s = servico(ev.servico);
    out.push({ id: hashId(o.chave + (o.movida ? '>' + o.data + o.ini : '')), ...p, titulo: evTitulo(ev, true), texto: textoQuando(ev.lembrete, o.ini) + (s ? ' · ' + s.nome : '') + (ev.local ? ' · ' + ev.local : '') });
  }
  for (const t of app.db.tarefas) {
    if (!aberta(t) || !(t.lembrete >= 0) || !t.prazo || !t.hora) continue;
    const p = proximoToque(at(t.prazo, t.hora).getTime() - t.lembrete * 60000, t.repLemb, agora);
    if (!p || p.quando > limite) continue;
    out.push({ id: hashId('t' + t.id + '@' + t.prazo + t.hora), ...p, titulo: t.titulo, texto: 'Tarefa · prazo ' + fmtShort(t.prazo) + ' às ' + t.hora });
  }
  out.push(...alertasDeAtraso(agora, Math.min(dias, 14)));
  return out.sort((a, b) => a.quando - b.quando).slice(0, 300);
}
/**
 * Próximo toque de um lembrete a partir de agora. Sem repetição: só o horário do lembrete.
 * Com repetição (rl minutos): a primeira repetição ainda por vir, e quantas restam depois dela.
 */
function proximoToque(q, rl, agora) {
  rl = Number(rl) || 0;
  if (q > agora) return rl ? { quando: q, repetir: rl, restantes: MAX_REP_LEMB } : { quando: q };
  if (!rl) return null;
  const i = Math.floor((agora - q) / (rl * 60000)) + 1;
  if (i > MAX_REP_LEMB) return null;
  return { quando: q + i * rl * 60000, repetir: rl, restantes: MAX_REP_LEMB - i };
}
// ---------- tarefas atrasadas: aviso com som de tempos em tempos ----------
/** Horários do dia em que o aviso de atraso toca (de "de" até "ate", a cada "intervalo" minutos). */
function horariosAtraso(c) {
  const m = s => { const [h, mi] = String(s || '0:0').split(':').map(Number); return h * 60 + (mi || 0); };
  const passo = Math.max(30, Number(c.intervalo) || 120), out = [];
  for (let x = m(c.de); x <= m(c.ate) && out.length < 48; x += passo) out.push(String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'));
  return out;
}
const resumoAtraso = ts => ts.length === 1 ? ts[0].titulo : ts.slice(0, 4).map(t => '• ' + t.titulo).join('\n') + (ts.length > 4 ? `\n… e mais ${ts.length - 4}` : '');
/** Alarmes do aviso de atraso nos próximos dias: em cada horário, as tarefas que já estarão atrasadas naquele dia. */
function alertasDeAtraso(agora, dias) {
  const c = app.db.cfg.atraso; if (!c || !c.ativo) return [];
  const hs = horariosAtraso(c), t0 = today(), out = [];
  const abertas = app.db.tarefas.filter(t => aberta(t) && t.prazo);
  for (let i = 0; i <= dias; i++) {
    const d = addDays(t0, i), ts = abertas.filter(t => atrasada(t, d));
    if (!ts.length) continue;
    for (const h of hs) {
      const q = at(d, h).getTime(); if (q <= agora) continue;
      out.push({ id: hashId('atraso@' + d + h), quando: q, titulo: ts.length === 1 ? 'Tarefa atrasada' : ts.length + ' tarefas atrasadas', texto: resumoAtraso(ts) });
    }
  }
  return out;
}
const AKEY = 'agenda.ultimoAtraso';
/** Com o app aberto: mostra o aviso de atraso se chegou um dos horários e ainda não foi mostrado. */
function verificarAtraso(agora) {
  const c = app.db.cfg.atraso; if (!c || !c.ativo) return;
  const ts = app.db.tarefas.filter(t => atrasada(t)); if (!ts.length) return;
  const t0 = today(), passados = horariosAtraso(c).map(h => at(t0, h).getTime()).filter(q => q <= agora);
  if (!passados.length) return;
  const ultimoHorario = passados[passados.length - 1];
  if (agora - ultimoHorario > 30 * 60000) return; // só perto do horário
  let ult = 0; try { ult = Number(localStorage.getItem(AKEY)) || 0; } catch (e) { /* ignora */ }
  if (ult >= ultimoHorario) return;
  try { localStorage.setItem(AKEY, String(agora)); } catch (e) { /* ignora */ }
  avisar(ts.length === 1 ? 'Tarefa atrasada' : ts.length + ' tarefas atrasadas', ts.length === 1 ? ts[0].titulo : ts.slice(0, 3).map(t => t.titulo).join(' · ') + (ts.length > 3 ? ' …' : ''), 'atraso',
    () => { if (acoes.irAtrasadas) acoes.irAtrasadas(); });
}
function hashId(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (Math.abs(h) % 2000000000) + 1; }
let syncT;
export function agendarSincronizacao() { if (!app.nativo) return; clearTimeout(syncT); syncT = setTimeout(sincronizarAlarmes, 800); }
export function sincronizarAlarmes() { if (!app.nativo) return; try { app.nativo.agendar(JSON.stringify(lembretesFuturos())); } catch (e) { /* ignora */ } }

function avisados() { try { return JSON.parse(localStorage.getItem(NKEY)) || {}; } catch (e) { return {}; } }
// alertas que se repetem: { chave: { n: vezes que tocou, ult: último toque, ok: visto } }
const RKEY = 'agenda.repeticoes';
function repeticoes() { try { return JSON.parse(localStorage.getItem(RKEY)) || {}; } catch (e) { return {}; } }
function guardarRep(r) {
  const agora = Date.now(); for (const k in r) if (agora - r[k].ult > 4 * 864e5) delete r[k];
  try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch (e) { /* ignora */ }
}
function marcarVistoWeb(k) { const r = repeticoes(); if (r[k]) { r[k].ok = 1; guardarRep(r); } }
/** Toca de novo um alerta repetido, se já passou o intervalo e ainda não foi visto. */
function repetirSeDevido(k, rl, quando, agora, tocar) {
  const r = repeticoes(), x = r[k];
  if (!x || x.ok || x.n > MAX_REP_LEMB || agora < x.ult + rl * 60000 || agora > quando + (MAX_REP_LEMB + 1) * rl * 60000) return;
  x.n++; x.ult = agora; guardarRep(r); tocar();
}
/** Verifica lembretes que vencem agora (enquanto o app está aberto). */
export function verificar() {
  if (!app.db) return;
  const agora = Date.now(), enviados = avisados(), t0 = today(); let mudou = false;
  for (const o of ocorrencias(addDays(t0, -1), addDays(t0, 1), false)) {
    const ev = o.ev;
    if (!(ev.lembrete >= 0) || o.status) continue;
    const ini = at(o.data, o.ini).getTime(), quando = ini - ev.lembrete * 60000, k = o.chave + (o.movida ? '>' + o.data : '');
    const rl = Number(ev.repLemb) || 0;
    const tocar = () => {
      const s = servico(ev.servico), falta = Math.round((ini - Date.now()) / 60000);
      const q = falta <= 0 ? (falta < -1 ? `Começou às ${o.ini}` : 'Agora') : ev.lembrete >= 1440 && falta > 720 ? 'Amanhã às ' + o.ini : `Às ${o.ini} (em ${falta} min)`;
      avisar(evTitulo(ev, true), q + (s ? ' · ' + s.nome : '') + (ev.local ? ' · ' + ev.local : ''), k, () => acoes.abrirOcorrencia && acoes.abrirOcorrencia(ev.id, o.orig), rl ? () => marcarVistoWeb(k) : null);
    };
    if (agora >= quando && agora < (rl ? quando + (MAX_REP_LEMB + 1) * rl * 60000 : ini + 5 * 60000) && !enviados[k]) {
      enviados[k] = agora; mudou = true;
      if (rl) { const r = repeticoes(); r[k] = { n: 1, ult: agora, ok: 0 }; guardarRep(r); }
      tocar();
    } else if (rl && enviados[k]) repetirSeDevido(k, rl, quando, agora, tocar);
  }
  for (const t of app.db.tarefas) {
    if (!aberta(t) || !(t.lembrete >= 0) || !t.prazo || !t.hora) continue;
    const ini = at(t.prazo, t.hora).getTime(), quando = ini - t.lembrete * 60000, k = 't' + t.id + '@' + t.prazo + t.hora;
    const rl = Number(t.repLemb) || 0;
    const tocar = () => avisar(t.titulo, 'Tarefa · prazo ' + (t.prazo === t0 ? 'hoje' : fmtShort(t.prazo)) + ' às ' + t.hora, k, () => acoes.tarefa && acoes.tarefa({ dataset: { id: t.id } }), rl ? () => marcarVistoWeb(k) : null);
    if (agora >= quando && agora < (rl ? quando + (MAX_REP_LEMB + 1) * rl * 60000 : ini + 30 * 60000) && !enviados[k]) {
      enviados[k] = agora; mudou = true;
      if (rl) { const r = repeticoes(); r[k] = { n: 1, ult: agora, ok: 0 }; guardarRep(r); }
      tocar();
    } else if (rl && enviados[k]) repetirSeDevido(k, rl, quando, agora, tocar);
  }
  verificarAtraso(agora);
  if (mudou) {
    for (const k in enviados) if (agora - enviados[k] > 4 * 864e5) delete enviados[k];
    try { localStorage.setItem(NKEY, JSON.stringify(enviados)); } catch (e) { /* ignora */ }
  }
}
