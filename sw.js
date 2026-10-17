const CACHE = 'battery-lab-github-v17-cell-labels';
const ASSETS = ['./', './index.html', './styles.css?v=13', './app.js?v=16', './pybamm.html','./pybamm-lab.js?v=2','./pybamm.css?v=2','./pybamm-runner.py','./data/pybamm-examples.json','./licenses/PyBaMM-BSD.txt','./manifest.webmanifest', './icons/icon-192.png?v=7', './icons/icon-512.png?v=7', './apple-touch-icon.png?v=7'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('battery-lab-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    const documentKey=new URL(request.url).pathname.endsWith('/pybamm.html')?'./pybamm.html':'./index.html';
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(documentKey,copy)));
      }
      return response;
    }).catch(()=>caches.match(documentKey)));
    return;
  }
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});

