// Busca global: tarefas, compromissos, pacientes e serviços.
import { esc, ic, fmtRel, fmtShort, STATUS, TIPO } from './app-util.js';
import { app, servico } from './app-dados.js';
import { buscar, proximaOcorrencia, evTitulo, aberta } from './app-regras.js';
import { acoes, aoDigitar, abrirFolha, cabecalho } from './app-ui.js';

acoes.buscaAbrir = () => {
  abrirFolha(cabecalho('Buscar') + `<div class="card search">${ic('search')}<input id="buscaGlobal" type="search" placeholder="Tarefas, compromissos, pacientes, serviços…" autocomplete="off" autofocus></div><div id="buscaRes" class="top"><p class="note">Digite pelo menos 2 letras. A busca ignora acentos.</p></div>`);
};
aoDigitar.push(el => { if (el.id === 'buscaGlobal') resultados(el.value); });

function resultados(q) {
  const box = document.getElementById('buscaRes'); if (!box) return;
  const r = buscar(q);
  if (!r) { box.innerHTML = '<p class="note">Digite pelo menos 2 letras. A busca ignora acentos.</p>'; return; }
  const grupo = (titulo, itens) => itens.length ? `<h2>${titulo} <span class="cnt">${itens.length}</span></h2><div class="sec">${itens.join('')}</div>` : '';
  const cor = id => (servico(id) || {}).cor || 'var(--line)';
  const tarefas = r.tarefas.map(t => `<button class="item" data-act="tarefa" data-id="${t.id}"><i class="sw" style="--c:${cor(t.servico)}"></i><div class="grow"><div class="t ${aberta(t) ? '' : 'riscado'}">${esc(t.titulo)}</div><div class="meta">${STATUS[t.status]}${t.prazo ? ' · ' + fmtRel(t.prazo) : ''}</div></div></button>`);
  const eventos = r.eventos.map(ev => { const o = proximaOcorrencia(ev); return `<button class="item" ${o ? `data-act="ocorrencia" data-id="${ev.id}" data-orig="${o.orig}"` : ''}><i class="sw" style="--c:${cor(ev.servico)}"></i><div class="grow"><div class="t">${esc(evTitulo(ev))}</div><div class="meta">${TIPO[ev.tipo]}${o ? ' · ' + fmtShort(o.data) + ' ' + o.ini : ''}${ev.rep !== 'nao' ? ' · repete' : ''}</div></div></button>`; });
  const pacs = r.pacientes.map(p => `<button class="item" data-act="paciente" data-id="${p.id}">${ic('user')}<div class="grow"><div class="t">${esc(app.db.cfg.discreto ? p.nome.split(/\s+/).map(w => w[0] + '.').join(' ') : p.nome)}</div><div class="meta">${p.ativo === false ? 'Arquivado' : 'Paciente'}${p.pront ? ' · Pront. ' + esc(p.pront) : ''}</div></div></button>`);
  const svs = r.servicos.map(s => `<button class="item" data-act="servico" data-id="${s.id}"><i class="sw" style="--c:${s.cor}"></i><div class="grow"><div class="t">${esc(s.nome)}</div></div></button>`);
  const html = grupo('Tarefas', tarefas) + grupo('Agenda', eventos) + grupo('Pacientes', pacs) + grupo('Serviços', svs);
  box.innerHTML = html || '<div class="empty sm">Nada encontrado.</div>';
}
