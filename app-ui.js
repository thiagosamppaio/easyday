// Componentes de interface compartilhados: registro de ações, folha inferior, avisos, chips e cartões.
import { $, esc, ic, uid, today, fmtRel, fmtShort, ESFERA, PRIO, STATUS, STL, TIPO, CORES } from './app-util.js';
import { app, servico, salvar, desfazer, tocar } from './app-dados.js';
import { servicosVisiveis, evTitulo, atrasada } from './app-regras.js';

/** Registros preenchidos pelos módulos de tela. */
export const acoes = {};      // data-act="nome"  -> fn(elemento, evento)
export const forms = {};      // data-form="nome" -> fn(form)
export const telas = {};      // st.tab -> { titulo, render() , depois?() }
export const aoMudar = [];    // fn(elemento, evento) para eventos 'change'
export const aoDigitar = [];  // fn(elemento, evento) para eventos 'input'

// ---------- folha inferior ----------
let aberta = false;
export const sheetAberta = () => aberta;
export function abrirFolha(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheetWrap').classList.add('on');
  if (!aberta) history.pushState({ folha: 1 }, '');
  aberta = true;
  $('.sheet').scrollTop = 0;
  const foco = $('#sheetBody [autofocus]'); if (foco) setTimeout(() => foco.focus(), 260);
}
export function fecharFolha(porVoltar) {
  if (!aberta) return;
  aberta = false;
  $('#sheetWrap').classList.remove('on');
  if (!porVoltar) history.back();
}
addEventListener('popstate', () => { if (aberta) fecharFolha(true); });
export const cabecalho = (t, extra = '') => `<div class="sh-t"><h3>${t}</h3>${extra || '<button class="x" data-act="fechar">Fechar</button>'}</div>`;

// ---------- aviso rápido (com "Desfazer" opcional) ----------
let tt;
export function aviso(msg, comDesfazer) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${comDesfazer ? '<button data-act="desfazer">Desfazer</button>' : ''}`;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), comDesfazer ? 5000 : 1900);
}
acoes.desfazer = () => { if (desfazer()) { $('#toast').classList.remove('on'); app.render(); aviso('Ação desfeita'); } };
acoes.fechar = () => fecharFolha();

// ---------- serviços ----------
export const corServico = id => { const s = servico(id); return s ? s.cor : 'var(--line)'; };
export function criarServico(nome, esfera = 'profissional') {
  const usadas = app.db.servicos.map(c => c.cor);
  const s = tocar({ id: uid(), nome, esfera, arquivado: false, cor: CORES.find(x => !usadas.includes(x)) || CORES[app.db.servicos.length % CORES.length] });
  app.db.servicos.push(s);
  return s;
}
export const opcoesServico = sel => `<option value="">Sem serviço</option>${app.db.servicos.filter(s => !s.arquivado || s.id === sel).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}${c.esfera === 'pessoal' ? ' (pessoal)' : ''}</option>`).join('')}<option value="__novo">+ Novo serviço…</option>`;
export const campoNovoServico = `<div class="f so-novo" data-novo="servico"><input class="in" name="servicoNovo" placeholder="Nome do novo serviço" maxlength="50"></div>`;
/** Resolve o campo "servico" de um formulário, criando o serviço se for "+ Novo". Retorna null se faltou nome. */
export function servicoDoForm(fd) {
  const v = (fd.get('servico') || '').toString();
  if (v !== '__novo') return v;
  const n = (fd.get('servicoNovo') || '').toString().trim();
  if (!n) { aviso('Dê um nome ao novo serviço'); return null; }
  return criarServico(n).id;
}

