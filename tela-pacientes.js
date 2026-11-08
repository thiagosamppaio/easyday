// Pacientes: lista, cadastro, frequência e histórico de sessões (mantido da versão 1).
import { esc, ic, uid, today, addDays, fmtShort, iniciais, STL } from './app-util.js';
import { app, salvar, servico, tocar, marcarDesfazer, registrarExclusao } from './app-dados.js';
import { ocorrenciasDe, passaFiltro } from './app-regras.js';
import { acoes, forms, telas, aoDigitar, abrirFolha, fecharFolha, cabecalho, aviso, chips, vazio, opcoesServico, campoNovoServico, servicoDoForm, cabecalhoTela } from './app-ui.js';

const nomeP = p => p ? (app.db.cfg.discreto ? iniciais(p.nome) : p.nome) : 'Paciente';

export function estatPaciente(id, dias = 120) {
  const evs = app.db.eventos.filter(e => e.tipo === 'atendimento' && e.pac === id), t0 = today();
  let r = 0, f = 0, dz = 0; const hist = [];
  for (const ev of evs) for (const [orig, o] of Object.entries(ev.occ || {})) {
    if (!o.status || o.skip) continue;
    if (o.status === 'realizado') r++; else if (o.status === 'faltou') f++; else dz++;
    hist.push({ data: o.mov ? o.mov.data : orig, s: o.status });
  }
  hist.sort((a, b) => b.data.localeCompare(a.data));
  const prox = ocorrenciasDe(evs, t0, addDays(t0, dias)).filter(o => !o.status);
  return { r, f, dz, hist, prox };
}

