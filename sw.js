/* sw.js — service worker sederhana agar aplikasi bisa dipasang dan dibuka offline.
 *
 * PENTING: setiap kali Anda mengubah file aplikasi, naikkan angka VERSI di bawah
 * (misal 'v1' -> 'v2') supaya perangkat pengguna mengambil file yang baru.
 */
var VERSI = 'v3';
var CACHE = 'habit-tracker-' + VERSI;

var FILE_AWAL = [
  './',
  './index.html',
  './style.css',
  './utils.js',
  './storage.js',
  './supabase-config.js',
  './app.js',
  './manifest.webmanifest',
  './vendor/vue.global.prod.js',
  './fonts/montserrat-latin-400-normal.woff2',
  './fonts/montserrat-latin-500-normal.woff2',
  './fonts/montserrat-latin-600-normal.woff2',
  './fonts/montserrat-latin-700-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(FILE_AWAL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Ambil dari jaringan dulu (agar selalu terbaru); jika offline, pakai salinan tersimpan.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // permintaan ke luar (misal Supabase) tidak disentuh

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
