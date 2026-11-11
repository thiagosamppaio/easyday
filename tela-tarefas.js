// Tarefas: lista agrupada, filtros, detalhe com status, subtarefas, adiamento e histórico.
import { esc, ic, uid, today, addDays, fmtShort, fmtRel, proximaSegunda, LEMB, REP_LEMB, campoRepLemb, PRIO, STATUS, plural } from './app-util.js';
import { app, salvar, servico, tocar, marcarDesfazer, registrarExclusao } from './app-dados.js';
import { aberta, atrasada, ordTarefa, hist, definirStatus, definirPrazo, passaFiltroTarefa, categorias, passaFiltro } from './app-regras.js';
import { acoes, forms, telas, aoMudar, abrirFolha, fecharFolha, cabecalho, aviso, chips, linhaTarefa, vazio, opcoesServico, campoNovoServico, servicoDoForm, cabecalhoTela, sheetAberta } from './app-ui.js';
import { pedirPermissao } from './app-notif.js';

const st = () => app.st;
const PERIODOS = { '': 'Qualquer período', atrasadas: 'Atrasadas', hoje: 'Hoje', '7': 'Próximos 7 dias', '30': 'Próximos 30 dias', semprazo: 'Sem prazo' };

function render() {
  const f = st().tf, t0 = today();
  const nFiltros = [f.prio, f.cat, f.periodo].filter(Boolean).length;
  const seg = `<div class="seg">${[['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['canceladas', 'Canceladas']].map(([k, v]) => `<label><input type="radio" name="tfStatus" data-act="tfStatus" value="${k}" ${f.status === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`;
  const filtroBtn = `<button class="iconbtn ${nFiltros ? 'ativo' : ''}" data-act="tfFiltros" aria-label="Filtros">${ic('filter')}${nFiltros ? `<i class="badge">${nFiltros}</i>` : ''}</button>`;
  const ts = app.db.tarefas.filter(t => passaFiltroTarefa(t, f, t0));
  let corpo = '';
  if (f.status === 'abertas') {
    const atr = ts.filter(t => atrasada(t, t0)).sort(ordTarefa);
    const grupos = [
      ['Atrasadas', atr],
      ['Hoje', ts.filter(t => t.prazo === t0).sort(ordTarefa)],
      ['Próximos 7 dias', ts.filter(t => t.prazo > t0 && t.prazo <= addDays(t0, 7)).sort(ordTarefa)],
      ['Mais adiante', ts.filter(t => t.prazo > addDays(t0, 7)).sort(ordTarefa)],
      ['Sem prazo', ts.filter(t => !t.prazo).sort((a, b) => (a.prio === 'alta' ? 0 : 1) - (b.prio === 'alta' ? 0 : 1) || (b.criadoEm || 0) - (a.criadoEm || 0))],
    ];
    corpo = (atr.length > 1 ? `<button class="banner" data-act="tfMoverAtrasadas">${ic('move')}<span>Mover as <b>${atr.length}</b> atrasadas para hoje</span></button>` : '')
      + (grupos.filter(g => g[1].length).map(([n, l]) => `<h2>${n} <span class="cnt">${l.length}</span></h2><div class="list">${l.map(linhaTarefa).join('')}</div>`).join('')
      || vazio(nFiltros ? 'Nada com esses filtros' : 'Tudo em dia', nFiltros ? 'Ajuste ou limpe os filtros.' : 'Toque no + para criar uma tarefa.'));
  } else {
    const l = ts.sort((a, b) => (b.concluidaEm || b.atualizadoEm || 0) - (a.concluidaEm || a.atualizadoEm || 0)).slice(0, 100);
    corpo = l.length ? `<div class="list top">${l.map(linhaTarefa).join('')}</div>` : vazio('Nada por aqui', f.status === 'concluidas' ? 'As tarefas concluídas aparecem aqui.' : 'As tarefas canceladas aparecem aqui.');
  }
  return `${cabecalhoTela(plural(app.db.tarefas.filter(t => aberta(t) && passaFiltro(t)).length, 'aberta'), 'Tarefas', filtroBtn)}<div class="toolbar">${seg}</div>${chips()}${resumoFiltros()}${corpo}`;
}
function resumoFiltros() {
  const f = st().tf, p = [];
  if (f.prio) p.push('Prioridade ' + PRIO[f.prio].toLowerCase());
  if (f.cat) p.push(esc(f.cat));
  if (f.periodo) p.push(PERIODOS[f.periodo]);
  return p.length ? `<div class="filtros-ativos">${p.join(' · ')} <button data-act="tfLimpar">Limpar</button></div>` : '';
}
telas.tarefas = { render };

acoes.tfStatus = el => { st().tf.status = el.value; app.render(); };
acoes.irAtrasadas = () => { Object.assign(st().tf, { status: 'abertas', prio: '', cat: '', periodo: 'atrasadas' }); st().tab = 'tarefas'; if (sheetAberta()) fecharFolha(); app.render(); scrollTo(0, 0); };
acoes.tfLimpar = () => { Object.assign(st().tf, { prio: '', cat: '', periodo: '' }); app.render(); };
acoes.tfFiltros = () => {
  const f = st().tf, cats = categorias();
  abrirFolha(cabecalho('Filtrar tarefas') + `<form data-form="tfFiltros">
  <div class="f"><label class="l">Prioridade</label><select class="in" name="prio"><option value="">Todas</option>${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${f.prio === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="f"><label class="l">Categoria</label><select class="in" name="cat"><option value="">Todas</option>${cats.map(c => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${cats.length ? '' : '<div class="hint">Nenhuma categoria usada ainda. Defina ao editar uma tarefa.</div>'}</div>
  <div class="f"><label class="l">Período (pelo prazo)</label><select class="in" name="periodo">${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${f.periodo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <p class="hint">Para filtrar por serviço, use os botões coloridos acima da lista.</p>
  <div class="btns h"><button class="btn" type="button" data-act="tfLimparFechar">Limpar</button><button class="btn pri" type="submit">Aplicar</button></div></form>`);
};
acoes.tfLimparFechar = () => { acoes.tfLimpar(); fecharFolha(); };
forms.tfFiltros = f => { Object.assign(st().tf, { prio: f.prio.value, cat: f.cat.value, periodo: f.periodo.value }); fecharFolha(); app.render(); };
acoes.tfMoverAtrasadas = () => {
  const t0 = today(), l = app.db.tarefas.filter(t => atrasada(t, t0) && passaFiltro(t));
  if (!l.length) return;
  marcarDesfazer();
  l.forEach(t => definirPrazo(t, t0));
  salvar(); app.render(); aviso(plural(l.length, 'tarefa movida', 'tarefas movidas') + ' para hoje', true);
};

// ---------- concluir / reabrir ----------
acoes.tarefaConcluir = el => {
  const t = app.db.tarefas.find(x => x.id === el.dataset.id); if (!t) return;
  definirStatus(t, t.status === 'concluida' ? 'pendente' : 'concluida');
  salvar(); app.render();
  if (sheetAberta()) detalheTarefa(t.id);
  aviso(t.status === 'concluida' ? 'Concluída' : 'Reaberta', t.status === 'concluida');
};

// ---------- formulário ----------
export function formTarefa(base = {}) {
  const novo = !base.id;
  const t = Object.assign({ titulo: '', servico: st().filtro || '', categoria: '', prazo: '', hora: '', prio: 'media', lembrete: app.db.cfg.lembretePadrao.tarefa ?? 15, notas: '' }, base);
  const cats = categorias();
  abrirFolha(cabecalho(novo ? 'Nova tarefa' : 'Editar tarefa') + `
  <form data-form="tarefa" data-id="${t.id || ''}">
  <div class="f"><label class="l">Tarefa</label><input class="in" name="titulo" value="${esc(t.titulo)}" placeholder="O que precisa ser feito?" maxlength="140" required ${novo ? 'autofocus' : ''}></div>
  <div class="f g2"><div><label class="l">Serviço</label><select class="in" name="servico" data-novopara="servico">${opcoesServico(t.servico)}</select></div>
  <div><label class="l">Categoria</label><input class="in" name="categoria" value="${esc(t.categoria)}" list="listaCat" placeholder="Opcional" maxlength="40"><datalist id="listaCat">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></div>${campoNovoServico}
  <div class="f g2"><div><label class="l">Prazo</label><input class="in" type="date" name="prazo" value="${t.prazo}"></div><div><label class="l">Horário</label><input class="in" type="time" name="hora" value="${t.hora}"></div></div>
  <div class="f"><label class="l">Prioridade</label><div class="seg">${Object.entries(PRIO).map(([k, v]) => `<label><input type="radio" name="prio" value="${k}" ${t.prio === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
  <div class="f"><label class="l">Lembrete</label><select class="in" name="lembrete">${Object.entries(LEMB).map(([k, v]) => `<option value="${k}" ${String(t.lembrete) === k ? 'selected' : ''}>${v}</option>`).join('')}</select><div class="hint">O lembrete precisa de prazo e horário.</div></div>
  ${campoRepLemb(t.repLemb)}
  ${novo ? `<div class="f"><label class="l">Subtarefas</label><textarea class="in" name="subs" placeholder="Uma por linha (opcional)" maxlength="2000"></textarea></div>` : ''}
  <div class="f"><label class="l">Anotações</label><textarea class="in" name="notas" maxlength="3000" placeholder="Opcional">${esc(t.notas)}</textarea></div>
  <div class="btns"><button class="btn pri" type="submit">Salvar</button></div></form>`);
}
forms.tarefa = f => {
  const fd = new FormData(f), g = k => (fd.get(k) || '').toString().trim();
  if (!g('titulo')) return aviso('Escreva a tarefa');
  const sv = servicoDoForm(fd); if (sv === null) return;
  const prazo = g('prazo');
  const dados = { titulo: g('titulo'), servico: sv, categoria: g('categoria'), hora: prazo ? g('hora') : '', prio: g('prio') || 'media', lembrete: Number(g('lembrete')), repLemb: Number(g('repLemb')) || 0, notas: g('notas') };
  const id = f.dataset.id;
  let t;
  if (id) {
    t = app.db.tarefas.find(x => x.id === id);
    const mud = [];
    if (t.titulo !== dados.titulo) mud.push('título');
    if ((t.prio || 'media') !== dados.prio) mud.push('prioridade ' + PRIO[dados.prio].toLowerCase());
    if ((t.servico || '') !== dados.servico) mud.push('serviço');
    if ((t.categoria || '') !== dados.categoria) mud.push('categoria');
    Object.assign(t, dados);
    definirPrazo(t, prazo);
    if (mud.length) hist(t, 'Editada: ' + mud.join(', '));
    tocar(t);
  } else {
    const subs = g('subs').split('\n').map(s => s.trim()).filter(Boolean).map(titulo => ({ id: uid(), titulo, feita: false }));
    t = tocar(Object.assign({ id: uid(), status: 'pendente', concluidaEm: null, subtarefas: subs, historico: [], prazo }, dados));
    hist(t, 'Criada');
    app.db.tarefas.push(t);
  }
  salvar(); fecharFolha(); app.render(); aviso('Salvo');
  if (t.lembrete >= 0 && t.prazo && t.hora) pedirPermissao(true);
};
acoes.tarefaNova = () => formTarefa({ prazo: st().tab === 'agenda' && st().dia !== today() ? st().dia : '' });
acoes.tarefaEditar = el => formTarefa(Object.assign({}, app.db.tarefas.find(x => x.id === el.dataset.id)));

// ---------- detalhe ----------
const fmtHist = ms => { const d = new Date(ms); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
export function detalheTarefa(id) {
  const t = app.db.tarefas.find(x => x.id === id); if (!t) return;
  const s = servico(t.servico), t0 = today(), late = atrasada(t, t0);
  const subs = t.subtarefas || [], ok = subs.filter(x => x.feita).length;
  abrirFolha(cabecalho('Tarefa') + `
  <div class="card det" style="--c:${s ? s.cor : 'var(--line)'}">
   <div class="det-t ${t.status === 'concluida' || t.status === 'cancelada' ? 'riscado' : ''}">${esc(t.titulo)}</div>
   <div class="dl">
    ${t.prazo ? `<div>${ic('cal')}<span class="${late ? 'late' : ''}">${fmtRel(t.prazo)}${t.hora ? ' às ' + t.hora : ''}${late ? ' · atrasada' : ''}</span></div>` : `<div>${ic('cal')}<span class="sub">Sem prazo</span></div>`}
    <div>${ic('zap')}<span>Prioridade ${PRIO[t.prio || 'media'].toLowerCase()}</span></div>
    ${s ? `<div>${ic('tag')}<span>${esc(s.nome)}${t.categoria ? ' · ' + esc(t.categoria) : ''}</span></div>` : t.categoria ? `<div>${ic('tag')}<span>${esc(t.categoria)}</span></div>` : ''}
    ${t.lembrete >= 0 && t.prazo && t.hora ? `<div>${ic('bell')}<span>${LEMB[String(t.lembrete)]}${t.repLemb ? ' · repete ' + REP_LEMB[String(t.repLemb)].toLowerCase() : ''}</span></div>` : ''}
    ${t.notas ? `<div>${ic('note')}<span class="pre">${esc(t.notas)}</span></div>` : ''}
   </div></div>
  <h2>Status</h2><div class="stset s4">${Object.entries(STATUS).map(([k, v]) => `<button class="${k} ${t.status === k ? 'on' : ''}" data-act="tarefaStatus" data-id="${t.id}" data-st="${k}">${v}</button>`).join('')}</div>
  <h2>Subtarefas ${subs.length ? `<span class="cnt">${ok}/${subs.length}</span>` : ''}</h2>
  <div class="card subs">${subs.map(x => `<div class="sub-i ${x.feita ? 'feita' : ''}"><button class="chk sm ${x.feita ? 'on' : ''}" data-act="subMarcar" data-id="${t.id}" data-sub="${x.id}" aria-label="Marcar"><i>${ic('check')}</i></button><span class="grow">${esc(x.titulo)}</span><button class="x sm" data-act="subExcluir" data-id="${t.id}" data-sub="${x.id}" aria-label="Remover">${ic('x')}</button></div>`).join('')}
  <form data-form="subtarefa" data-id="${t.id}" class="sub-add"><input class="in" name="titulo" placeholder="Adicionar subtarefa" maxlength="140" autocomplete="off"><button class="btn sm" type="submit" aria-label="Adicionar">${ic('plus')}</button></form></div>
  ${aberta(t) ? `<h2>Adiar / reagendar</h2><div class="chips nowrap">${[['Hoje', t0], ['Amanhã', addDays(t0, 1)], ['Próx. segunda', proximaSegunda(t0)], ['+1 semana', addDays(t.prazo && t.prazo > t0 ? t.prazo : t0, 7)]].map(([n, d]) => `<button class="chip ${t.prazo === d ? 'on' : ''}" data-act="tarefaAdiar" data-id="${t.id}" data-data="${d}">${n}</button>`).join('')}
   <label class="chip">${ic('cal')}Escolher<input type="date" class="oculto" data-adiar="${t.id}" value="${t.prazo || ''}"></label></div>` : ''}
  <div class="btns h"><button class="btn" data-act="tarefaEditar" data-id="${t.id}">Editar</button><button class="btn dan" data-act="tarefaExcluir" data-id="${t.id}">Excluir</button></div>
  ${t.historico && t.historico.length ? `<details class="hist"><summary>${ic('hist')}Histórico de alterações (${t.historico.length})</summary>${t.historico.map(h => `<div class="mini"><span>${esc(h.txt)}</span><span class="sub">${fmtHist(h.em)}</span></div>`).join('')}</details>` : ''}`);
}
acoes.tarefa = el => detalheTarefa(el.dataset.id);
const achar = el => app.db.tarefas.find(x => x.id === el.dataset.id);
acoes.tarefaStatus = el => { const t = achar(el); definirStatus(t, el.dataset.st); salvar(); app.render(); detalheTarefa(t.id); };
acoes.tarefaAdiar = el => { const t = achar(el); definirPrazo(t, el.dataset.data); tocar(t); salvar(); app.render(); detalheTarefa(t.id); aviso('Prazo: ' + fmtRel(el.dataset.data).toLowerCase()); };
aoMudar.push(el => { if (el.dataset && el.dataset.adiar && el.value) { const t = app.db.tarefas.find(x => x.id === el.dataset.adiar); definirPrazo(t, el.value); tocar(t); salvar(); app.render(); detalheTarefa(t.id); aviso('Prazo: ' + fmtShort(el.value)); } });
acoes.tarefaExcluir = el => {
  const t = achar(el); if (!t) return;
  marcarDesfazer();
  app.db.tarefas = app.db.tarefas.filter(x => x !== t); registrarExclusao('tarefa', t.id);
  salvar(); fecharFolha(); app.render(); aviso('Tarefa excluída', true);
};
forms.subtarefa = f => {
  const t = app.db.tarefas.find(x => x.id === f.dataset.id), titulo = f.titulo.value.trim(); if (!titulo) return;
  t.subtarefas.push({ id: uid(), titulo, feita: false }); hist(t, 'Subtarefa adicionada: ' + titulo);
  salvar(); app.render(); detalheTarefa(t.id);
  setTimeout(() => { const i = document.querySelector('.sub-add input'); if (i) i.focus(); }, 50);
};
acoes.subMarcar = el => {
  const t = achar(el), s = t.subtarefas.find(x => x.id === el.dataset.sub); s.feita = !s.feita;
  if (s.feita) hist(t, 'Subtarefa concluída: ' + s.titulo); else tocar(t);
  if (s.feita && t.status === 'pendente') definirStatus(t, 'andamento');
  salvar(); app.render(); detalheTarefa(t.id);
  if (s.feita && t.subtarefas.every(x => x.feita) && aberta(t)) aviso('Todas as subtarefas concluídas. Marque a tarefa como concluída quando quiser.');
};
acoes.subExcluir = el => { const t = achar(el); const s = t.subtarefas.find(x => x.id === el.dataset.sub); t.subtarefas = t.subtarefas.filter(x => x !== s); hist(t, 'Subtarefa removida: ' + s.titulo); salvar(); app.render(); detalheTarefa(t.id); };
