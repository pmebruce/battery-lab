import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateResult,summarize,exportCFD,chart} from '../pybamm-lab.js';
const cases=JSON.parse(fs.readFileSync(new URL('../data/pybamm-examples.json',import.meta.url))).cases;
test('all eight real solver cases have monotonic time, finite results and heat balance',()=>{
 assert.equal(cases.length,8);for(const c of cases){validateResult(c);assert.equal(c.rows.length,121);assert.ok(summarize(c).energy>0);}
 for(const c of cases.filter(x=>x.config.parameters==='Chen2020'))assert.ok(c.rows.every(r=>r[7]===0));
 assert.ok(cases.filter(x=>x.config.parameters==='Marquis2019').some(c=>c.rows.some(r=>Math.abs(r[7])>1e-6)));
});
test('export scales whole-cell heat and converts cm3 to m3 without altering time',()=>{
 const r=cases[0],volume=r.cell_volume_m3*96,csv=exportCFD(r,96,volume).split('\r\n'),v=csv[2].split(',').map(Number),source=r.rows[1];
 assert.equal(v[0],source[0]);assert.equal(v[5],source[4]*96);assert.ok(Math.abs(v[7]-source[4]/r.cell_volume_m3)<1e-8);
 for(const args of [[0,volume],[1.5,volume],[96,0],[96,NaN]])assert.throws(()=>exportCFD(r,...args));
});
test('bad imports fail explicitly and curves never contain invalid coordinates',()=>{
 for(const change of [r=>r.rows[1][0]=r.rows[0][0],r=>r.rows[1][4]+=1,r=>r.rows[1][9]+=1e6,r=>r.rows[0][8]=0,r=>r.columns[0]='minutes']){const r=structuredClone(cases[0]);change(r);assert.throws(()=>validateResult(r));}
 for(const key of [2,3,4,7]){const svg=chart([{result:cases[0],color:'#087f8c'},{result:cases[1],color:'#d07c2f'}],key,'W');assert.ok(!/NaN|Infinity|undefined/.test(svg));}
});
