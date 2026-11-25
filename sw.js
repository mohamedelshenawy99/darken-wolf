/* دارك وولف — service worker */
var CACHE = 'dw-v27';
var ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png',
  'photo-hinge.jpg', 'photo-drawer-slide.jpg', 'photo-handle.jpg', 'photo-gas-strut.jpg',
  'photo-leg.jpg', 'photo-led-strip.jpg', 'photo-alu-profile.jpg', 'photo-roller.jpg',
  'photo-lock.jpg', 'photo-epdm.jpg', 'photo-mesh.jpg', 'photo-upvc-handle.jpg', 'photo-tools.jpg', 'photo-brushes.jpg', 'photo-rubber.jpg', 'photo-adhesive.jpg', 'photo-awning.jpg', 'photo-pullout.jpg', 'photo-basket.jpg', 'photo-upvc-handle-vega.jpg'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'no-cache' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.origin === self.location.origin && /app\.js|index\.html|config\.js|styles\.css|manifest\.webmanifest/.test(url.pathname)) {
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    });
  }));
});
