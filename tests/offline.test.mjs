import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
test('model-page navigation never overwrites the calculator offline document',async()=>{
 const base='https://test.example/battery-lab/',store=new Map(),handlers={};let online=true;
 const key=x=>new URL(typeof x==='string'?x:x.url,base).href;
 const read=async x=>{const url=new URL(key(x));const filename=url.pathname.slice('/battery-lab/'.length)||'index.html';return new Response(await fs.readFile(new URL('../'+filename,import.meta.url)));};
 const caches={open:async()=>({addAll:async paths=>{for(const p of paths)store.set(key(p),await read(p));},put:async(k,v)=>store.set(key(k),v.clone())}),keys:async()=>[],match:async k=>store.get(key(k))?.clone()};
 const context={self:{location:{origin:'https://test.example'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches,URL,fetch:async request=>{if(!online)throw Error('offline');return read(request);}};
 vm.runInNewContext(await fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
 const promises=[];handlers.install({waitUntil:p=>promises.push(p)});await Promise.all(promises);
 const original=await (await caches.match('./index.html')).text();
 async function navigate(path){let response;const pending=[];handlers.fetch({request:{url:base+path,method:'GET',mode:'navigate'},waitUntil:p=>pending.push(p),respondWith:p=>response=p});const result=await response;await Promise.all(pending);return result;}
 await navigate('pybamm.html');assert.equal(await (await caches.match('./index.html')).text(),original);
 online=false;assert.ok((await (await navigate('pybamm.html')).text()).includes('CFD 熱源'));
 assert.equal(await (await navigate('index.html')).text(),original);
});
