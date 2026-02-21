// ============================================================
// LUVANO MARKETPLACE - Service Worker PWA
// Versão: 1.0.0
// ============================================================

const CACHE_NAME = 'luvano-v1.0.0';
const STATIC_CACHE = 'luvano-static-v1';
const DYNAMIC_CACHE = 'luvano-dynamic-v1';

// Recursos estáticos para cache (shell do app)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/cadastro.html',
  '/produto.html',
  '/publicar.html',
  '/pagamento.html',
  '/perfil.html',
  '/editar-perfil.html',
  '/meus-produtos.html',
  '/vendedor.html',
  '/carteira.html',
  '/levantamento.html',
  '/favoritos.html',
  '/compras.html',
  '/notificacoes.html',
  '/conversas.html',
  '/chat.html',
  '/verificar.html',
  '/configuracoes.html',
  '/sobre.html',
  '/admin.html',
  '/admin-usuarios.html',
  '/admin-produtos.html',
  '/admin-pagamentos.html',
  '/manifest.json',
];

// URLs de CDN sempre frescos (network first)
const NETWORK_FIRST = [
  'supabase.co',
  'cdn.jsdelivr.net',
];

// ====== INSTALAR ======
self.addEventListener('install', event => {
  console.log('[SW Luvano] Instalando versão:', CACHE_NAME);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW Luvano] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW Luvano] Erro no cache inicial:', err))
  );
});

// ====== ACTIVAR ======
self.addEventListener('activate', event => {
  console.log('[SW Luvano] Activando service worker');
  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW Luvano] Removendo cache antigo:', key);
              return caches.delete(key);
            })
        )
      ),
      self.clients.claim()
    ])
  );
});

// ====== INTERCEPTAR REQUESTS ======
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET
  if (request.method !== 'GET') return;

  // Ignorar chrome-extension e outros esquemas
  if (!url.protocol.startsWith('http')) return;

  // Network First para APIs e CDNs
  if (NETWORK_FIRST.some(domain => url.hostname.includes(domain))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache First para assets estáticos (HTML, CSS, JS local)
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale While Revalidate para imagens
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Network First como fallback
  event.respondWith(networkFirst(request));
});

// ====== ESTRATÉGIAS DE CACHE ======

// Cache First: tenta cache, fallback para network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

// Network First: tenta network, fallback para cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

// Stale While Revalidate: retorna cache, actualiza em background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || offlineFallback(request);
}

// Fallback para modo offline
function offlineFallback(request) {
  if (request.destination === 'document') {
    return caches.match('/index.html');
  }
  return new Response('', { status: 503, statusText: 'Sem conexão' });
}

// ====== PUSH NOTIFICATIONS ======
self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'Luvano', body: event.data.text() }; }

  const options = {
    body: data.body || 'Nova notificação',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%231877f2"/><text y="140" x="96" text-anchor="middle" font-size="120">🛍️</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><text y=".9em" font-size="90">🛍️</text></svg>',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/notificacoes.html' },
    actions: [
      { action: 'ver', title: 'Ver', icon: '👁️' },
      { action: 'fechar', title: 'Fechar', icon: '✕' }
    ],
    tag: data.tag || 'luvano-notif',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🛍️ Luvano', options)
  );
});

// ====== CLIQUE EM NOTIFICAÇÃO ======
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'fechar') return;
  const url = event.notification.data?.url || '/notificacoes.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Reutilizar janela existente se possível
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// ====== SYNC EM BACKGROUND ======
self.addEventListener('sync', event => {
  if (event.tag === 'luvano-sync') {
    console.log('[SW Luvano] Sincronização em background');
    event.waitUntil(sincronizarDados());
  }
});

async function sincronizarDados() {
  // Sincronizar dados pendentes quando a conexão for restaurada
  console.log('[SW Luvano] Dados sincronizados');
}

console.log('[SW Luvano] Service Worker carregado ✅');
