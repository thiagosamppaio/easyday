// Serviços e frentes de atuação: cadastro, esfera (pessoal/profissional), cor e visão de cada frente.
import { esc, ic, today, addDays, fmtShort, fmtRel, CORES, ESFERA, MODELOS_SERVICO, norm, plural } from './app-util.js';
import { app, salvar, servico, tocar, marcarDesfazer, registrarExclusao } from './app-dados.js';
import { ocorrenciasDe, aberta, ordTarefa, atrasada } from './app-regras.js';
import { acoes, forms, telas, abrirFolha, fecharFolha, cabecalho, aviso, vazio, cabecalhoTela, linhaTarefa, cartaoOcorrencia, criarServico } from './app-ui.js';

function contagens(id) {
  const t0 = today();
  const evs = app.db.eventos.filter(e => e.servico === id);
  return {
    abertas: app.db.tarefas.filter(t => t.servico === id && aberta(t)).length,
    atrasadas: app.db.tarefas.filter(t => t.servico === id && atrasada(t, t0)).length,
    proximos: ocorrenciasDe(evs, t0, addDays(t0, 7)).length,
  };
}
function render() {
  const grupos = ['profissional', 'pessoal'].map(e => [e, app.db.servicos.filter(s => (s.esfera || 'profissional') === e && !s.arquivado)]);
  const arq = app.db.servicos.filter(s => s.arquivado);
  const existentes = new Set(app.db.servicos.map(s => norm(s.nome)));
  const modelos = MODELOS_SERVICO.filter(m => !existentes.has(norm(m.nome)));
  const linha = s => { const c = contagens(s.id); return `<button class="item" data-act="servico" data-id="${s.id}"><i class="sw" style="--c:${s.cor}"></i><div class="grow"><div class="t">${esc(s.nome)}</div><div class="meta">${[c.abertas ? plural(c.abertas, 'tarefa aberta', 'tarefas abertas') : '', c.atrasadas ? `<span class="late">${c.atrasadas} atrasada${c.atrasadas > 1 ? 's' : ''}</span>` : '', c.proximos ? `${c.proximos} compr. em 7 dias` : ''].filter(Boolean).join(' · ') || 'Sem pendências'}</div></div>${ic('r')}</button>`; };
  return `<button class="voltar" data-act="tab" data-tab="mais">${ic('l')}Mais</button>
  ${cabecalhoTela('Frentes de atuação', 'Serviços')}
  ${grupos.map(([e, l]) => l.length ? `<h2>${ESFERA[e]}</h2><div class="sec">${l.map(linha).join('')}</div>` : '').join('')}
  ${!app.db.servicos.length ? vazio('Nenhum serviço ainda', 'Crie suas frentes de atuação para separar e colorir compromissos e tarefas.') : ''}
  <div class="btns"><button class="btn pri" data-act="servicoNovo">${ic('plus')}Novo serviço</button></div>
  ${modelos.length ? `<h2>Sugestões (toque para adicionar)</h2><div class="chips wrap">${modelos.map(m => `<button class="chip" data-act="servicoModelo" data-nome="${esc(m.nome)}" data-esfera="${m.esfera}">${ic('plus')}${esc(m.nome)}</button>`).join('')}</div>` : ''}
  ${arq.length ? `<h2>Arquivados</h2><div class="sec">${arq.map(linha).join('')}</div>` : ''}
  <p class="note">A esfera (profissional ou pessoal) permite ver só um lado da vida de cada vez: use o botão <b>Tudo / Profissional / Pessoal</b> acima dos filtros.</p>`;
}
telas.servicos = { render, fab: () => formServico({}), aba: 'mais' };

acoes.servicoModelo = el => { const s = criarServico(el.dataset.nome, el.dataset.esfera); salvar(); app.render(); aviso(s.nome + ' adicionado'); };
acoes.servicoNovo = () => formServico({});
acoes.servicoEditar = el => formServico(Object.assign({}, servico(el.dataset.id)));

