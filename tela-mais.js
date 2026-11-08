// "Mais": atalhos para módulos, preferências, lembretes, privacidade, backup e cópias automáticas.
import { $, esc, ic, today, LEMB, TIPO, plural } from './app-util.js';
import { app, salvar, VERSAO_APP, listarCopias, lerCopia, substituirDados, migrar, novo, idbDisponivel, marcarDesfazer } from './app-dados.js';
import { aberta } from './app-regras.js';
import { acoes, forms, telas, aoMudar, abrirFolha, fecharFolha, cabecalho, aviso, cabecalhoTela } from './app-ui.js';
import { permissaoAtual, pedirPermissao, avisar } from './app-notif.js';

export const instalacao = { evento: null };

function render() {
  const db = app.db, perm = permissaoAtual(), nat = !!app.nativo;
  const pTxt = { granted: 'Ativadas', denied: nat ? 'Desativadas nos ajustes do celular' : 'Bloqueadas no navegador', default: 'Desativadas', indisponivel: 'Não suportadas aqui' }[perm] || perm;
  const ativos = db.pacientes.filter(p => p.ativo !== false).length;
  return `${cabecalhoTela('Organização e ajustes', 'Mais')}
  <div class="sec">
   <button class="item" data-act="tab" data-tab="servicos">${ic('layers')}<div class="grow"><div class="t">Serviços</div><div class="meta">${plural(db.servicos.filter(s => !s.arquivado).length, 'frente de atuação', 'frentes de atuação')}</div></div>${ic('r')}</button>
   <button class="item" data-act="tab" data-tab="pacientes">${ic('users')}<div class="grow"><div class="t">Pacientes</div><div class="meta">${plural(ativos, 'ativo')}</div></div>${ic('r')}</button>
  </div>
  <p class="note">Projetos, Anotações e Relatórios chegam na próxima atualização.</p>

  <h2>Você</h2><div class="sec"><button class="item" data-act="nome"><div class="grow"><div class="t">${db.nome ? esc(db.nome) : 'Como quer ser chamado?'}</div><div class="meta">Nome exibido na saudação</div></div>${ic('r')}</button></div>

  <h2>Lembretes</h2><div class="sec">
   <div class="item"><div class="grow"><div class="t">Notificações</div><div class="meta">${pTxt}</div></div>${perm === 'default' || (nat && perm === 'denied') ? `<button class="chip on" data-act="permissao">${perm === 'denied' ? 'Abrir ajustes' : 'Ativar'}</button>` : ''}</div>
   <button class="item" data-act="testeAlerta">${ic('bell')}<div class="grow">Testar alerta</div></button>
   <button class="item" data-act="lembretesPadrao">${ic('clock')}<div class="grow"><div class="t">Lembrete padrão</div><div class="meta">${Object.entries(TIPO).map(([k, v]) => v + ': ' + LEMB[String(db.cfg.lembretePadrao[k])].toLowerCase()).join(' · ')} · Tarefa: ${LEMB[String(db.cfg.lembretePadrao.tarefa)].toLowerCase()}</div></div>${ic('r')}</button>
  </div>
  <p class="note">${nat ? 'Os alertas chegam mesmo com o app fechado e o celular bloqueado. Se o celular economiza bateria de forma agressiva, deixe o app como <b>Sem restrições</b> nos ajustes de bateria.' : 'Os alertas tocam quando o app está aberto ou foi usado há pouco. Para alarme garantido com o celular bloqueado, use o APK ou o botão <b>Google Agenda</b> no compromisso.'}</p>

  <h2>Privacidade</h2><div class="sec"><div class="item"><div class="grow"><div class="t">Modo discreto</div><div class="meta">Mostra só as iniciais dos pacientes na tela</div></div><label class="tog"><input type="checkbox" data-cfg="discreto" ${db.cfg.discreto ? 'checked' : ''}><span></span></label></div></div>
  <p class="note">Seus dados ficam só neste aparelho e não vão para a internet. Cada pessoa que instala o app tem a própria agenda. Nas notificações, pacientes aparecem sempre por iniciais.</p>

  <h2>Backup e segurança</h2><div class="sec">
   <button class="item" data-act="exportar">${ic('save')}<div class="grow"><div class="t">Exportar backup</div><div class="meta">Gera um arquivo com todos os dados</div></div></button>
   <button class="item" data-act="importar">${ic('rep')}<div class="grow"><div class="t">Restaurar de arquivo</div><div class="meta">Uma cópia do estado atual é guardada antes</div></div></button>
   <button class="item" data-act="copias">${ic('hist')}<div class="grow"><div class="t">Cópias automáticas</div><div class="meta">Uma por dia, das últimas 7 aberturas</div></div>${ic('r')}</button>
  </div>
  <p class="note">Exporte um backup de vez em quando e guarde fora do celular (Drive, e-mail). Se o app for desinstalado${nat ? '' : ' ou os dados do navegador forem apagados'}, as cópias automáticas também se perdem.</p>
  ${!idbDisponivel() ? '<div class="banner">' + ic('alert') + '<span>O armazenamento principal não está disponível neste navegador; usando o modo de reserva. Faça backups com frequência.</span></div>' : ''}
  ${instalacao.evento ? `<div class="btns"><button class="btn pri" data-act="instalar">Instalar app neste aparelho</button></div>` : ''}
  <div class="btns"><button class="btn dan" data-act="zerar">Apagar todos os dados</button></div>
  <p class="note centro">EasyDay · versão ${VERSAO_APP}${nat ? ' (Android)' : ''}</p>`;
}
telas.mais = { render, fab: null };

