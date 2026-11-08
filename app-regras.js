// Regras de negócio: ocorrências de compromissos (com repetição e remarcação),
// conflitos, filtros, tarefas, captura rápida, busca e indicadores.
import { iso, addDays, parse, dayDiff, today, minutos, at, norm, iniciais, STATUS, PRIO_ORDEM, fmtDM, inicioSemana } from './app-util.js';
import { app, servico, paciente } from './app-dados.js';

// ---------- filtros globais (esfera pessoal/profissional + serviço) ----------
export function servicosVisiveis() {
  const e = app.db.cfg.esfera;
  return app.db.servicos.filter(s => !s.arquivado && (!e || s.esfera === e));
}
/** Item (evento, tarefa, paciente) passa no filtro de esfera e de serviço ativos? */
export function passaFiltro(x) {
  const st = app.st, e = app.db.cfg.esfera;
  if (st.filtro && x.servico !== st.filtro) return false;
  if (e && x.servico) { const s = servico(x.servico); if (s && s.esfera !== e) return false; }
  return true;
}

// ---------- compromissos ----------
/** A regra de repetição do evento cai neste dia? (ignora exceções) */
export function occursOn(ev, day) {
  if (day < ev.data) return false;
  if (ev.ate && day > ev.ate) return false;
  const a = parse(ev.data), d = parse(day);
  switch (ev.rep) {
    case 'dia': return true;
    case 'util': return d.getDay() > 0 && d.getDay() < 6;
    case 'sem': return d.getDay() === a.getDay();
    case 'quinz': return d.getDay() === a.getDay() && dayDiff(ev.data, day) % 14 === 0;
    case 'mes': return d.getDate() === a.getDate();
    default: return day === ev.data;
  }
}
function mk(ev, orig, mov) {
  const o = (ev.occ && ev.occ[orig]) || {};
  return {
    ev, orig, chave: ev.id + '@' + orig,
    data: mov ? mov.data : orig,
    ini: mov ? mov.ini : ev.ini,
    fim: mov ? (mov.fim || '') : (ev.fim || ''),
    status: o.status || '', movida: !!mov,
  };
}
/** Todas as ocorrências dos eventos entre duas datas (inclusive), já com remarcações e exclusões aplicadas. */
export function ocorrenciasDe(evs, de, ate) {
  const out = [];
  for (const ev of evs) {
    const occ = ev.occ || {};
    if (ev.rep === 'nao' || !ev.rep) {
      const o = occ[ev.data];
      if (!(o && (o.skip || o.mov)) && ev.data >= de && ev.data <= ate) out.push(mk(ev, ev.data, null));
    } else {
      let d = ev.data > de ? ev.data : de;
      const fim = ev.ate && ev.ate < ate ? ev.ate : ate;
      while (d <= fim) {
        if (occursOn(ev, d)) { const o = occ[d]; if (!(o && (o.skip || o.mov))) out.push(mk(ev, d, null)); }
        d = addDays(d, 1);
      }
    }
    for (const orig in occ) {
      const o = occ[orig];
      if (o && o.mov && !o.skip && o.mov.data >= de && o.mov.data <= ate) out.push(mk(ev, orig, o.mov));
    }
  }
  return out.sort((a, b) => (a.data + a.ini).localeCompare(b.data + b.ini));
}
export const ocorrencias = (de, ate, filtrar = true) => ocorrenciasDe(filtrar ? app.db.eventos.filter(passaFiltro) : app.db.eventos, de, ate);
export const ocorrenciasDoDia = (day, filtrar = true) => ocorrencias(day, day, filtrar);
export function ocorrencia(evId, orig) {
  const ev = app.db.eventos.find(e => e.id === evId); if (!ev) return null;
  const o = ev.occ && ev.occ[orig];
  return mk(ev, orig, o && o.mov ? o.mov : null);
}
export const fimEfetivo = o => o.fim && o.fim > o.ini ? o.fim : null;
export const duracaoMin = o => { const f = fimEfetivo(o); return f ? minutos(f) - minutos(o.ini) : 30; };

