// Service worker: funciona offline e busca a versão nova sempre que houver internet.
const V = 'easyday-v2-1';
const ARQUIVOS = ['./', './index.html', './app.css', './app-main.js', './app-util.js', './app-dados.js', './app-regras.js', './app-ui.js', './app-notif.js',
  './tela-inicio.js', './tela-agenda.js', './tela-tarefas.js', './tela-pacientes.js', './tela-servicos.js', './tela-mais.js', './tela-busca.js',
  './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Rede primeiro (até 3 s); sem internet, usa a cópia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' }); clearTimeout(t);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) if ('focus' in c) return c.focus(); return clients.openWindow('./'); }));
});