acoes.permissao = () => pedirPermissao(false);
acoes.testeAlerta = () => { pedirPermissao(true); setTimeout(() => avisar('Teste de alerta', 'Assim chegam os lembretes da sua agenda', 'teste'), 400); };
aoMudar.push(el => { if (el.dataset && el.dataset.cfg === 'discreto') { app.db.cfg.discreto = el.checked; salvar(); aviso(el.checked ? 'Modo discreto ativado' : 'Modo discreto desativado'); } });

acoes.lembretesPadrao = () => {
  const lp = app.db.cfg.lembretePadrao;
  const sel = (k, n) => `<div class="f"><label class="l">${n}</label><select class="in" name="${k}">${Object.entries(LEMB).map(([v, t]) => `<option value="${v}" ${String(lp[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  abrirFolha(cabecalho('Lembrete padrão') + `<form data-form="lembretesPadrao"><p class="note top">Valor que já vem escolhido ao criar cada tipo de item. Você pode mudar em cada um.</p>
  ${Object.entries(TIPO).map(([k, n]) => sel(k, n)).join('')}${sel('tarefa', 'Tarefa (com prazo e horário)')}
  <div class="btns"><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
forms.lembretesPadrao = f => { for (const k of ['atendimento', 'compromisso', 'atividade', 'tarefa']) app.db.cfg.lembretePadrao[k] = Number(f[k].value); salvar(); fecharFolha(); app.render(); aviso('Salvo'); };

export function formNome() {
  const boas = app.db.cfg.boas;
  abrirFolha(cabecalho(boas ? 'Seu nome' : 'Bem-vindo(a)!', boas ? '' : ' ') + `
  ${!boas ? `<p class="note top big">Esta é a sua agenda pessoal. Tudo o que você registrar fica guardado <b>só neste aparelho</b>.</p>` : ''}
  <form data-form="nome"><div class="f"><label class="l">Como quer ser chamado(a)?</label><input class="in" name="nome" value="${esc(app.db.nome)}" placeholder="Seu nome" maxlength="30"></div>
  ${!boas ? `<p class="note">Depois, em <b>Mais › Serviços</b>, crie as frentes que quiser organizar (há sugestões prontas), cada uma com sua cor.</p>` : ''}
  <div class="btns"><button class="btn pri" type="submit">${boas ? 'Salvar' : 'Começar'}</button></div></form>`);
}
acoes.nome = formNome;
forms.nome = f => { app.db.nome = f.nome.value.trim(); app.db.cfg.boas = true; salvar(); fecharFolha(); app.render(); };

// ---------- backup ----------
acoes.exportar = () => {
  const nome = 'easyday-backup-' + today() + '.json', json = JSON.stringify(app.db);
  if (app.nativo) { try { app.nativo.salvarArquivo(nome, json); } catch (e) { aviso('Não foi possível exportar'); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); aviso('Backup gerado');
};
acoes.importar = () => $('#arquivoImport').click();
export async function importarArquivo(file) {
  const txt = await file.text();
  let d; try { d = JSON.parse(txt); } catch (e) { d = null; }
  if (!d || !d.v || !Array.isArray(d.eventos)) { alert('Este arquivo não é um backup válido do EasyDay.'); return; }
  const m = migrar(d);
  if (!confirm(`Restaurar backup com ${m.eventos.length} itens de agenda, ${m.tarefas.length} tarefas, ${m.pacientes.length} pacientes e ${m.servicos.length} serviços?\n\nOs dados atuais serão substituídos (uma cópia deles fica guardada em Cópias automáticas).`)) return;
  await substituirDados(m); app.render(); aviso('Backup restaurado');
}
acoes.copias = async () => {
  const cs = await listarCopias();
  const rot = c => c.chave.startsWith('dia-') ? 'Início do dia ' + c.chave.slice(4).split('-').reverse().join('/') : c.chave.startsWith('antes-restaurar') ? 'Antes de uma restauração' : c.chave === 'antes-da-versao-2' ? 'Dados da versão anterior do app' : c.chave;
  abrirFolha(cabecalho('Cópias automáticas') + `<p class="note top">O app guarda sozinho uma cópia por dia (das últimas 7 vezes em que foi aberto) e uma antes de cada restauração. Restaurar substitui os dados atuais, que também ficam guardados.</p>
  ${cs.length ? `<div class="sec">${cs.map(c => `<button class="item" data-act="copiaRestaurar" data-chave="${esc(c.chave)}">${ic('hist')}<div class="grow"><div class="t">${rot(c)}</div><div class="meta">${new Date(c.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${Math.max(1, Math.round(c.tam / 1024))} KB</div></div><span class="link">Restaurar</span></button>`).join('')}</div>` : '<div class="empty sm">Ainda não há cópias. A primeira é feita amanhã, ao abrir o app.</div>'}`);
};
acoes.copiaRestaurar = async el => {
  const d = await lerCopia(el.dataset.chave); if (!d) return aviso('Cópia não encontrada');
  if (!confirm(`Restaurar esta cópia (${d.eventos.length} itens de agenda, ${d.tarefas.length} tarefas)? Os dados atuais ficam guardados como cópia.`)) return;
  await substituirDados(d); fecharFolha(); app.render(); aviso('Cópia restaurada');
};
acoes.zerar = () => {
  if (!confirm('Apagar TODOS os dados desta agenda?')) return;
  if (!confirm('Tem certeza? Se não exportou um backup, os dados só poderão voltar pelas cópias automáticas.')) return;
  marcarDesfazer();
  substituirDados(Object.assign(novo(), { cfg: Object.assign(novo().cfg, { boas: true }) })).then(() => { app.st.filtro = ''; app.render(); aviso('Dados apagados', true); });
};
acoes.instalar = () => { if (instalacao.evento) { instalacao.evento.prompt(); instalacao.evento.userChoice.finally(() => { instalacao.evento = null; app.render(); }); } };
export { aberta };
