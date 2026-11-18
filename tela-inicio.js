// Início (painel do dia) e captura rápida.
import { esc, ic, uid, today, addDays, fmtLong, fmtShort, fmtRel, fmtHoras, addMin, minutos, DOW, PRIO, plural, diasSemBackup } from './app-util.js';
import { app, salvar, servico, tocar } from './app-dados.js';
import { ocorrenciasDoDia, chavesEmConflito, conflitosDe, aberta, atrasada, venceEmBreve, ordTarefa, passaFiltro, resumo, semanaAtual, interpretar, evTitulo, hist } from './app-regras.js';
import { acoes, forms, telas, aoDigitar, abrirFolha, fecharFolha, cabecalho, aviso, chips, cartaoOcorrencia, linhaTarefa, saudacao, cabecalhoTela } from './app-ui.js';
import { pedirPermissao } from './app-notif.js';

function render() {
  const t0 = today(), agora = new Date(), mAgora = agora.getHours() * 60 + agora.getMinutes();
  const ocs = ocorrenciasDoDia(t0), conf = chavesEmConflito(ocs);
  const ativas = ocs.filter(o => o.status !== 'desmarcou');
  const emCurso = ativas.find(o => minutos(o.ini) <= mAgora && mAgora < minutos(o.fim || addMin(o.ini, 30)));
  const proximo = ativas.find(o => minutos(o.ini) > mAgora);
  const tarefas = app.db.tarefas.filter(passaFiltro);
  const atr = tarefas.filter(t => atrasada(t, t0)).sort(ordTarefa);
  const hoje = tarefas.filter(t => aberta(t) && t.prazo === t0).sort(ordTarefa);
  const breve = tarefas.filter(t => venceEmBreve(t, 3, t0) && t.prazo !== t0).sort(ordTarefa);
  const iniDia = new Date(); iniDia.setHours(0, 0, 0, 0);
  const conclHoje = tarefas.filter(t => t.status === 'concluida' && t.concluidaEm >= iniDia.getTime()).length;
  const [s0, s1] = semanaAtual(t0), sem = resumo(s0, s1);
  const maxDia = Math.max(1, ...sem.porDia.map(d => d.compromissos + d.concluidas));

  const destaque = emCurso || proximo;
  const cardAgora = destaque ? `<button class="card agora" data-act="ocorrencia" data-id="${destaque.ev.id}" data-orig="${destaque.orig}" style="--c:${servico(destaque.ev.servico)?.cor || 'var(--acc)'}">
    <span class="rotulo">${emCurso ? 'Agora' : 'Próximo · em ' + fmtHoras(minutos(destaque.ini) - mAgora)}</span>
    <b>${esc(evTitulo(destaque.ev))}</b><span class="sub">${destaque.ini}${destaque.fim ? '–' + destaque.fim : ''}${destaque.ev.local ? ' · ' + esc(destaque.ev.local) : ''}</span></button>`
    : `<div class="card agora vazio"><span class="rotulo">Hoje</span><b>${ocs.length ? 'Nenhum compromisso restante' : 'Agenda livre'}</b><span class="sub">${hoje.length ? plural(hoje.length, 'tarefa') + ' para hoje' : 'Bom momento para adiantar tarefas.'}</span></div>`;

  const tiles = `<div class="tiles">
   <button class="tile" data-act="irAgendaHoje"><b>${ativas.length}</b><span>compromisso${ativas.length === 1 ? '' : 's'} hoje</span></button>
   <button class="tile" data-act="irTarefas" data-periodo="hoje"><b>${hoje.length}</b><span>tarefa${hoje.length === 1 ? '' : 's'} p/ hoje</span></button>
   <button class="tile ${atr.length ? 'alerta' : ''}" data-act="irTarefas" data-periodo="atrasadas"><b>${atr.length}</b><span>atrasada${atr.length === 1 ? '' : 's'}</span></button>
   <button class="tile ok" data-act="irTarefas" data-status="concluidas"><b>${conclHoje}</b><span>concluída${conclHoje === 1 ? '' : 's'} hoje</span></button></div>`;

  const blocoHoje = ocs.length ? `<section class="painel"><div class="ph"><h2>Agenda de hoje</h2><button class="link" data-act="irAgendaHoje">Abrir</button></div>
    ${conf.size ? `<div class="banner sm">${ic('alert')}<span>Há horários sobrepostos hoje.</span></div>` : ''}
    <div class="list">${ocs.slice(0, 6).map(o => cartaoOcorrencia(o, conf)).join('')}</div>${ocs.length > 6 ? `<button class="link mais" data-act="irAgendaHoje">+ ${ocs.length - 6} na agenda</button>` : ''}</section>` : '';

  const atencao = [...atr.slice(0, 4), ...hoje.slice(0, 4), ...breve.slice(0, 3)];
  const blocoTarefas = atencao.length ? `<section class="painel"><div class="ph"><h2>Tarefas que pedem atenção</h2><button class="link" data-act="irTarefas">Ver todas</button></div>
    ${atr.length > 1 ? `<button class="banner sm" data-act="tfMoverAtrasadas">${ic('move')}<span>Mover as ${atr.length} atrasadas para hoje</span></button>` : ''}
    <div class="list">${atencao.map(linhaTarefa).join('')}</div></section>` : '';

  const pctTarefas = sem.previstas ? Math.round(sem.previstasConcluidas / sem.previstas * 100) : null;
  const at_ = sem.atend, pctPresenca = (at_.realizado + at_.faltou) ? Math.round(at_.realizado / (at_.realizado + at_.faltou) * 100) : null;
  const blocoSemana = `<section class="painel"><div class="ph"><h2>Esta semana</h2><button class="link" data-act="irSemana">Ver semana</button></div>
    <div class="card semana">
     <div class="barras">${sem.porDia.map(d => `<button class="bar ${d.data === t0 ? 'hoje' : ''}" data-act="abrirDiaPainel" data-day="${d.data}" aria-label="${fmtShort(d.data)}"><i style="height:${Math.round((d.compromissos + d.concluidas) / maxDia * 100)}%"><em style="height:${d.compromissos + d.concluidas ? Math.round(d.compromissos / (d.compromissos + d.concluidas) * 100) : 0}%"></em></i><span>${DOW[new Date(d.data + 'T12:00').getDay()][0].toUpperCase()}</span></button>`).join('')}</div>
     <div class="legenda"><span><i class="lg c"></i>compromissos</span><span><i class="lg t"></i>tarefas concluídas</span></div>
     <div class="kpis">
      <div><b>${sem.ocorrencias}</b><span>compromissos · ${fmtHoras(sem.minutos)}</span></div>
      <div><b>${sem.concluidas}</b><span>tarefas concluídas</span></div>
      <div><b>${pctTarefas === null ? '–' : pctTarefas + '%'}</b><span>das tarefas com prazo na semana concluídas</span></div>
      ${at_.total ? `<div><b>${pctPresenca === null ? '–' : pctPresenca + '%'}</b><span>presença nos atendimentos (${at_.realizado} realizados, ${at_.faltou} faltas)</span></div>` : ''}
     </div></div></section>`;

  const primeiro = !app.db.eventos.length && !app.db.tarefas.length;
  return `${cabecalhoTela(saudacao(), fmtLong(t0))}${chips()}
  ${primeiro ? `<div class="card boasvindas"><b>Comece por aqui</b><p>Toque no <b>+</b> e escreva algo como <i>"amanhã 14h reunião"</i>. Em <b>Mais › Serviços</b> você cria suas frentes de atuação, cada uma com sua cor.</p></div>` : ''}
  ${cardAgora}${tiles}${faixaBackup()}<div class="grade">${blocoHoje}${blocoTarefas}${blocoSemana}</div>`;
}
telas.inicio = { render };

