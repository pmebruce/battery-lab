export const COLUMNS=['time_s','current_a','voltage_v','temperature_c','heat_w','ohmic_w','reaction_w','reversible_w','volume_m3','heat_w_m3'];
export function validateResult(r){
 if(!r||r.schema!=='battery-lab-pybamm-v1'||!r.config||!['SPM','SPMe'].includes(r.config.model)||!['Chen2020','Marquis2019'].includes(r.config.parameters)||!Number.isFinite(r.cell_volume_m3)||r.cell_volume_m3<=0||!Number.isFinite(r.cell_capacity_ah)||r.cell_capacity_ah<=0||typeof r.termination!=='string'||typeof r.entropy_note!=='string'||JSON.stringify(r.columns)!==JSON.stringify(COLUMNS)||!Array.isArray(r.rows)||r.rows.length<2||r.rows.length>10000)throw new Error('請匯入本頁求解腳本產生的有效 PyBaMM JSON。');
 for(const key of ['crate','temperature_c','initial_soc','htc','duration_s'])if(!Number.isFinite(r.config[key]))throw new Error('求解條件缺少有效數值。');
 for(let i=0;i<r.rows.length;i++){
  const v=r.rows[i];if(!Array.isArray(v)||v.length!==10||!v.every(Number.isFinite)||v[0]<0||(i===0?Math.abs(v[0])>1e-8:v[0]<=r.rows[i-1][0])||v[8]<=0||Math.abs(v[8]/r.cell_volume_m3-1)>1e-8||Math.abs(v[4]-v[5]-v[6]-v[7])>1e-5*Math.max(1,Math.abs(v[4]))||Math.abs(v[9]-v[4]/v[8])>1e-5*Math.max(1,Math.abs(v[9])))throw new Error('時序、熱量分解或 W/m³ 不一致，匯入已停止。');
 }
 return r;
}
export function summarize(r){
 validateResult(r);let energy=0;for(let i=1;i<r.rows.length;i++)energy+=(r.rows[i][0]-r.rows[i-1][0])*(r.rows[i][4]+r.rows[i-1][4])/2;
 const end=r.rows.at(-1)[0];return {energy,mean:energy/end,peak:Math.max(...r.rows.map(x=>x[4])),temperature:Math.max(...r.rows.map(x=>x[3])),end};
}
export function exportCFD(r,count,volume){
 validateResult(r);if(!Number.isInteger(count)||count<1||count>1e6||!Number.isFinite(volume)||volume<=0)throw new Error('電芯數需為 1–1000000 的整數，CFD 物件總體積需大於 0。');
 const header=['time_s','current_per_cell_a','voltage_per_cell_v','temperature_c','heat_per_cell_w','heat_total_w','source_volume_m3','source_w_m3','ohmic_total_w','reaction_total_w','reversible_total_w'];
 return header.join(',')+'\r\n'+r.rows.map(v=>[v[0],v[1],v[2],v[3],v[4],v[4]*count,volume,v[4]*count/volume,v[5]*count,v[6]*count,v[7]*count].join(',')).join('\r\n');
}
export function chart(series,key,unit){
 const vals=series.flatMap(s=>s.result.rows.map(r=>r[key])),xmin=0,xmax=Math.max(...series.map(s=>s.result.rows.at(-1)[0]))||1;
 let ymin=Math.min(...vals),ymax=Math.max(...vals);const gap=Math.max((ymax-ymin)*.1,.01);ymin-=gap;ymax+=gap;
 const w=720,h=270,left=66,right=20,top=15,bottom=44,x=t=>left+(w-left-right)*(t-xmin)/(xmax-xmin),y=v=>top+(h-top-bottom)*(ymax-v)/(ymax-ymin);
 const axes=Array.from({length:5},(_,j)=>{const v=ymin+(ymax-ymin)*j/4;return `<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#dce8eb"/><text x="${left-8}" y="${y(v)+5}" text-anchor="end">${v.toFixed(2)}</text>`;}).join('');
 const times=Array.from({length:5},(_,j)=>`<text x="${x(xmax*j/4)}" y="${h-20}" text-anchor="middle">${(xmax*j/240).toFixed(1)}</text>`).join('');
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${unit} 隨時間變化"><g font-size="14" fill="#526f7b" font-family="system-ui">${axes}${times}<text x="8" y="15">${unit}</text><text x="${w-30}" y="${h-1}" text-anchor="end">時間（分鐘）</text></g>${series.map(s=>`<polyline points="${s.result.rows.map(r=>`${x(r[0]).toFixed(2)},${y(r[key]).toFixed(2)}`).join(' ')}" stroke="${s.color}" stroke-width="2.6" fill="none"/>`).join('')}</svg>`;
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function init(){
 const $=id=>document.getElementById(id);let cases=[],runner='',current,comparison;
 const label=r=>`${r.config.parameters} · ${r.config.model} · ${r.config.crate}C`;
 const download=(text,name,type)=>{const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function render(resetVolume=false){
  current=cases[Number($('scenario').value)||0];comparison=$('comparison').value===''?null:cases[Number($('comparison').value)];
  if(resetVolume)$('volume').value=(current.cell_volume_m3*Number($('count').value)*1e6).toFixed(6);
  const summary=summarize(current),count=Number($('count').value);
  $('metrics').innerHTML=[['單顆平均發熱',summary.mean.toFixed(4),'W'],['單顆取樣峰值發熱',summary.peak.toFixed(4),'W'],['單顆累積熱量',(summary.energy/1000).toFixed(3),'kJ'],['最高平均電芯溫度',summary.temperature.toFixed(2),'°C'],['參數集電芯容量',current.cell_capacity_ah.toFixed(3),'Ah'],['模擬結束時間',(summary.end/60).toFixed(2),'min']].map(([a,b,c])=>`<div><dt>${a}</dt><dd>${b}<small>${c}</small></dd></div>`).join('');
  $('model-note').textContent=`${current.config.parameters} 的示例電芯，h = ${current.config.htc} W/(m²·K)，環境 ${current.config.temperature_c} °C，起始 SoC ${current.config.initial_soc*100}%。模型體積 ${(current.cell_volume_m3*1e6).toFixed(3)} cm³、散熱面積 ${(current.cooling_area_m2??0).toFixed(5)} m²。結束原因：${current.termination}。`;
  $('entropy-note').textContent=current.config.parameters==='Chen2020'?'此 Chen2020 參數集的熵熱係數預設為零，圖中的可逆熱為零；不能據此判定你的電芯沒有熵熱。':'此 Marquis2019 參數集含隨 SoC 變化的電極熵熱係數；符號及數值依此參數集。';
  const list=[{result:current,color:'#087f8c'},...(comparison?[{result:comparison,color:'#d07c2f'}]:[])];
  $('chart-legend').innerHTML=list.map(s=>`<span><i style="background:${s.color}"></i>${esc(label(s.result))}</span>`).join('');
  $('heat-chart').innerHTML=chart(list,4,'W');$('temperature-chart').innerHTML=chart(list,3,'°C');$('voltage-chart').innerHTML=chart(list,2,'V');
  const components=[['歐姆熱',5,'#087f8c'],['不可逆反應熱',6,'#d07c2f'],['可逆熱',7,'#8d5cb7']];
  $('components').innerHTML=chart(components.map(([label,key,color])=>({color,result:{...current,rows:current.rows.map(r=>{const row=[...r];row[4]=row[key];return row;})}})),4,'W');
  $('component-legend').innerHTML=components.map(([label,key,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('');
  const volume=Number($('volume').value)*1e-6;
  $('cfd-note').textContent=Number.isInteger(count)&&count>0&&volume>0?`相同工況 ${count} 顆：平均總熱量 ${(summary.mean*count).toFixed(3)} W；指定總體積 ${$('volume').value} cm³；平均體積熱源 ${(summary.mean*count/volume).toFixed(1)} W/m³。`:'請輸入有效電芯數與物件總體積。';
 }
 function setOptions(){const options=cases.map((r,i)=>`<option value="${i}">${esc(label(r))}${r.imported?' · 匯入':''}</option>`).join('');$('scenario').innerHTML=options;$('comparison').innerHTML='<option value="">不比較</option>'+options;render(true);}
 try{
  const response=await fetch('./data/pybamm-examples.json');if(!response.ok)throw new Error('範例資料載入失敗');const data=await response.json();cases=data.cases.map(validateResult);setOptions();$('status').textContent='8 組 PyBaMM 實際求解範例已載入；選擇情境即可比較。';
 }catch(e){$('status').textContent=e.message;return;}
 fetch('./pybamm-runner.py').then(r=>{if(!r.ok)throw Error('求解腳本無法載入');return r.text();}).then(text=>{runner=text;$('runner').disabled=false;}).catch(e=>$('runner-status').textContent=e.message);
 $('scenario').addEventListener('change',()=>render(true));$('comparison').addEventListener('change',()=>render());$('count').addEventListener('input',()=>render(true));$('volume').addEventListener('input',()=>render());
 $('cfd').addEventListener('click',()=>{try{download('\uFEFF'+exportCFD(current,Number($('count').value),Number($('volume').value)*1e-6),'pybamm-cfd-heat.csv','text/csv;charset=utf-8');$('export-status').textContent='已匯出指定電芯數與總體積的 CFD 熱源。';}catch(e){$('export-status').textContent=e.message;}});
 $('json').addEventListener('click',()=>download(JSON.stringify(current,null,2),'pybamm-result.json','application/json'));
 $('import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20e6)throw Error('檔案需小於 20 MB');const result=validateResult(JSON.parse(await file.text()));result.imported=true;cases.push(result);setOptions();$('scenario').value=String(cases.length-1);render(true);$('status').textContent='已載入本機求解結果。';}catch(error){$('status').textContent=error.message;}});
 $('runner').addEventListener('click',()=>{try{
  for(const id of ['crate','ambient','soc','htc','duration'])if(!$(id).value.trim())throw Error('請填入完整的自訂求解條件。');
  const config={model:$('model').value,parameters:$('parameters').value,crate:Number($('crate').value),temperature_c:Number($('ambient').value),initial_soc:Number($('soc').value)/100,htc:Number($('htc').value),duration_s:Number($('duration').value)*60};
  for(const [key,lo,hi] of [['crate',.1,3],['temperature_c',0,60],['initial_soc',.1,1],['htc',0,200],['duration_s',10,86400]])if(!Number.isFinite(config[key])||config[key]<lo||config[key]>hi)throw Error('請檢查 '+key+' 的範圍。');
  const code=runner.replace(/^DEFAULT_CONFIG = .*$/m,'DEFAULT_CONFIG = '+JSON.stringify(config));download(code,'battery-pybamm.py','text/x-python');$('runner-status').textContent='腳本已包含上方條件；在已安裝 PyBaMM 的電腦執行後，將 JSON 匯回此頁。';
 }catch(e){$('runner-status').textContent=e.message;}});
}
if(typeof document!=='undefined'){init();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}