/** Título do compromisso; para atendimento usa o paciente (iniciais se "privado" ou modo discreto). */
export function evTitulo(ev, privado) {
  if (ev.tipo === 'atendimento') {
    const p = paciente(ev.pac);
    const n = p ? (privado || app.db.cfg.discreto ? iniciais(p.nome) : p.nome) : 'Paciente';
    return ev.titulo ? n + ' · ' + ev.titulo : n;
  }
  return ev.titulo || '(sem título)';
}

// ---------- conflitos ----------
const sobrepoe = (a, b) => a.data === b.data && minutos(a.ini) < minutos(b.ini) + duracaoMin(b) && minutos(b.ini) < minutos(a.ini) + duracaoMin(a);
/** Conjunto de chaves de ocorrências que se sobrepõem a outra no mesmo dia. */
export function chavesEmConflito(ocs) {
  const ids = new Set();
  const at_ = ocs.filter(o => o.status !== 'desmarcou');
  for (let i = 0; i < at_.length; i++) for (let j = i + 1; j < at_.length; j++) {
    if (at_[j].data !== at_[i].data) continue;
    if (sobrepoe(at_[i], at_[j])) { ids.add(at_[i].chave); ids.add(at_[j].chave); }
  }
  return ids;
}
/**
 * Conflitos que um compromisso (novo ou editado) terá com os demais.
 * cand: { data, ini, fim, rep, ate, occ }   |   ignorarId: id do próprio evento
 * Para remarcação de uma única ocorrência, passe rep:'nao'.
 */
export function conflitosDe(cand, ignorarId) {
  const tmp = Object.assign({ id: '__cand', occ: {} }, cand);
  const ate = tmp.rep === 'nao' ? tmp.data : (tmp.ate && tmp.ate < addDays(tmp.data, 60) ? tmp.ate : addDays(tmp.data, 60));
  const minhas = ocorrenciasDe([tmp], tmp.data, ate);
  const outras = ocorrenciasDe(app.db.eventos.filter(e => e.id !== ignorarId), tmp.data, ate).filter(o => o.status !== 'desmarcou');
  const res = [];
  for (const m of minhas) for (const o of outras) if (sobrepoe(m, o)) res.push(o);
  return res;
}