acoes.irAgendaHoje = () => acoes.abrirAgendaDia(today());
acoes.abrirDiaPainel = el => acoes.abrirAgendaDia(el.dataset.day);
acoes.irSemana = () => { app.st.tab = 'agenda'; app.st.modo = 'semana'; app.st.dia = today(); app.render(); scrollTo(0, 0); };
acoes.irTarefas = el => {
  const d = (el && el.dataset) || {};
  app.st.tab = 'tarefas'; app.st.tf.status = d.status || 'abertas'; app.st.tf.periodo = d.periodo || ''; app.st.tf.prio = ''; app.st.tf.cat = '';
  app.render(); scrollTo(0, 0);
};

// ---------- captura rápida ----------
export function abrirCaptura() {
  abrirFolha(cabecalho('Adicionar') + `
  <form data-form="captura" class="captura">
   <input class="in grande" name="txt" placeholder="Ex.: amanhã 14h reunião #coord !alta" autocomplete="off" autofocus maxlength="200">
   <div class="cap-prev" id="capPrev"><span class="sub">Escreva o que precisa fazer ou marcar.</span></div>
   <div class="btns h"><button class="btn pri" type="submit" value="tarefa">${ic('tasks')}Tarefa</button><button class="btn" type="submit" value="agenda">${ic('cal')}Na agenda</button></div>
   <details class="dicas"><summary>Como escrever</summary>
    <div><b>Quando:</b> hoje, amanhã, sexta, 15/11, dia 20 · <b>Hora:</b> 14h, 9h30, às 8</div>
    <div><b>Serviço:</b> # e o início do nome (ex.: #docencia) · <b>Prioridade:</b> !alta ou !! · !baixa</div>
   </details>
  </form>
  <h2>Ou use o formulário completo</h2>
  <div class="sec">
   <button class="item" data-act="evNovo" data-tipo="atendimento">${ic('user')}<div class="grow"><div class="t">Atendimento</div><div class="meta">Sessão com paciente</div></div></button>
   <button class="item" data-act="evNovo" data-tipo="compromisso">${ic('cal')}<div class="grow"><div class="t">Compromisso</div><div class="meta">Reunião, consulta, evento</div></div></button>
   <button class="item" data-act="evNovo" data-tipo="atividade">${ic('clock')}<div class="grow"><div class="t">Atividade</div><div class="meta">Grupo, oficina, visita, aula</div></div></button>
   <button class="item" data-act="tarefaNova">${ic('tasks')}<div class="grow"><div class="t">Tarefa detalhada</div><div class="meta">Com categoria, subtarefas e lembrete</div></div></button>
  </div>`);
}
acoes.captura = abrirCaptura;
aoDigitar.push(el => {
  if (!el.form || el.form.dataset.form !== 'captura') return;
  const r = interpretar(el.value), box = document.getElementById('capPrev');
  if (!el.value.trim()) { box.innerHTML = '<span class="sub">Escreva o que precisa fazer ou marcar.</span>'; return; }
  const s = servico(r.servico);
  box.innerHTML = [
    `<span class="tag t">${esc(r.titulo || '(sem título)')}</span>`,
    r.data ? `<span class="tag">${ic('cal')}${fmtRel(r.data)}</span>` : '',
    r.hora ? `<span class="tag">${ic('clock')}${r.hora}</span>` : '',
    s ? `<span class="tag" style="--c:${s.cor}"><i class="pt"></i>${esc(s.nome)}</span>` : '',
    r.prio && r.prio !== 'media' ? `<span class="tag">${ic('zap')}${PRIO[r.prio]}</span>` : '',
  ].join('');
});
forms.captura = (f, botao) => {
  const txt = f.txt.value.trim(); if (!txt) return aviso('Escreva algo primeiro');
  const r = interpretar(txt); if (!r.titulo) return aviso('Falta o que fazer (o título)');
  const como = botao && botao.value === 'agenda' ? 'agenda' : 'tarefa';
  if (como === 'agenda') {
    if (!r.hora) { acoes.formEventoPre({ tipo: 'compromisso', titulo: r.titulo, data: r.data || today(), servico: r.servico }); return aviso('Escolha o horário'); }
    const ev = tocar({ id: uid(), occ: {}, tipo: 'compromisso', titulo: r.titulo, pac: '', servico: r.servico, data: r.data, ini: r.hora, fim: addMin(r.hora, 60), rep: 'nao', ate: '', lembrete: app.db.cfg.lembretePadrao.compromisso ?? 15, local: '', notas: '' });
    const cs = conflitosDe(ev, null);
    app.db.eventos.push(ev); salvar(); fecharFolha(); app.render();
    aviso(cs.length ? `Salvo · atenção: conflita com ${evTitulo(cs[0].ev, false)} (${cs[0].ini})` : `Na agenda: ${fmtRel(r.data).toLowerCase()} às ${r.hora}`);
    if (ev.lembrete >= 0) pedirPermissao(true);
  } else {
    const t = tocar({ id: uid(), titulo: r.titulo, servico: r.servico, categoria: '', prazo: r.data, hora: r.data ? r.hora : '', prio: r.prio || 'media', lembrete: app.db.cfg.lembretePadrao.tarefa ?? 15, notas: '', status: 'pendente', concluidaEm: null, subtarefas: [], historico: [] });
    hist(t, 'Criada (captura rápida)');
    app.db.tarefas.push(t); salvar(); fecharFolha(); app.render();
    aviso('Tarefa criada' + (r.data ? ' · ' + fmtRel(r.data).toLowerCase() : ''));
    if (t.lembrete >= 0 && t.prazo && t.hora) pedirPermissao(true);
  }
};

/** Lembrete de backup na tela inicial: aparece com 7 dias ou mais sem backup (se houver dados). */
function faixaBackup() {
  const c = app.db.cfg; if (!c.backup || !c.backup.lembrete) return '';
  const temDados = app.db.eventos.length + app.db.tarefas.length + app.db.pacientes.length > 0;
  const d = diasSemBackup(c); if (!temDados || (d !== null && d < 7)) return '';
  return `<button class="banner" data-act="enviarBackup">${ic('save')}<span>${d === null ? 'Você ainda não fez backup da agenda.' : `Seu último backup foi há ${d} dias.`} Toque para enviar ao seu e-mail.</span></button>`;
}
