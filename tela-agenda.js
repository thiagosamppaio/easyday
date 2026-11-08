// Agenda: visões dia / semana / mês, cadastro, detalhe, remarcação, conflitos e exclusão.
import { $, esc, ic, uid, clone, today, addDays, parse, fmtLong, fmtShort, fmtRel, fmtDM, inicioSemana, inicioMes, fimMes, addMeses, addMin, pad, DOW, MES, MES_LONGO, REP, LEMB, TIPO, STL } from './app-util.js';
import { app, salvar, servico, paciente, tocar, marcarDesfazer, registrarExclusao } from './app-dados.js';
import { ocorrencias, ocorrenciasDoDia, ocorrencia, chavesEmConflito, conflitosDe, evTitulo, passaFiltro, aberta, ordTarefa, atrasada } from './app-regras.js';
import { acoes, forms, telas, aoMudar, abrirFolha, fecharFolha, cabecalho, aviso, chips, cartaoOcorrencia, linhaTarefa, vazio, opcoesServico, campoNovoServico, servicoDoForm, cabecalhoTela, corServico } from './app-ui.js';
import { pedirPermissao } from './app-notif.js';

const st = () => app.st;

// ---------- tela ----------
function tituloAgenda() {
  const d = st().dia;
  if (st().modo === 'semana') {
    const a = inicioSemana(d), b = addDays(a, 6), pa = parse(a), pb = parse(b);
    return pa.getMonth() === pb.getMonth() ? `${pa.getDate()} – ${pb.getDate()} de ${MES_LONGO[pb.getMonth()]}` : `${pa.getDate()} ${MES[pa.getMonth()]} – ${pb.getDate()} ${MES[pb.getMonth()]}`;
  }
  if (st().modo === 'mes') { const p = parse(d); return `${MES_LONGO[p.getMonth()]} de ${p.getFullYear()}`; }
  return fmtLong(d);
}
function render() {
  const modo = st().modo, d = st().dia, t0 = today();
  const seg = `<div class="seg modo">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, v]) => `<label><input type="radio" name="agModo" data-act="agModo" value="${k}" ${modo === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>`;
  const nav = `<div class="navrow"><button class="iconbtn sm" data-act="agNav" data-n="-1" aria-label="Anterior">${ic('l')}</button><button class="chip ${d === t0 && modo === 'dia' ? 'on' : ''}" data-act="agHoje">Hoje</button><button class="iconbtn sm" data-act="agNav" data-n="1" aria-label="Próximo">${ic('r')}</button>
  <label class="iconbtn sm" aria-label="Escolher data">${ic('cal')}<input type="date" id="agPular" value="${d}"></label></div>`;
  let corpo = '';
  if (modo === 'dia') corpo = vDia();
  else if (modo === 'semana') corpo = vSemana();
  else corpo = vMes();
  return `${cabecalhoTela('Agenda', tituloAgenda())}<div class="toolbar">${seg}${nav}</div>${chips()}${corpo}`;
}
function faixaSemana() {
  const d = st().dia, t0 = today(), w0 = inicioSemana(d);
  const ocs = ocorrencias(w0, addDays(w0, 6));
  let h = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(w0, i), p = parse(day);
    const cs = [...new Set(ocs.filter(o => o.data === day).map(o => corServico(o.ev.servico)))].slice(0, 3);
    h += `<button class="d ${day === d ? 'sel' : ''} ${day === t0 ? 'hoje' : ''}" data-act="agDia" data-day="${day}"><span>${DOW[p.getDay()]}</span><b>${p.getDate()}</b><i class="dots">${cs.map(c => `<i style="--c:${c}"></i>`).join('')}</i></button>`;
  }
  return `<div class="days">${h}</div>`;
}
function listaDia(day, comTarefas = true) {
  const ocs = ocorrenciasDoDia(day), conf = chavesEmConflito(ocs);
  const ts = comTarefas ? app.db.tarefas.filter(t => aberta(t) && t.prazo === day && passaFiltro(t)).sort(ordTarefa) : [];
  let h = '';
  if (conf.size) h += `<div class="banner">${ic('alert')}<span>Há compromissos com <b>horários sobrepostos</b> neste dia.</span></div>`;
  if (ocs.length) h += `<div class="list">${ocs.map(o => cartaoOcorrencia(o, conf)).join('')}</div>`;
  if (ts.length) h += `<h2>Tarefas com prazo neste dia</h2><div class="list">${ts.map(linhaTarefa).join('')}</div>`;
  return { html: h, vazio: !ocs.length && !ts.length, n: ocs.length, nt: ts.length };
}
function vDia() {
  const d = st().dia, t0 = today();
  const l = listaDia(d);
  const atrasadas = d === t0 ? app.db.tarefas.filter(t => atrasada(t, t0) && passaFiltro(t)).length : 0;
  return `${faixaSemana()}
  ${atrasadas ? `<button class="banner" data-act="irTarefasAtrasadas">${ic('alert')}<span>Você tem <b>${atrasadas}</b> tarefa${atrasadas > 1 ? 's' : ''} atrasada${atrasadas > 1 ? 's' : ''}</span></button>` : ''}
  ${l.vazio ? vazio('Dia livre', 'Toque no + para marcar um compromisso, atendimento ou tarefa.') : l.html}`;
}
function vSemana() {
  const w0 = inicioSemana(st().dia), t0 = today();
  let h = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(w0, i), l = listaDia(day);
    h += `<section class="wday ${day === t0 ? 'hoje' : ''}"><button class="wday-h" data-act="agAbrirDia" data-day="${day}"><b class="cap">${fmtShort(day)}</b><span>${l.n || l.nt ? [l.n ? l.n + ' compr.' : '', l.nt ? l.nt + ' tarefa' + (l.nt > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') : 'livre'}</span></button>${l.html}</section>`;
  }
  return h;
}
function vMes() {
  const d = st().dia, t0 = today(), m0 = inicioMes(d), m1 = fimMes(d);
  const g0 = inicioSemana(m0), ocs = ocorrencias(g0, addDays(g0, 41));
  const prazo = {}; app.db.tarefas.filter(t => aberta(t) && t.prazo && passaFiltro(t)).forEach(t => { prazo[t.prazo] = (prazo[t.prazo] || 0) + 1; });
  let cel = '';
  for (let i = 0; i < 42; i++) {
    const day = addDays(g0, i);
    if (i === 35 && day > m1) break;
    const os = ocs.filter(o => o.data === day), cs = [...new Set(os.map(o => corServico(o.ev.servico)))].slice(0, 3);
    cel += `<button class="mc ${day.slice(0, 7) !== d.slice(0, 7) ? 'fora' : ''} ${day === d ? 'sel' : ''} ${day === t0 ? 'hoje' : ''}" data-act="agMesDia" data-day="${day}"><b>${parse(day).getDate()}</b>
    <i class="dots">${cs.map(c => `<i style="--c:${c}"></i>`).join('')}</i>${os.length ? `<small>${os.length}</small>` : prazo[day] ? `<small class="tp">${prazo[day]}t</small>` : ''}</button>`;
  }
  const l = listaDia(d);
  return `<div class="mes card"><div class="mh">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(x => `<span>${x}</span>`).join('')}</div><div class="mg">${cel}</div></div>
  <h2 class="cap">${fmtLong(d)}</h2>${l.vazio ? `<div class="empty sm">Nada marcado.</div>` : l.html}`;
}
telas.agenda = { render, swipe: n => mover(n) };

function mover(n) {
  const m = st().modo;
  st().dia = m === 'mes' ? (() => { const x = addMeses(st().dia, n); const dd = Math.min(+st().dia.slice(8), +fimMes(x).slice(8)); return x.slice(0, 8) + pad(dd); })() : addDays(st().dia, m === 'semana' ? 7 * n : n);
  app.render();
}
acoes.agNav = el => mover(+el.dataset.n);
acoes.agHoje = () => { st().dia = today(); app.render(); };
acoes.agDia = el => { st().dia = el.dataset.day; app.render(); };
acoes.agMesDia = el => { st().dia = el.dataset.day; app.render(); };
acoes.agAbrirDia = el => { st().dia = el.dataset.day; st().modo = 'dia'; app.render(); scrollTo(0, 0); };
acoes.agModo = el => { st().modo = el.value; app.render(); };
acoes.irTarefasAtrasadas = () => { st().tab = 'tarefas'; st().tf.periodo = ''; st().tf.status = 'abertas'; app.render(); scrollTo(0, 0); };
acoes.abrirAgendaDia = (day) => { st().tab = 'agenda'; st().modo = 'dia'; st().dia = day; fecharFolha(); app.render(); scrollTo(0, 0); };
aoMudar.push(el => { if (el.id === 'agPular' && el.value) { st().dia = el.value; app.render(); } });

// ---------- formulário de compromisso ----------
function proxHorario(day) {
  if (day !== today()) return '08:00';
  const d = new Date(); let m = d.getHours() * 60 + d.getMinutes(); m = Math.ceil((m + 1) / 30) * 30; if (m > 23 * 60) m = 23 * 60;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}
const durPadrao = tipo => tipo === 'atendimento' ? 40 : 60;
export function formEvento(base = {}) {
  const novo = !base.id, lp = app.db.cfg.lembretePadrao;
  const tipo0 = base.tipo || 'compromisso';
  const ev = Object.assign({ tipo: tipo0, titulo: '', servico: st().filtro || '', pac: '', data: st().dia, ini: '', fim: '', rep: 'nao', ate: '', lembrete: lp[tipo0] ?? 15, local: '', notas: '' }, base);
  if (!ev.ini) ev.ini = proxHorario(ev.data);
  if (!ev.fim && novo) ev.fim = addMin(ev.ini, durPadrao(ev.tipo));
  if (novo && ev.tipo === 'atendimento' && !ev.servico && ev.pac) { const p = paciente(ev.pac); if (p && p.servico) ev.servico = p.servico; }
  const pacs = app.db.pacientes.filter(p => p.ativo !== false || p.id === ev.pac).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const nomeP = p => app.db.cfg.discreto ? p.nome.split(/\s+/).map(w => w[0] + '.').join(' ') : p.nome;
  abrirFolha(cabecalho(novo ? 'Novo item na agenda' : 'Editar') + `
  <form data-form="evento" data-id="${ev.id || ''}" data-tipo="${ev.tipo}" data-rep="${ev.rep !== 'nao' ? 'sim' : 'nao'}" data-novo="${novo ? 1 : 0}">
  <div class="f seg">${Object.entries(TIPO).map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}" ${ev.tipo === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
  <div class="f so-at"><label class="l">Paciente</label><select class="in" name="pac" data-novopara="pac"><option value="">Escolha…</option>${pacs.map(p => `<option value="${p.id}" ${p.id === ev.pac ? 'selected' : ''}>${esc(nomeP(p))}</option>`).join('')}<option value="__novo">+ Novo paciente…</option></select></div>
  <div class="f so-novo" data-novo="pac"><input class="in" name="pacNovo" placeholder="Nome (ou iniciais) do novo paciente" maxlength="60"></div>
  <div class="f nao-at"><label class="l">Título</label><input class="in" name="titulo" value="${ev.tipo !== 'atendimento' ? esc(ev.titulo) : ''}" placeholder="Ex.: Reunião de equipe" maxlength="100"></div>
  <div class="f so-at"><label class="l">Observação</label><input class="in" name="tituloAt" value="${ev.tipo === 'atendimento' ? esc(ev.titulo) : ''}" placeholder="Observação curta (opcional)" maxlength="60"></div>
  <div class="f"><label class="l">Serviço</label><select class="in" name="servico" data-novopara="servico">${opcoesServico(ev.servico)}</select></div>${campoNovoServico}
  <div class="f"><label class="l">Data</label><input class="in" type="date" name="data" value="${ev.data}" required></div>
  <div class="f g2"><div><label class="l">Início</label><input class="in" type="time" name="ini" value="${ev.ini}" required></div><div><label class="l">Término</label><input class="in" type="time" name="fim" value="${ev.fim}" data-auto="${novo ? 1 : 0}"></div></div>
  <div class="f g2"><div><label class="l">Repetir</label><select class="in" name="rep">${Object.entries(REP).map(([k, v]) => `<option value="${k}" ${ev.rep === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div><label class="l">Lembrete</label><select class="in" name="lembrete" data-auto="${novo ? 1 : 0}">${Object.entries(LEMB).map(([k, v]) => `<option value="${k}" ${String(ev.lembrete) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
  <div class="f so-rep"><label class="l">Repetir até (opcional)</label><input class="in" type="date" name="ate" value="${ev.ate || ''}"></div>
  <div class="f"><label class="l">Local</label><input class="in" name="local" value="${esc(ev.local)}" placeholder="Opcional" maxlength="100"></div>
  <div class="f"><label class="l">Anotações</label><textarea class="in" name="notas" placeholder="Opcional" maxlength="2000">${esc(ev.notas)}</textarea>
  <div class="hint so-at">Não registre informações clínicas aqui; o lugar delas é o prontuário.</div></div>
  ${!novo && ev.rep !== 'nao' ? '<p class="hint">As alterações valem para toda a série. Para mudar uma só sessão, use <b>Remarcar</b>.</p>' : ''}
  <div class="conflito" hidden></div>
  <div class="btns"><button class="btn pri" type="submit">Salvar</button></div></form>`);
}
aoMudar.push((el) => {
  const f = el.form; if (!f || f.dataset.form !== 'evento') return;
  if (f.dataset.ok) { delete f.dataset.ok; const c = f.querySelector('.conflito'); c.hidden = true; f.querySelector('[type=submit]').textContent = 'Salvar'; }
  if (el.name === 'tipo') {
    f.dataset.tipo = el.value;
    if (f.fim.dataset.auto === '1') f.fim.value = addMin(f.ini.value || '08:00', durPadrao(el.value));
    if (f.lembrete.dataset.auto === '1') f.lembrete.value = String(app.db.cfg.lembretePadrao[el.value] ?? 15);
  }
  if (el.name === 'lembrete') el.dataset.auto = '0';
  if (el.name === 'rep') f.dataset.rep = el.value !== 'nao' ? 'sim' : 'nao';
  if (el.name === 'ini' && f.fim.dataset.auto === '1' && el.value) f.fim.value = addMin(el.value, durPadrao(f.dataset.tipo));
  if (el.name === 'fim') el.dataset.auto = '0';
  if (el.name === 'pac' && el.value && el.value !== '__novo' && !f.servico.value) { const p = paciente(el.value); if (p && p.servico) f.servico.value = p.servico; }
});
/** Mostra aviso de conflito no formulário; retorna true se deve parar para o usuário confirmar. */
export function checarConflito(f, cand, ignorarId) {
  if (f.dataset.ok) return false;
  const cs = conflitosDe(cand, ignorarId);
  if (!cs.length) return false;
  const box = f.querySelector('.conflito');
  box.innerHTML = `${ic('alert')}<div><b>Conflito de horário</b>${cs.slice(0, 3).map(o => `<div>${esc(evTitulo(o.ev, false))} · ${fmtShort(o.data)} ${o.ini}${o.fim ? '–' + o.fim : ''}</div>`).join('')}${cs.length > 3 ? `<div>e mais ${cs.length - 3}…</div>` : ''}</div>`;
  box.hidden = false;
  f.dataset.ok = '1';
  f.querySelector('[type=submit]').textContent = 'Salvar mesmo assim';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}
forms.evento = f => {
  const fd = new FormData(f), g = k => (fd.get(k) || '').toString().trim();
  const tipo = g('tipo');
  const sv = servicoDoForm(fd); if (sv === null) return;
  let pacId = g('pac');
  if (tipo === 'atendimento') {
    if (pacId === '__novo') { if (!g('pacNovo')) return aviso('Informe o nome do paciente'); }
    else if (!pacId) return aviso('Escolha o paciente');
  } else if (!g('titulo')) return aviso('Dê um título');
  const data = g('data'), ini = g('ini'); if (!data || !ini) return aviso('Informe data e horário');
  let fim = g('fim'); if (fim && fim <= ini) fim = '';
  const rep = g('rep') || 'nao';
  let ate = rep !== 'nao' ? g('ate') : ''; if (ate && ate < data) ate = '';
  const id = f.dataset.id, atual = id ? app.db.eventos.find(e => e.id === id) : null;
  if (checarConflito(f, { data, ini, fim, rep, ate, occ: atual ? atual.occ : {} }, id)) return;
  if (tipo === 'atendimento' && pacId === '__novo') {
    const p = tocar({ id: uid(), nome: g('pacNovo'), tel: '', servico: sv, obs: '', ativo: true }); app.db.pacientes.push(p); pacId = p.id;
  }
  const dados = { tipo, titulo: tipo === 'atendimento' ? g('tituloAt') : g('titulo'), pac: tipo === 'atendimento' ? pacId : '', servico: sv, data, ini, fim, rep, ate, lembrete: Number(g('lembrete')), local: g('local'), notas: g('notas') };
  if (atual) {
    if (atual.rep === 'nao' && rep === 'nao' && atual.data !== data && atual.occ[atual.data]) { atual.occ[data] = atual.occ[atual.data]; delete atual.occ[atual.data]; }
    Object.assign(atual, dados); tocar(atual);
  } else app.db.eventos.push(tocar(Object.assign({ id: uid(), occ: {} }, dados)));
  salvar(); fecharFolha(); st().dia = data; if (st().tab !== 'inicio') st().tab = 'agenda'; app.render(); aviso('Salvo');
  if (dados.lembrete >= 0) pedirPermissao(true);
};
acoes.formEventoPre = base => formEvento(base);
acoes.evNovo = el => formEvento({ tipo: el.dataset.tipo || 'compromisso', data: el.dataset.day || (st().dia >= today() ? st().dia : today()) });
acoes.evEditar = el => { const ev = app.db.eventos.find(e => e.id === el.dataset.id); if (ev) formEvento(clone(ev)); };

// ---------- detalhe ----------
export function detalheOcorrencia(evId, orig) {
  const o = ocorrencia(evId, orig); if (!o) return;
  const ev = o.ev, s = servico(ev.servico), p = ev.tipo === 'atendimento' ? paciente(ev.pac) : null;
  const conf = conflitosDe({ data: o.data, ini: o.ini, fim: o.fim, rep: 'nao' }, ev.id);
  abrirFolha(cabecalho(esc(TIPO[ev.tipo])) + `
  <div class="card det" style="--c:${s ? s.cor : 'var(--line)'}">
  <div class="det-t">${esc(evTitulo(ev))}</div>
  <div class="dl">
  <div>${ic('cal')}<span class="cap">${fmtLong(o.data)}</span></div>
  <div>${ic('clock')}<span>${o.ini}${o.fim ? ' – ' + o.fim : ''}</span></div>
  ${o.movida ? `<div>${ic('move')}<span>Remarcado · original: ${fmtShort(o.orig)} às ${ev.ini}</span></div>` : ''}
  ${ev.rep !== 'nao' ? `<div>${ic('rep')}<span>${REP[ev.rep]}${ev.ate ? ' até ' + fmtShort(ev.ate) : ''}</span></div>` : ''}
  ${s ? `<div>${ic('tag')}<span>${esc(s.nome)}</span></div>` : ''}
  ${ev.local ? `<div>${ic('pin')}<span>${esc(ev.local)}</span></div>` : ''}
  <div>${ic('bell')}<span>${LEMB[String(ev.lembrete)] || 'Sem lembrete'}</span></div>
  ${ev.notas ? `<div>${ic('note')}<span class="pre">${esc(ev.notas)}</span></div>` : ''}
  </div></div>
  ${conf.length ? `<div class="banner">${ic('alert')}<span>Conflita com <b>${esc(evTitulo(conf[0].ev, false))}</b> (${conf[0].ini}${conf[0].fim ? '–' + conf[0].fim : ''})${conf.length > 1 ? ` e mais ${conf.length - 1}` : ''}.</span></div>` : ''}
  ${ev.tipo === 'atendimento' ? `<h2>Presença nesta sessão</h2><div class="stset">${Object.entries(STL).map(([k, v]) => `<button class="${k} ${o.status === k ? 'on' : ''}" data-act="evStatus" data-id="${ev.id}" data-orig="${o.orig}" data-st="${k}">${v}</button>`).join('')}</div>
  ${p ? `<div class="btns"><button class="btn" data-act="paciente" data-id="${p.id}">${ic('user')}Ver paciente</button></div>` : ''}` : ''}
  <div class="btns h"><button class="btn" data-act="evRemarcar" data-id="${ev.id}" data-orig="${o.orig}">${ic('move')}Remarcar</button><button class="btn" data-act="evEditar" data-id="${ev.id}">Editar</button></div>
  ${o.movida ? `<div class="btns"><button class="btn" data-act="evDesmover" data-id="${ev.id}" data-orig="${o.orig}">Desfazer remarcação</button></div>` : ''}
  <div class="btns h"><a class="btn" href="${linkGoogle(o)}" target="_blank" rel="noopener">${ic('ext')}Google Agenda</a><button class="btn dan" data-act="evExcluir" data-id="${ev.id}" data-orig="${o.orig}">Excluir</button></div>`);
}
acoes.ocorrencia = el => detalheOcorrencia(el.dataset.id, el.dataset.orig);
acoes.abrirOcorrencia = (id, orig) => detalheOcorrencia(id, orig);

function linkGoogle(o) {
  const ev = o.ev, rec = ev.rep !== 'nao' && !o.movida;
  const d = (rec ? ev.data : o.data).replace(/-/g, ''), ini = rec ? ev.ini : o.ini, fim = (rec ? ev.fim : o.fim) || addMin(ini, 60);
  let u = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(evTitulo(ev, true)) + '&dates=' + d + 'T' + ini.replace(':', '') + '00/' + d + 'T' + fim.replace(':', '') + '00&ctz=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo');
  if (ev.local) u += '&location=' + encodeURIComponent(ev.local);
  if (ev.notas && ev.tipo !== 'atendimento') u += '&details=' + encodeURIComponent(ev.notas);
  const rr = { dia: 'FREQ=DAILY', util: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', sem: 'FREQ=WEEKLY', quinz: 'FREQ=WEEKLY;INTERVAL=2', mes: 'FREQ=MONTHLY' }[ev.rep];
  if (rr && rec) u += '&recur=' + encodeURIComponent('RRULE:' + rr + (ev.ate ? ';UNTIL=' + ev.ate.replace(/-/g, '') + 'T235959Z' : ''));
  return u;
}

acoes.evStatus = el => {
  const ev = app.db.eventos.find(x => x.id === el.dataset.id); if (!ev) return;
  const k = el.dataset.orig, cur = ev.occ[k] || {}, s = el.dataset.st;
  ev.occ[k] = Object.assign({}, cur, { status: cur.status === s ? undefined : s });
  if (!ev.occ[k].status) delete ev.occ[k].status;
  if (!Object.keys(ev.occ[k]).length) delete ev.occ[k];
  tocar(ev); salvar(); app.render(); detalheOcorrencia(ev.id, k);
};

// ---------- remarcar ----------
acoes.evRemarcar = el => {
  const o = ocorrencia(el.dataset.id, el.dataset.orig); if (!o) return;
  const rep = o.ev.rep !== 'nao';
  abrirFolha(cabecalho('Remarcar') + `<form data-form="remarcar" data-id="${o.ev.id}" data-orig="${o.orig}">
  <p class="note top">${esc(evTitulo(o.ev))} · atualmente ${fmtShort(o.data)}, ${o.ini}${o.fim ? '–' + o.fim : ''}</p>
  <div class="f"><label class="l">Nova data</label><input class="in" type="date" name="data" value="${o.data}" required></div>
  <div class="f g2"><div><label class="l">Início</label><input class="in" type="time" name="ini" value="${o.ini}" required></div><div><label class="l">Término</label><input class="in" type="time" name="fim" value="${o.fim}"></div></div>
  <div class="chips nowrap">${[['Amanhã', 1], ['+2 dias', 2], ['+1 semana', 7]].map(([t, n]) => `<button type="button" class="chip" data-act="remarcarAtalho" data-n="${n}">${t}</button>`).join('')}</div>
  ${rep ? '<p class="hint">Só esta ocorrência será remarcada. Para mudar a série toda, use <b>Editar</b>.</p>' : ''}
  <div class="conflito" hidden></div>
  <div class="btns"><button class="btn pri" type="submit">Remarcar</button></div></form>`);
};
acoes.remarcarAtalho = el => { const f = el.closest('form'); const o = ocorrencia(f.dataset.id, f.dataset.orig); f.data.value = addDays(o.data, +el.dataset.n); f.data.dispatchEvent(new Event('change', { bubbles: true })); };
aoMudar.push(el => { const f = el.form; if (f && f.dataset.form === 'remarcar' && f.dataset.ok) { delete f.dataset.ok; f.querySelector('.conflito').hidden = true; f.querySelector('[type=submit]').textContent = 'Remarcar'; } });
forms.remarcar = f => {
  const ev = app.db.eventos.find(x => x.id === f.dataset.id); if (!ev) return;
  const orig = f.dataset.orig, data = f.data.value, ini = f.ini.value; let fim = f.fim.value;
  if (!data || !ini) return aviso('Informe data e horário');
  if (fim && fim <= ini) fim = '';
  if (checarConflito(f, { data, ini, fim, rep: 'nao' }, ev.id)) return;
  marcarDesfazer();
  if (ev.rep === 'nao') {
    if (ev.occ[ev.data] && data !== ev.data) { ev.occ[data] = ev.occ[ev.data]; delete ev.occ[ev.data]; }
    Object.assign(ev, { data, ini, fim });
  } else {
    const cur = ev.occ[orig] || {};
    if (data === orig && ini === ev.ini && fim === (ev.fim || '')) delete cur.mov; else cur.mov = { data, ini, fim };
    if (Object.keys(cur).length) ev.occ[orig] = cur; else delete ev.occ[orig];
  }
  tocar(ev); salvar(); fecharFolha(); st().dia = data; app.render(); aviso('Remarcado para ' + fmtRel(data).toLowerCase() + ' às ' + ini, true);
};
acoes.evDesmover = el => {
  const ev = app.db.eventos.find(x => x.id === el.dataset.id); if (!ev) return;
  const k = el.dataset.orig; if (ev.occ[k]) { delete ev.occ[k].mov; if (!Object.keys(ev.occ[k]).length) delete ev.occ[k]; }
  tocar(ev); salvar(); app.render(); detalheOcorrencia(ev.id, k); aviso('Voltou ao horário original');
};

// ---------- excluir ----------
acoes.evExcluir = el => {
  const ev = app.db.eventos.find(e => e.id === el.dataset.id); if (!ev) return;
  const day = el.dataset.orig;
  if (ev.rep === 'nao') { marcarDesfazer(); app.db.eventos = app.db.eventos.filter(e => e !== ev); registrarExclusao('evento', ev.id); salvar(); fecharFolha(); app.render(); return aviso('Excluído', true); }
  abrirFolha(cabecalho('Excluir item que se repete') + `<div class="sec">
  <button class="item" data-act="evExcluir1" data-id="${ev.id}" data-orig="${day}"><div class="grow"><div class="t">Só esta ocorrência</div><div class="meta cap">${fmtLong(day)}</div></div></button>
  <button class="item" data-act="evExcluirFut" data-id="${ev.id}" data-orig="${day}"><div class="grow"><div class="t">Desta em diante</div><div class="meta">Mantém o histórico anterior</div></div></button>
  <button class="item dan" data-act="evExcluirTudo" data-id="${ev.id}"><div class="grow"><div class="t">Toda a série</div><div class="meta">Inclui o histórico de presença</div></div></button></div>`);
};
acoes.evExcluir1 = el => { const ev = app.db.eventos.find(x => x.id === el.dataset.id); marcarDesfazer(); ev.occ[el.dataset.orig] = { skip: true }; tocar(ev); salvar(); fecharFolha(); app.render(); aviso('Removido desta data', true); };
acoes.evExcluirFut = el => {
  const ev = app.db.eventos.find(x => x.id === el.dataset.id), day = el.dataset.orig; marcarDesfazer();
  if (day <= ev.data) { app.db.eventos = app.db.eventos.filter(x => x !== ev); registrarExclusao('evento', ev.id); }
  else { ev.ate = addDays(day, -1); for (const k in ev.occ) if (k >= day) delete ev.occ[k]; tocar(ev); }
  salvar(); fecharFolha(); app.render(); aviso('Série encerrada', true);
};
acoes.evExcluirTudo = el => { marcarDesfazer(); app.db.eventos = app.db.eventos.filter(x => x.id !== el.dataset.id); registrarExclusao('evento', el.dataset.id); salvar(); fecharFolha(); app.render(); aviso('Série excluída', true); };
export { fmtDM };
