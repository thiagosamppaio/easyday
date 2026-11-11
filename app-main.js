// Inicialização, navegação e eventos globais.
import { $, ic, today, TEMAS } from './app-util.js';
import { app, carregar } from './app-dados.js';
import { acoes, forms, telas, aoMudar, aoDigitar, sheetAberta, fecharFolha, aviso } from './app-ui.js';
import { verificar, agendarSincronizacao, sincronizarAlarmes, definirSW } from './app-notif.js';
import { abrirCaptura } from './tela-inicio.js';
import './tela-agenda.js';
import './tela-tarefas.js';
import './tela-pacientes.js';
import './tela-servicos.js';
import './tela-busca.js';
import { formNome, importarArquivo, instalacao } from './tela-mais.js';

const NAV = [['inicio', 'home', 'Início'], ['agenda', 'cal', 'Agenda'], ['tarefas', 'tasks', 'Tarefas'], ['mais', 'more', 'Mais']];

/** Aplica o tema escolhido (cores) à página e à barra do navegador. */
function aplicarTema() {
  const t = TEMAS[app.db.cfg.tema] ? app.db.cfg.tema : 'classico', h = document.documentElement;
  if (t === 'classico') delete h.dataset.tema; else h.dataset.tema = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = TEMAS[t].cores[1];
}
function render() {
  aplicarTema();
  const st = app.st, tela = telas[st.tab] || telas.inicio;
  $('#main').innerHTML = tela.render();
  const aba = tela.aba || st.tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === aba));
  $('#fab').style.display = tela.fab === null ? 'none' : '';
  if (tela.depois) tela.depois();
}
app.render = render;
window.__agenda = app; // facilita testes e diagnóstico
app.aposSalvar = agendarSincronizacao;
app.erroSalvar = () => aviso('Não foi possível salvar. Exporte um backup.');

acoes.tab = el => {
  app.st.tab = el.dataset.tab; app.st.busca = '';
  if (sheetAberta()) fecharFolha();
  render(); scrollTo(0, 0);
};

// ---------- eventos globais ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = acoes[el.dataset.act];
  if (fn) { if (el.tagName === 'A' || el.type === 'button' || el.tagName === 'BUTTON' && !el.form) e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.novopara) {
    const f = el.form, box = f && f.querySelector(`[data-novo="${el.dataset.novopara}"]`);
    if (box) { box.classList.toggle('on', el.value === '__novo'); if (el.value === '__novo') box.querySelector('input').focus(); }
  }
  for (const fn of aoMudar) { try { fn(el, e); } catch (err) { console.error(err); } }
});
document.addEventListener('input', e => { for (const fn of aoDigitar) { try { fn(e.target, e); } catch (err) { console.error(err); } } });
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, fn = forms[f.dataset.form];
  if (fn) { try { fn(f, e.submitter); } catch (err) { console.error(err); aviso('Algo deu errado. Tente de novo.'); } }
});
$('#arquivoImport').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) importarArquivo(file); });

// deslizar para o lado muda o dia/semana/mês na agenda
let tx = null, ty = null;
$('#main').addEventListener('touchstart', e => { if (sheetAberta() || !telas[app.st.tab].swipe) return; tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
$('#main').addEventListener('touchend', e => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && !e.target.closest('.chips')) telas[app.st.tab].swipe(dx < 0 ? 1 : -1);
}, { passive: true });

addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalacao.evento = e; if (app.st.tab === 'mais') render(); });

// ---------- início ----------
async function iniciar() {
  document.querySelector('#nav div').innerHTML = NAV.map(([t, i, n]) => `<button data-act="tab" data-tab="${t}">${ic(i)}<span>${n}</span></button>`).join('');
  $('#fab').innerHTML = ic('plus');
  $('#fab').addEventListener('click', () => { const t = telas[app.st.tab]; if (t && t.fab) t.fab(); else abrirCaptura(); });
  const origem = await carregar();
  document.body.classList.remove('carregando');
  render();
  verificar(); sincronizarAlarmes();
  if (origem === 'v1') aviso('Seus dados foram migrados para a nova versão');
  if (!app.db.cfg.boas) setTimeout(formNome, 300);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    verificar(); sincronizarAlarmes();
    if (!sheetAberta() && (app.st.tab === 'inicio' || app.st.tab === 'agenda')) render();
  });
  let diaAtual = today();
  setInterval(() => {
    verificar();
    const t = today();
    if (t !== diaAtual) { if (app.st.dia === diaAtual) app.st.dia = t; diaAtual = t; if (!sheetAberta()) render(); }
  }, 20000);

  if (!app.nativo && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(r => definirSW(r)).catch(() => {});
    navigator.serviceWorker.ready.then(r => definirSW(r)).catch(() => {});
  }
}
iniciar().catch(err => {
  console.error(err);
  document.body.classList.remove('carregando');
  $('#main').innerHTML = '<div class="empty"><b>Não foi possível abrir o EasyDay</b>Feche e abra o app de novo. Se continuar, avise o desenvolvedor.</div>';
});