// ---------- tarefas ----------
export const aberta = t => t.status === 'pendente' || t.status === 'andamento';
export const atrasada = (t, t0 = today()) => aberta(t) && !!t.prazo && t.prazo < t0;
export const venceEmBreve = (t, dias = 3, t0 = today()) => aberta(t) && !!t.prazo && t.prazo >= t0 && t.prazo <= addDays(t0, dias);
export function ordTarefa(a, b) {
  return (a.prazo || '9999').localeCompare(b.prazo || '9999') || (a.hora || '99').localeCompare(b.hora || '99') || PRIO_ORDEM[a.prio || 'media'] - PRIO_ORDEM[b.prio || 'media'];
}
export function hist(t, txt) {
  t.historico = t.historico || [];
  t.historico.unshift({ em: Date.now(), txt });
  if (t.historico.length > 60) t.historico.length = 60;
  t.atualizadoEm = Date.now();
}
export function definirStatus(t, s) {
  if (t.status === s) return;
  hist(t, `Status: ${STATUS[t.status] || t.status} → ${STATUS[s]}`);
  t.status = s;
  t.concluidaEm = s === 'concluida' ? Date.now() : null;
}
export function definirPrazo(t, data) {
  if (t.prazo === data) return;
  hist(t, t.prazo ? (data ? `Prazo: ${fmtDM(t.prazo)} → ${fmtDM(data)}` : 'Prazo removido') : `Prazo definido: ${fmtDM(data)}`);
  t.prazo = data;
  if (!data) t.hora = '';
}
/** Filtros da tela de tarefas: status, prioridade, categoria e período. */
export function passaFiltroTarefa(t, f, t0 = today()) {
  if (!passaFiltro(t)) return false;
  if (f.status === 'abertas' && !aberta(t)) return false;
  if (f.status === 'concluidas' && t.status !== 'concluida') return false;
  if (f.status === 'canceladas' && t.status !== 'cancelada') return false;
  if (f.prio && (t.prio || 'media') !== f.prio) return false;
  if (f.cat && (t.categoria || '') !== f.cat) return false;
  if (f.periodo) {
    if (f.periodo === 'atrasadas' && !atrasada(t, t0)) return false;
    if (f.periodo === 'hoje' && t.prazo !== t0) return false;
    if (f.periodo === '7' && !(t.prazo && t.prazo >= t0 && t.prazo <= addDays(t0, 7))) return false;
    if (f.periodo === '30' && !(t.prazo && t.prazo >= t0 && t.prazo <= addDays(t0, 30))) return false;
    if (f.periodo === 'semprazo' && t.prazo) return false;
  }
  return true;
}
export const categorias = () => [...new Set(app.db.tarefas.map(t => (t.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// ---------- captura rápida ----------
const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
/**
 * Interpreta um texto livre. Ex.: "amanhã 14h reunião CAPS #coord !alta"
 * Reconhece: hoje, amanhã, depois de amanhã, dias da semana, 15/11, dia 15, 14h, 14h30, 14:30, às 9,
 * #serviço (início do nome), !alta / !! / !baixa.
 */
export function interpretar(texto, hoje = today()) {
  const r = { titulo: '', data: '', hora: '', servico: '', prio: '', marcas: [] };
  let s = ' ' + String(texto || '').replace(/\s+/g, ' ') + ' ';
  const tira = (re, fn) => { s = s.replace(re, (...m) => (fn(...m) === false ? m[0] : ' ')); };

  tira(/\s#([\p{L}\p{N}_.\-]+)(?=\s)/gu, (m, t) => {
    const n = norm(t).replace(/[-_.]/g, '');
    const lista = app.db.servicos.filter(x => !x.arquivado);
    const sem = x => norm(x.nome).replace(/[\s\-_.]/g, '');
    const sv = lista.find(x => sem(x) === n) || lista.find(x => sem(x).startsWith(n)) || lista.find(x => sem(x).includes(n))
      || lista.find(x => norm(x.nome).split(/\s+/).some(w => w.startsWith(n)));
    if (!sv) return false;
    r.servico = sv.id;
  });
  tira(/\s(?:!!+|!alta|!urgente)(?=\s)/giu, () => { r.prio = 'alta'; });
  tira(/\s!baixa(?=\s)/giu, () => { r.prio = 'baixa'; });
  tira(/\s!(?:normal|m[eé]dia)(?=\s)/giu, () => { r.prio = 'media'; });
  tira(/\s!(?=\s)/gu, () => { r.prio = 'alta'; });

  tira(/\sdepois de amanh[ãa](?=\s)/giu, () => { r.data = addDays(hoje, 2); });
  tira(/\samanh[ãa](?=\s)/giu, () => { r.data = addDays(hoje, 1); });
  tira(/\shoje(?=\s)/giu, () => { r.data = hoje; });
  tira(/\s(?:(na|no|nesta|neste|pr[óo]xim[ao])\s)?(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?(?=\s)/giu, (m, pre, dia) => {
    const alvo = DIAS[norm(dia)];
    let diff = (alvo - parse(hoje).getDay() + 7) % 7;
    if (diff === 0 && pre && /^pr/i.test(pre)) diff = 7;
    r.data = addDays(hoje, diff);
  });
  tira(/\s(?:dia\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/gu, (m, d, mo, a) => {
    d = +d; mo = +mo; if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
    let ano = a ? (+a < 100 ? 2000 + +a : +a) : +hoje.slice(0, 4);
    let iso_ = `${ano}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!a && iso_ < hoje) iso_ = `${ano + 1}${iso_.slice(4)}`;
    r.data = iso_;
  });
  tira(/\sdia\s(\d{1,2})(?=\s)/giu, (m, d) => {
    d = +d; if (d < 1 || d > 31) return false;
    let base = hoje.slice(0, 8) + String(d).padStart(2, '0');
    if (base < hoje) { const x = parse(hoje.slice(0, 8) + '01'); x.setMonth(x.getMonth() + 1); base = iso(x).slice(0, 8) + String(d).padStart(2, '0'); }
    r.data = base;
  });
  tira(/\s(?:[àa]s?\s)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:min)?(?=\s)/giu, (m, h, m1, m2) => {
    h = +h; const mi = +(m1 || m2 || 0); if (h > 23 || mi > 59) return false;
    r.hora = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  });
  tira(/\s[àa]s\s(\d{1,2})(?=\s)/giu, (m, h) => { h = +h; if (h > 23) return false; r.hora = String(h).padStart(2, '0') + ':00'; });

  r.titulo = s.replace(/\s+/g, ' ').trim();
  if (r.titulo) r.titulo = r.titulo[0].toUpperCase() + r.titulo.slice(1);
  if (r.hora && !r.data) r.data = hoje;
  return r;
}

// ---------- busca global ----------
export function buscar(q) {
  const n = norm(q);
  if (n.length < 2) return null;
  const tem = (...xs) => xs.some(x => x && norm(x).includes(n));
  const db = app.db;
  return {
    tarefas: db.tarefas.filter(t => tem(t.titulo, t.notas, t.categoria, ...(t.subtarefas || []).map(s => s.titulo))).sort(ordTarefa).slice(0, 40),
    eventos: db.eventos.filter(e => tem(e.titulo, e.local, e.notas, e.tipo === 'atendimento' ? (paciente(e.pac) || {}).nome : '')).slice(0, 40),
    pacientes: db.pacientes.filter(p => tem(p.nome, p.obs, p.tel)).slice(0, 30),
    servicos: db.servicos.filter(s => tem(s.nome)).slice(0, 20),
  };
}
/** Próxima ocorrência de um evento (ou a última, se já passou). */
export function proximaOcorrencia(ev) {
  const t0 = today();
  const prox = ocorrenciasDe([ev], t0, addDays(t0, 400))[0];
  if (prox) return prox;
  const passadas = ocorrenciasDe([ev], ev.data, addDays(t0, -1));
  return passadas[passadas.length - 1] || null;
}

// ---------- indicadores ----------
/** Números de um período (datas inclusive), respeitando os filtros ativos. */
export function resumo(de, ate) {
  const ocs = ocorrencias(de, ate);
  const ini = at(de, '00:00').getTime(), fim = at(addDays(ate, 1), '00:00').getTime();
  const tarefas = app.db.tarefas.filter(passaFiltro);
  const concl = tarefas.filter(t => t.status === 'concluida' && t.concluidaEm >= ini && t.concluidaEm < fim);
  const previstas = tarefas.filter(t => t.prazo && t.prazo >= de && t.prazo <= ate && t.status !== 'cancelada');
  const at_ = ocs.filter(o => o.ev.tipo === 'atendimento');
  const r = {
    ocorrencias: ocs.length,
    minutos: ocs.filter(o => o.status !== 'desmarcou').reduce((s, o) => s + duracaoMin(o), 0),
    concluidas: concl.length,
    previstas: previstas.length,
    previstasConcluidas: previstas.filter(t => t.status === 'concluida').length,
    atend: { total: at_.length, realizado: at_.filter(o => o.status === 'realizado').length, faltou: at_.filter(o => o.status === 'faltou').length, desmarcou: at_.filter(o => o.status === 'desmarcou').length },
    porDia: [],
  };
  for (let d = de; d <= ate; d = addDays(d, 1)) {
    const a = at(d, '00:00').getTime(), b = a + 864e5;
    r.porDia.push({ data: d, compromissos: ocs.filter(o => o.data === d).length, concluidas: concl.filter(t => t.concluidaEm >= a && t.concluidaEm < b).length });
  }
  return r;
}
export const semanaAtual = (t0 = today()) => [inicioSemana(t0), addDays(inicioSemana(t0), 6)];
