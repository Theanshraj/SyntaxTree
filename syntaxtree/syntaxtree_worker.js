// Service Worker for SyntaxTree web app
// Handles offline caching, resource prefetching, and cache management

const CACHE_VERSION = 7; // Increment to force cache refresh
const CACHE_NAME = `syntaxtree-cache-v${CACHE_VERSION}`; // Unique cache name
const CACHE_FILES = [
  '/syntaxtree/',                   // Root
  '/syntaxtree/index.html',         // Main HTML
  '/syntaxtree/default.css',        // Stylesheet
  '/syntaxtree/syntaxtree_icon.png',// App icon
  '/syntaxtree/syntaxtree.webmanifest', // PWA manifest
  '/syntaxtree/canvas.js',          // Canvas logic
  '/syntaxtree/parser.js',          // Parser logic
  '/syntaxtree/syntaxtree.js',      // Main app logic
  '/syntaxtree/tip.js',             // Tips logic
  '/syntaxtree/tokenizer.js',       // Tokenizer logic
  '/syntaxtree/tree.js',            // Tree rendering logic
];
 
// Store a response in the cache for a given request
async function cacheStore(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}

// Try to serve from cache first, then fall back to network and cache the result
async function cacheFirst(request) {
  const cached_response = await caches.match(request);
  if (cached_response) {
    console.info(`[Service Worker] Returning cached ${request.url} ...`);
    return cached_response;
  }

  const network_response = await fetch(request);
  cacheStore(request, network_response.clone()); // Cache the network response
  return network_response;
}

// Install event: prefetch and cache all required files
self.addEventListener('install', (event) => {
  console.info('[Service Worker] Install');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache
        .addAll(CACHE_FILES.map((url) => new Request(url, {cache: 'reload', mode: 'no-cors'})))
        .then(() => {
          console.info('[Service Worker] Resources pre-fetched.');
        })
      )     
      .catch((error) => console.error('[Service Worker] Pre-fetching failed'))
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.info('[Service Worker] Activate');

  event.waitUntil(caches.keys().then((key_list) => 
    Promise.all(key_list.map((key) => {
      if (key === CACHE_NAME) return;
      console.log(`[Service Worker] Deleting cache ${key} ...`);
      return caches.delete(key);
    }))
  ));
});

// Fetch event: respond with cacheFirst strategy
self.addEventListener('fetch', (event) => {
  console.info(`[Service Worker] Fetching ${event.request.url} ...`);
  event.respondWith(cacheFirst(event.request));
});