/** Linha de filtros: esfera (pessoal/profissional) + serviços. */
export function chips() {
  const db = app.db, e = db.cfg.esfera;
  const temAmbas = db.servicos.some(s => s.esfera === 'pessoal') && db.servicos.some(s => s.esfera === 'profissional');
  const svs = servicosVisiveis();
  if (!svs.length && !temAmbas) return '';
  const esf = temAmbas ? `<button class="chip esf ${e ? 'on' : ''}" data-act="esfera" title="Alternar entre todas, profissional e pessoal">${ic('layers')}${e ? ESFERA[e] : 'Tudo'}</button>` : '';
  return `<div class="chips">${esf}<button class="chip ${!app.st.filtro ? 'on' : ''}" data-act="filtro" data-id="">Todos</button>${svs.map(c => `<button class="chip ${app.st.filtro === c.id ? 'on' : ''}" data-act="filtro" data-id="${c.id}" style="--c:${c.cor}"><i></i>${esc(c.nome)}</button>`).join('')}</div>`;
}
acoes.filtro = el => { app.st.filtro = el.dataset.id; app.render(); };
acoes.esfera = () => {
  const ordem = ['', 'profissional', 'pessoal'];
  app.db.cfg.esfera = ordem[(ordem.indexOf(app.db.cfg.esfera) + 1) % 3];
  const s = servico(app.st.filtro); if (s && app.db.cfg.esfera && s.esfera !== app.db.cfg.esfera) app.st.filtro = '';
  salvar(); app.render();
  aviso(app.db.cfg.esfera ? 'Mostrando só ' + ESFERA[app.db.cfg.esfera].toLowerCase() : 'Mostrando tudo');
};

// ---------- cartões ----------
/** Cartão de uma ocorrência de compromisso. */
export function cartaoOcorrencia(o, conflitos, opts = {}) {
  const ev = o.ev, s = servico(ev.servico);
  const meta = [ev.tipo !== 'compromisso' ? TIPO[ev.tipo] : '', s ? esc(s.nome) : '', ev.local ? esc(ev.local) : ''].filter(Boolean).join(' · ');
  const conf = conflitos && conflitos.has(o.chave) && o.status !== 'desmarcou';
  return `<button class="card ev ${o.status === 'desmarcou' ? 'off' : ''}" data-act="ocorrencia" data-id="${ev.id}" data-orig="${o.orig}" style="--c:${s ? s.cor : 'var(--line)'}">
  <div class="time"><b>${o.ini}</b><span>${o.fim || ''}</span></div>
  <div class="body"><div class="t">${esc(evTitulo(ev))}</div><div class="meta">${opts.data ? `<span>${fmtRel(o.data)}</span>${meta ? ' · ' : ''}` : ''}${meta}${ev.rep !== 'nao' ? ic('rep') : ''}${ev.lembrete >= 0 ? ic('bell') : ''}${o.movida ? '<span class="pill">remarcado</span>' : ''}</div></div>
  ${conf ? `<span class="warn" title="Conflito de horário">${ic('alert')}</span>` : ''}
  ${o.status ? `<span class="st st-${o.status}">${STL[o.status]}</span>` : ''}</button>`;
}
/** Linha de tarefa com caixa de conclusão. */
export function linhaTarefa(t) {
  const s = servico(t.servico), t0 = today(), late = atrasada(t, t0);
  const sub = (t.subtarefas || []).length;
  const subOk = (t.subtarefas || []).filter(x => x.feita).length;
  const fechada = t.status === 'concluida' || t.status === 'cancelada';
  const meta = [
    t.prio === 'alta' ? '<i class="prio"></i> Alta' : '',
    t.status === 'andamento' ? '<span class="pill and">Em andamento</span>' : '',
    t.status === 'cancelada' ? '<span class="pill">Cancelada</span>' : '',
    s ? esc(s.nome) : '',
    t.categoria ? esc(t.categoria) : '',
    t.prazo ? `<span class="${late ? 'late' : ''}">${fmtRel(t.prazo)}${t.hora ? ' ' + t.hora : ''}</span>` : '',
    sub ? `${ic('tasks')}${subOk}/${sub}` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="card trow ${fechada ? 'done' : ''}" style="--c:${s ? s.cor : 'transparent'}"><button class="chk ${t.status === 'concluida' ? 'on' : ''}" data-act="tarefaConcluir" data-id="${t.id}" aria-label="${t.status === 'concluida' ? 'Reabrir' : 'Concluir'}"><i>${ic('check')}</i></button>
  <button class="tb" data-act="tarefa" data-id="${t.id}"><div class="t">${esc(t.titulo)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</button></div>`;
}
export const vazio = (titulo, texto) => `<div class="empty"><b>${titulo}</b>${texto}</div>`;
export function saudacao() {
  const h = new Date().getHours();
  return (h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (app.db.nome ? ', ' + esc(app.db.nome) : '');
}
export const cabecalhoTela = (sub, titulo, extra = '') => `<div class="hd"><div class="grow"><div class="sub">${sub}</div><h1 class="cap">${titulo}</h1></div>${extra}<button class="iconbtn" data-act="buscaAbrir" aria-label="Buscar">${ic('search')}</button></div>`;
export { PRIO, STATUS, fmtShort };