export function formServico(base) {
  const novo = !base.id;
  const s = Object.assign({ nome: '', esfera: 'profissional', cor: CORES.find(x => !app.db.servicos.map(k => k.cor).includes(x)) || CORES[0], arquivado: false }, base);
  abrirFolha(cabecalho(novo ? 'Novo serviço' : 'Editar serviço') + `
  <form data-form="servico" data-id="${s.id || ''}">
  <div class="f"><label class="l">Nome</label><input class="in" name="nome" value="${esc(s.nome)}" placeholder="Ex.: Coordenação de Saúde Mental" maxlength="50" required ${novo ? 'autofocus' : ''}></div>
  <div class="f"><label class="l">Esfera</label><div class="seg">${Object.entries(ESFERA).map(([k, v]) => `<label><input type="radio" name="esfera" value="${k}" ${s.esfera === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
  <div class="f"><label class="l">Cor</label><div class="swatches">${CORES.map(k => `<label><input type="radio" name="cor" value="${k}" ${k === s.cor ? 'checked' : ''}><span style="--c:${k}"></span></label>`).join('')}</div></div>
  ${!novo ? `<div class="f sec"><div class="item"><div class="grow"><div class="t">Arquivado</div><div class="meta">Some dos filtros e das listas de escolha</div></div><label class="tog"><input type="checkbox" name="arquivado" ${s.arquivado ? 'checked' : ''}><span></span></label></div></div>` : ''}
  <div class="btns"><button class="btn pri" type="submit">Salvar</button>${!novo ? `<button class="btn dan" type="button" data-act="servicoExcluir" data-id="${s.id}">Excluir serviço</button>` : ''}</div></form>`);
}
forms.servico = f => {
  const fd = new FormData(f), nome = (fd.get('nome') || '').toString().trim(); if (!nome) return aviso('Dê um nome');
  const id = f.dataset.id, dados = { nome, cor: fd.get('cor') || CORES[0], esfera: fd.get('esfera') || 'profissional' };
  if (id) { const s = servico(id); Object.assign(s, dados, { arquivado: !!fd.get('arquivado') }); tocar(s); if (s.arquivado && app.st.filtro === s.id) app.st.filtro = ''; salvar(); app.render(); detalheServico(id); }
  else { const s = criarServico(nome, dados.esfera); s.cor = dados.cor; salvar(); fecharFolha(); app.render(); }
  aviso('Salvo');
};
acoes.servicoExcluir = el => {
  const id = el.dataset.id;
  if (!confirm('Excluir este serviço? Os compromissos, tarefas e pacientes dele continuam, apenas ficam sem serviço.')) return;
  marcarDesfazer();
  app.db.servicos = app.db.servicos.filter(c => c.id !== id);
  [...app.db.eventos, ...app.db.tarefas, ...app.db.pacientes].forEach(x => { if (x.servico === id) { x.servico = ''; tocar(x); } });
  if (app.st.filtro === id) app.st.filtro = '';
  registrarExclusao('servico', id);
  salvar(); fecharFolha(); app.render(); aviso('Serviço excluído', true);
};

export function detalheServico(id) {
  const s = servico(id); if (!s) return;
  const t0 = today(), evs = app.db.eventos.filter(e => e.servico === id);
  const prox = ocorrenciasDe(evs, t0, addDays(t0, 30)).filter(o => o.status !== 'desmarcou').slice(0, 5);
  const abertas = app.db.tarefas.filter(t => t.servico === id && aberta(t)).sort(ordTarefa);
  const iniHist = Date.now() - 30 * 864e5;
  const concl = app.db.tarefas.filter(t => t.servico === id && t.status === 'concluida' && t.concluidaEm >= iniHist).sort((a, b) => b.concluidaEm - a.concluidaEm);
  const realiz = ocorrenciasDe(evs, addDays(t0, -30), addDays(t0, -1)).filter(o => o.status !== 'desmarcou');
  const histItens = [
    ...concl.map(t => ({ ord: new Date(t.concluidaEm).toISOString().slice(0, 10), txt: 'Tarefa concluída: ' + esc(t.titulo) })),
    ...realiz.map(o => ({ ord: o.data, txt: (o.ev.tipo === 'atendimento' ? 'Atendimento' : 'Compromisso') + (o.status ? ' (' + o.status + ')' : '') + ': ' + esc(o.ev.tipo === 'atendimento' ? 'sessão' : o.ev.titulo) })),
  ].sort((a, b) => b.ord.localeCompare(a.ord)).slice(0, 15);
  abrirFolha(cabecalho(`<i class="sw lg" style="--c:${s.cor}"></i>${esc(s.nome)}`) + `
  <p class="note top">${ESFERA[s.esfera || 'profissional']}${s.arquivado ? ' · arquivado' : ''}</p>
  <div class="btns h"><button class="btn" data-act="servicoVerAgenda" data-id="${id}">${ic('cal')}Agenda</button><button class="btn" data-act="servicoVerTarefas" data-id="${id}">${ic('tasks')}Tarefas</button></div>
  <h2>Próximos compromissos</h2>${prox.length ? `<div class="list">${prox.map(o => cartaoOcorrencia(o, null, { data: true })).join('')}</div>` : '<div class="empty sm">Nada nos próximos 30 dias.</div>'}
  <h2>Tarefas abertas <span class="cnt">${abertas.length}</span></h2>${abertas.length ? `<div class="list">${abertas.slice(0, 8).map(linhaTarefa).join('')}</div>` : '<div class="empty sm">Nenhuma tarefa aberta.</div>'}
  ${histItens.length ? `<h2>Histórico (30 dias)</h2><div class="card pad">${histItens.map(h => `<div class="mini"><span>${h.txt}</span><span class="sub">${fmtShort(h.ord)}</span></div>`).join('')}</div>` : ''}
  <div class="btns"><button class="btn" data-act="servicoEditar" data-id="${id}">Editar serviço</button></div>`);
}
acoes.servico = el => detalheServico(el.dataset.id);
const ajustaEsfera = id => { const s = servico(id); if (s && app.db.cfg.esfera && s.esfera !== app.db.cfg.esfera) { app.db.cfg.esfera = ''; salvar(); } };
acoes.servicoVerAgenda = el => { ajustaEsfera(el.dataset.id); app.st.filtro = el.dataset.id; app.st.tab = 'agenda'; app.st.modo = 'semana'; app.st.dia = today(); fecharFolha(); app.render(); scrollTo(0, 0); };
acoes.servicoVerTarefas = el => { ajustaEsfera(el.dataset.id); app.st.filtro = el.dataset.id; app.st.tab = 'tarefas'; app.st.tf.status = 'abertas'; fecharFolha(); app.render(); scrollTo(0, 0); };