function render() {
  const ativos = app.db.pacientes.filter(p => p.ativo !== false).length, nA = app.db.pacientes.length - ativos;
  return `<button class="voltar" data-act="tab" data-tab="mais">${ic('l')}Mais</button>
  ${cabecalhoTela(ativos + ' ativo' + (ativos === 1 ? '' : 's'), 'Pacientes')}
  <div class="card search">${ic('search')}<input id="pacBusca" type="search" placeholder="Buscar paciente" value="${esc(app.st.busca)}" autocomplete="off"></div>
  ${chips()}<div id="plist" class="top"></div>
  ${nA ? `<button class="link centro" data-act="pacArquivados">${app.st.arquivados ? 'Ocultar' : 'Mostrar'} arquivados (${nA})</button>` : ''}`;
}
function lista() {
  const el = document.getElementById('plist'); if (!el) return;
  const q = app.st.busca.trim().toLowerCase();
  const ps = app.db.pacientes.filter(p => (app.st.arquivados || p.ativo !== false) && passaFiltro(p) && (!q || p.nome.toLowerCase().includes(q))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  el.innerHTML = ps.length ? `<div class="sec">${ps.map(p => {
    const s = estatPaciente(p.id, 60), c = servico(p.servico), nx = s.prox[0];
    return `<button class="item" data-act="paciente" data-id="${p.id}"><div class="av" style="--c:${c ? c.cor : 'var(--acc)'}">${esc(iniciais(p.nome).replace(/[.\s]/g, '').slice(0, 2))}</div>
    <div class="grow"><div class="t">${esc(nomeP(p))}${p.ativo === false ? ' <span class="sub">(arquivado)</span>' : ''}</div><div class="meta">${nx ? 'Próx.: ' + fmtShort(nx.data) + ' ' + nx.ini : 'Sem sessão agendada'}${c ? ' · ' + esc(c.nome) : ''}</div></div>
    <div class="cnt2"><span class="ok"><b>${s.r}</b></span><span class="no"><b>${s.f}</b></span></div></button>`;
  }).join('')}</div>`
    : vazio(app.db.pacientes.length ? 'Nenhum paciente encontrado' : 'Nenhum paciente', app.db.pacientes.length ? '' : 'Toque no + para cadastrar. Para preservar o sigilo, você pode usar só iniciais ou um apelido.');
}
telas.pacientes = { render, depois: lista, fab: () => formPaciente({}), aba: 'mais' };
aoDigitar.push(el => { if (el.id === 'pacBusca') { app.st.busca = el.value; lista(); } });
acoes.pacArquivados = () => { app.st.arquivados = !app.st.arquivados; app.render(); };

export function formPaciente(base) {
  const novo = !base.id;
  const p = Object.assign({ nome: '', tel: '', servico: app.st.filtro || '', obs: '', ativo: true }, base);
  abrirFolha(cabecalho(novo ? 'Novo paciente' : 'Editar paciente') + `
  <form data-form="paciente" data-id="${p.id || ''}">
  <div class="f"><label class="l">Nome</label><input class="in" name="nome" value="${esc(p.nome)}" placeholder="Nome, iniciais ou apelido" maxlength="60" required ${novo ? 'autofocus' : ''}></div>
  <div class="f"><label class="l">Telefone</label><input class="in" type="tel" name="tel" value="${esc(p.tel)}" placeholder="Opcional" maxlength="20"></div>
  <div class="f"><label class="l">Serviço</label><select class="in" name="servico" data-novopara="servico">${opcoesServico(p.servico)}</select></div>${campoNovoServico}
  <div class="f"><label class="l">Observação</label><textarea class="in" name="obs" maxlength="300" placeholder="Ex.: prefere horários pela manhã">${esc(p.obs)}</textarea><div class="hint">Só informações práticas. Registros clínicos ficam no prontuário.</div></div>
  ${!novo ? `<div class="f sec"><div class="item"><div class="grow"><div class="t">Ativo</div><div class="meta">Desative para arquivar quem recebeu alta</div></div><label class="tog"><input type="checkbox" name="ativo" ${p.ativo !== false ? 'checked' : ''}><span></span></label></div></div>` : ''}
  <div class="btns"><button class="btn pri" type="submit">Salvar</button>${!novo ? `<button class="btn dan" type="button" data-act="pacienteExcluir" data-id="${p.id}">Excluir paciente</button>` : ''}</div></form>`);
}
forms.paciente = f => {
  const fd = new FormData(f), g = k => (fd.get(k) || '').toString().trim();
  if (!g('nome')) return aviso('Informe o nome');
  const sv = servicoDoForm(fd); if (sv === null) return;
  const id = f.dataset.id, dados = { nome: g('nome'), tel: g('tel'), servico: sv, obs: g('obs') };
  let p;
  if (id) { p = app.db.pacientes.find(x => x.id === id); Object.assign(p, dados, { ativo: !!fd.get('ativo') }); tocar(p); }
  else { p = tocar(Object.assign({ id: uid(), ativo: true }, dados)); app.db.pacientes.push(p); }
  salvar(); app.render(); detalhePaciente(p.id); aviso('Salvo');
};
export function detalhePaciente(id) {
  const p = app.db.pacientes.find(x => x.id === id); if (!p) return;
  const s = estatPaciente(id), c = servico(p.servico), tel = (p.tel || '').replace(/\D/g, ''), total = s.r + s.f;
  abrirFolha(cabecalho(esc(nomeP(p))) + `
  ${c || p.obs || tel ? `<div class="card det"><div class="dl">${c ? `<div>${ic('tag')}<span>${esc(c.nome)}</span></div>` : ''}${p.tel ? `<div>${ic('phone')}<span><a href="tel:${esc(tel)}">${esc(p.tel)}</a>${tel.length >= 10 ? ` · <a href="https://wa.me/${tel.length <= 11 ? '55' : ''}${tel}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span></div>` : ''}${p.obs ? `<div>${ic('note')}<span class="pre">${esc(p.obs)}</span></div>` : ''}</div></div>` : ''}
  <h2>Frequência</h2><div class="stats"><div><b class="ok">${s.r}</b><span>Realizadas</span></div><div><b class="no">${s.f}</b><span>Faltas</span></div><div><b>${total ? Math.round(s.r / total * 100) + '%' : '–'}</b><span>Presença</span></div></div>
  ${s.dz ? `<p class="note">${s.dz} sessão(ões) desmarcada(s).</p>` : ''}
  <h2>Próximas sessões</h2><div class="card pad">${s.prox.length ? s.prox.slice(0, 4).map(x => `<button class="mini" data-act="ocorrencia" data-id="${x.ev.id}" data-orig="${x.orig}"><span>${fmtShort(x.data)}${x.movida ? ' (remarcada)' : ''}</span><span>${x.ini}</span></button>`).join('') : '<div class="mini"><span class="sub">Nenhuma agendada</span></div>'}</div>
  ${s.hist.length ? `<h2>Histórico</h2><div class="card pad">${s.hist.slice(0, 12).map(x => `<div class="mini"><span>${fmtShort(x.data)} ${x.data.slice(0, 4) !== today().slice(0, 4) ? x.data.slice(0, 4) : ''}</span><span class="st st-${x.s}">${STL[x.s]}</span></div>`).join('')}</div>` : ''}
  <div class="btns"><button class="btn pri" data-act="pacienteAgendar" data-id="${p.id}">${ic('plus')}Agendar sessão</button><button class="btn" data-act="pacienteEditar" data-id="${p.id}">Editar dados</button></div>`);
}
acoes.paciente = el => detalhePaciente(el.dataset.id);
acoes.pacienteEditar = el => formPaciente(Object.assign({}, app.db.pacientes.find(x => x.id === el.dataset.id)));
acoes.pacienteAgendar = el => { const p = app.db.pacientes.find(x => x.id === el.dataset.id); acoes.formEventoPre({ tipo: 'atendimento', pac: p.id, servico: p.servico, data: app.st.dia >= today() ? app.st.dia : today(), rep: 'sem' }); };
acoes.pacienteNovo = () => formPaciente({});
acoes.pacienteExcluir = el => {
  if (!confirm('Excluir o paciente e todos os atendimentos dele? Para manter o histórico, prefira desativá-lo.')) return;
  const id = el.dataset.id; marcarDesfazer();
  app.db.pacientes = app.db.pacientes.filter(x => x.id !== id);
  app.db.eventos.filter(x => x.tipo === 'atendimento' && x.pac === id).forEach(x => registrarExclusao('evento', x.id));
  app.db.eventos = app.db.eventos.filter(x => !(x.tipo === 'atendimento' && x.pac === id));
  registrarExclusao('paciente', id);
  salvar(); fecharFolha(); app.render(); aviso('Paciente excluído', true);
};
