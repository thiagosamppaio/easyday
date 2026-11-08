// Lembretes: aviso dentro do app, notificação do navegador e alarmes nativos (APK).
import { $, esc, ic, today, addDays, at, fmtShort, LEMB } from './app-util.js';
import { app, servico } from './app-dados.js';
import { ocorrencias, evTitulo, aberta } from './app-regras.js';
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
export function avisar(titulo, corpo, tag, acao) {
  const el = document.createElement('div'); el.className = 'al';
  el.innerHTML = `${ic('bell')}<div class="grow"><b>${esc(titulo)}</b><span>${esc(corpo)}</span></div><button>OK</button>`;
  el.querySelector('button').onclick = e => { e.stopPropagation(); el.remove(); };
  el.onclick = () => { el.remove(); if (acao) acao(); };
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
    const q = at(o.data, o.ini).getTime() - ev.lembrete * 60000;
    if (q <= agora || q > limite) continue;
    const s = servico(ev.servico);
    out.push({ id: hashId(o.chave + (o.movida ? '>' + o.data + o.ini : '')), quando: q, titulo: evTitulo(ev, true), texto: textoQuando(ev.lembrete, o.ini) + (s ? ' · ' + s.nome : '') + (ev.local ? ' · ' + ev.local : '') });
  }
  for (const t of app.db.tarefas) {
    if (!aberta(t) || !(t.lembrete >= 0) || !t.prazo || !t.hora) continue;
    const q = at(t.prazo, t.hora).getTime() - t.lembrete * 60000;
    if (q <= agora || q > limite) continue;
    out.push({ id: hashId('t' + t.id + '@' + t.prazo + t.hora), quando: q, titulo: t.titulo, texto: 'Tarefa · prazo ' + fmtShort(t.prazo) + ' às ' + t.hora });
  }
  return out.sort((a, b) => a.quando - b.quando).slice(0, 300);
}
function hashId(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (Math.abs(h) % 2000000000) + 1; }
let syncT;
export function agendarSincronizacao() { if (!app.nativo) return; clearTimeout(syncT); syncT = setTimeout(sincronizarAlarmes, 800); }
export function sincronizarAlarmes() { if (!app.nativo) return; try { app.nativo.agendar(JSON.stringify(lembretesFuturos())); } catch (e) { /* ignora */ } }

function avisados() { try { return JSON.parse(localStorage.getItem(NKEY)) || {}; } catch (e) { return {}; } }
/** Verifica lembretes que vencem agora (enquanto o app está aberto). */
export function verificar() {
  if (!app.db) return;
  const agora = Date.now(), enviados = avisados(), t0 = today(); let mudou = false;
  for (const o of ocorrencias(addDays(t0, -1), addDays(t0, 1), false)) {
    const ev = o.ev;
    if (!(ev.lembrete >= 0) || o.status) continue;
    const ini = at(o.data, o.ini).getTime(), quando = ini - ev.lembrete * 60000, k = o.chave + (o.movida ? '>' + o.data : '');
    if (agora >= quando && agora < ini + 5 * 60000 && !enviados[k]) {
      enviados[k] = agora; mudou = true;
      const s = servico(ev.servico);
      const q = ev.lembrete === 0 ? 'Agora' : ev.lembrete >= 1440 ? 'Amanhã às ' + o.ini : `Às ${o.ini} (em ${Math.max(0, Math.round((ini - agora) / 60000))} min)`;
      avisar(evTitulo(ev, true), q + (s ? ' · ' + s.nome : '') + (ev.local ? ' · ' + ev.local : ''), k, () => acoes.abrirOcorrencia && acoes.abrirOcorrencia(ev.id, o.orig));
    }
  }
  for (const t of app.db.tarefas) {
    if (!aberta(t) || !(t.lembrete >= 0) || !t.prazo || !t.hora) continue;
    const ini = at(t.prazo, t.hora).getTime(), quando = ini - t.lembrete * 60000, k = 't' + t.id + '@' + t.prazo + t.hora;
    if (agora >= quando && agora < ini + 30 * 60000 && !enviados[k]) {
      enviados[k] = agora; mudou = true;
      avisar(t.titulo, 'Tarefa · prazo ' + (t.prazo === t0 ? 'hoje' : fmtShort(t.prazo)) + ' às ' + t.hora, k, () => acoes.tarefa && acoes.tarefa({ dataset: { id: t.id } }));
    }
  }
  if (mudou) {
    for (const k in enviados) if (agora - enviados[k] > 4 * 864e5) delete enviados[k];
    try { localStorage.setItem(NKEY, JSON.stringify(enviados)); } catch (e) { /* ignora */ }
  }
}
