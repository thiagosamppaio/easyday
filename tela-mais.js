// "Mais": atalhos para módulos, preferências, lembretes, privacidade, backup e cópias automáticas.
import { $, esc, ic, today, LEMB, TIPO, TEMAS, plural, diasSemBackup, emailValido } from './app-util.js';
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

  <h2>Minha conta</h2><div class="sec"><button class="item" data-act="conta">${ic('user')}<div class="grow"><div class="t">${db.nome ? esc(db.nome) : 'Seu nome'}</div><div class="meta">${db.cfg.backup.email ? esc(db.cfg.backup.email) : 'Cadastre seu e-mail para receber os backups'}</div></div>${ic('r')}</button></div>

  <h2>Aparência</h2><div class="temas">${Object.entries(TEMAS).map(([k, t]) => `<button class="tema ${(db.cfg.tema || 'classico') === k ? 'on' : ''}" data-act="tema" data-tema="${k}"><span class="amostra">${t.cores.map(c => `<i style="background:${c}"></i>`).join('')}</span>${t.nome}</button>`).join('')}</div>
  <p class="note">O modo claro ou escuro segue o do celular. Cada tema tem as duas versões.</p>

  <h2>Lembretes</h2><div class="sec">
   <div class="item"><div class="grow"><div class="t">Notificações</div><div class="meta">${pTxt}</div></div>${perm === 'default' || (nat && perm === 'denied') ? `<button class="chip on" data-act="permissao">${perm === 'denied' ? 'Abrir ajustes' : 'Ativar'}</button>` : ''}</div>
   <button class="item" data-act="testeAlerta">${ic('bell')}<div class="grow">Testar alerta</div></button>
   <button class="item" data-act="cfgAtraso">${ic('alert')}<div class="grow"><div class="t">Tarefas atrasadas</div><div class="meta">${textoAtraso(db.cfg.atraso)}</div></div>${ic('r')}</button>
   <button class="item" data-act="lembretesPadrao">${ic('clock')}<div class="grow"><div class="t">Lembrete padrão</div><div class="meta">${Object.entries(TIPO).map(([k, v]) => v + ': ' + LEMB[String(db.cfg.lembretePadrao[k])].toLowerCase()).join(' · ')} · Tarefa: ${LEMB[String(db.cfg.lembretePadrao.tarefa)].toLowerCase()}</div></div>${ic('r')}</button>
  </div>
  <p class="note">${nat ? 'Os alertas chegam mesmo com o app fechado e o celular bloqueado. Se o celular economiza bateria de forma agressiva, deixe o app como <b>Sem restrições</b> nos ajustes de bateria.' : 'Os alertas tocam quando o app está aberto ou foi usado há pouco. Para alarme garantido com o celular bloqueado, use o APK ou o botão <b>Google Agenda</b> no compromisso.'}</p>

  <h2>Privacidade</h2><div class="sec"><div class="item"><div class="grow"><div class="t">Modo discreto</div><div class="meta">Mostra só as iniciais dos pacientes na tela</div></div><label class="tog"><input type="checkbox" data-cfg="discreto" ${db.cfg.discreto ? 'checked' : ''}><span></span></label></div></div>
  <p class="note">Seus dados ficam só neste aparelho e não vão para a internet. Cada pessoa que instala o app tem a própria agenda. Nas notificações, pacientes aparecem sempre por iniciais.</p>

  <h2>Backup e segurança</h2><div class="sec">
   <button class="item" data-act="enviarBackup">${ic('send')}<div class="grow"><div class="t">Enviar backup por e-mail</div><div class="meta">${textoBackup(db.cfg)}</div></div></button>
   <button class="item" data-act="exportar">${ic('save')}<div class="grow"><div class="t">Salvar backup no aparelho</div><div class="meta">Gera um arquivo com todos os dados</div></div></button>
   <button class="item" data-act="importar">${ic('rep')}<div class="grow"><div class="t">Restaurar de arquivo</div><div class="meta">Uma cópia do estado atual é guardada antes</div></div></button>
   <button class="item" data-act="copias">${ic('hist')}<div class="grow"><div class="t">Cópias automáticas</div><div class="meta">Uma por dia, das últimas 7 aberturas</div></div>${ic('r')}</button>
  </div>
  <p class="note">${db.cfg.backup.lembrete ? 'O app lembra você de enviar o backup uma vez por semana. ' : ''}Para restaurar num celular novo, baixe o anexo do e-mail e use <b>Restaurar de arquivo</b>. Se o app for desinstalado${nat ? '' : ' ou os dados do navegador forem apagados'}, as cópias automáticas também se perdem.</p>
  ${!idbDisponivel() ? '<div class="banner">' + ic('alert') + '<span>O armazenamento principal não está disponível neste navegador; usando o modo de reserva. Faça backups com frequência.</span></div>' : ''}
  ${instalacao.evento ? `<div class="btns"><button class="btn pri" data-act="instalar">Instalar app neste aparelho</button></div>` : ''}
  <div class="btns"><button class="btn dan" data-act="zerar">Apagar todos os dados</button></div>
  <p class="note centro">EasyDay · versão ${VERSAO_APP}${nat ? ' (Android)' : ''}</p>`;
}
telas.mais = { render, fab: null };

acoes.tema = el => { app.db.cfg.tema = el.dataset.tema; salvar(); app.render(); };
acoes.permissao = () => pedirPermissao(false);
acoes.testeAlerta = () => { pedirPermissao(true); setTimeout(() => avisar('Teste de alerta', 'Assim chegam os lembretes da sua agenda', 'teste'), 400); };
aoMudar.push(el => { if (el.dataset && el.dataset.cfg === 'discreto') { app.db.cfg.discreto = el.checked; salvar(); aviso(el.checked ? 'Modo discreto ativado' : 'Modo discreto desativado'); } });

const INTERVALOS_ATRASO = { 30: 'A cada 30 min', 60: 'A cada 1 hora', 120: 'A cada 2 horas', 180: 'A cada 3 horas', 240: 'A cada 4 horas', 360: 'A cada 6 horas' };
function textoAtraso(c) {
  if (!c || !c.ativo) return 'Desligado';
  return `${(INTERVALOS_ATRASO[c.intervalo] || 'A cada ' + c.intervalo + ' min')}, das ${c.de} às ${c.ate}, enquanto houver tarefa com prazo vencido`;
}
acoes.cfgAtraso = () => {
  const c = app.db.cfg.atraso;
  abrirFolha(cabecalho('Tarefas atrasadas') + `<form data-form="cfgAtraso"><p class="note top">Quando uma tarefa passa do dia do prazo sem ser concluída, o app avisa com som de tempos em tempos, até você concluir, adiar ou cancelar a tarefa.</p>
  <div class="f sec"><div class="item"><div class="grow"><div class="t">Avisar tarefas atrasadas</div></div><label class="tog"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}><span></span></label></div></div>
  <div class="f"><label class="l">Frequência</label><select class="in" name="intervalo">${Object.entries(INTERVALOS_ATRASO).map(([k, v]) => `<option value="${k}" ${String(c.intervalo) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="f g2"><div><label class="l">A partir de</label><input class="in" type="time" name="de" value="${c.de}" required></div><div><label class="l">Até</label><input class="in" type="time" name="ate" value="${c.ate}" required></div></div>
  <div class="hint">Fora desse horário o app não avisa (para não tocar de madrugada).</div>
  <div class="btns"><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
forms.cfgAtraso = f => {
  if (!f.de.value || !f.ate.value || f.ate.value < f.de.value) return aviso('Confira o horário: o fim precisa ser depois do início');
  app.db.cfg.atraso = { ativo: f.ativo.checked, intervalo: Number(f.intervalo.value), de: f.de.value, ate: f.ate.value };
  salvar(); fecharFolha(); app.render(); aviso('Salvo');
  if (f.ativo.checked) pedirPermissao(true);
};
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

// ---------- minha conta (fica só no aparelho: serve para enviar o backup ao seu e-mail) ----------
function textoBackup(cfg) {
  const d = diasSemBackup(cfg), para = cfg.backup.email ? 'Para ' + cfg.backup.email : 'Cadastre seu e-mail em Minha conta';
  return para + ' · ' + (d === null ? 'nenhum backup ainda' : d === 0 ? 'último backup hoje' : d === 1 ? 'último backup ontem' : `último backup há ${d} dias`);
}
acoes.conta = () => {
  const b = app.db.cfg.backup;
  abrirFolha(cabecalho('Minha conta') + `<form data-form="conta">
  <div class="f"><label class="l">Nome</label><input class="in" name="nome" value="${esc(app.db.nome)}" placeholder="Como quer ser chamado(a)" maxlength="30"></div>
  <div class="f"><label class="l">E-mail</label><input class="in" type="email" name="email" value="${esc(b.email)}" placeholder="seuemail@gmail.com" maxlength="80" autocomplete="email"><div class="hint">É para onde o backup da agenda é enviado. Fica guardado só neste aparelho.</div></div>
  <div class="f sec"><div class="item"><div class="grow"><div class="t">Lembrete semanal de backup</div><div class="meta">Avisa quando passar 7 dias sem backup</div></div><label class="tog"><input type="checkbox" name="lembrete" ${b.lembrete ? 'checked' : ''}><span></span></label></div></div>
  <div class="btns"><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
forms.conta = f => {
  const email = f.email.value.trim();
  if (email && !emailValido(email)) return aviso('Confira o e-mail');
  app.db.nome = f.nome.value.trim();
  Object.assign(app.db.cfg.backup, { email, lembrete: f.lembrete.checked });
  salvar(); fecharFolha(); app.render(); aviso('Salvo');
};
const marcarBackup = () => { app.db.cfg.backup.ultimo = Date.now(); salvar(); };
acoes.enviarBackup = async () => {
  const b = app.db.cfg.backup;
  if (!b.email) { aviso('Cadastre seu e-mail primeiro'); acoes.conta(); return; }
  const nome = 'easyday-backup-' + today() + '.json';
  const assunto = 'Backup EasyDay ' + today().split('-').reverse().join('/');
  const texto = 'Backup da agenda EasyDay em anexo. Para restaurar: baixe o arquivo e, no app, use Mais › Restaurar de arquivo.';
  marcarBackup();
  const json = JSON.stringify(app.db);
  if (app.nativo) {
    try {
      if (typeof app.nativo.enviarArquivo === 'function') app.nativo.enviarArquivo(nome, json, b.email, assunto, texto);
      else { app.nativo.salvarArquivo(nome, json); aviso('Atualize o APK para enviar direto por e-mail'); }
    } catch (e) { aviso('Não foi possível enviar'); }
    app.render(); return;
  }
  const arq = new File([json], nome, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [arq] })) {
      await navigator.share({ files: [arq], title: assunto, text: texto + ' (Envie para: ' + b.email + ')' });
      app.render(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  // computador: baixa o arquivo e abre o e-mail já endereçado (o anexo é colocado à mão)
  acoes.exportar(true);
  location.href = `mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto + '\n\n(Anexe o arquivo ' + nome + ', que acabou de ser baixado.)')}`;
};
forms.nome = f => { app.db.nome = f.nome.value.trim(); app.db.cfg.boas = true; salvar(); fecharFolha(); app.render(); };

// ---------- backup ----------
acoes.exportar = (silencioso) => {
  marcarBackup();
  const nome = 'easyday-backup-' + today() + '.json', json = JSON.stringify(app.db);
  if (app.nativo) { try { app.nativo.salvarArquivo(nome, json); } catch (e) { aviso('Não foi possível exportar'); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); if (silencioso !== true) aviso('Backup gerado');
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
