/* All calculations run locally. Inputs are illustrative defaults, never cell specifications. */
const n = (label, key, value, unit, min = 0, max = 1000000, step = 'any', hint = '') => ({label,key,value,unit,min,max,step,hint});
const select = (label,key,value,options) => ({label,key,value,options});
const item = (label,value,unit='',primary=false) => ({label,value,unit,primary});
const round = (value, digits=2) => Number(value).toLocaleString('zh-TW',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const tools = [
  {
    id:'heat',group:'熱管理',title:'電芯發熱量',description:'以電流與 DCIR 估算不可逆熱，可選填熵熱係數評估可逆熱。',fields:[
      n('電芯電流 I','I',20,'A',-10000,10000,'any','放電為正、充電為負'),
      n('DCIR','R',15,'mΩ',0.001,10000,'any','應使用相同 SoC、溫度與脈衝時間的量測值'),
      n('電芯溫度 T','T',25,'°C',-70,150),
      n('熵熱係數 dOCV/dT','entropy',0,'mV/K',-10,10,'any','未知時填 0，表示暫時忽略可逆熱'),
      n('電芯數量','count',96,'顆',1,1000000,1)
    ],calc:v=>{
      const qi=v.I*v.I*v.R/1000, qr=-v.I*(v.T+273.15)*v.entropy/1000, qt=qi+qr;
      return {results:[item('單顆總發熱',qt,'W',true),item('不可逆熱 I²R',qi,'W'),item('可逆熵熱',qr,'W'),item('全部電芯總發熱',qt*v.count,'W')],warning:qt<0?'此操作點的估算為淨吸熱；請確認熵熱係數符號與電流方向。':undefined};
    },formula:'Q不可逆 = I² × DCIR；Q可逆 = −I × (T°C + 273.15) × dOCV/dT；Q總 = Q不可逆 + Q可逆。DCIR、熵熱係數分別由 mΩ、mV/K 換算為 Ω、V/K。',caution:'I 定義為放電正、充電負。DCIR 隨 SoC、溫度、脈衝時間與老化改變；熵熱係數也依 SoC 改變。此處是指定操作點的瞬時估算，不含極耳、匯流排與其他系統損失。'
  },
  {
    id:'thermal',group:'熱管理',title:'絕熱溫升',description:'估算一段時間內的熱量若全留在電芯，平均溫度會上升多少。',fields:[
      n('單顆淨發熱','heat',3,'W',-10000,100000),n('持續時間','time',600,'s',0,10000000),n('電芯重量','mass',70,'g',0.01,100000),n('等效比熱','cp',950,'J/(kg·K)',1,10000),n('初始溫度','start',25,'°C',-100,200)
    ],calc:v=>{let energy=v.heat*v.time, rise=energy/(v.mass/1000*v.cp);return {results:[item('估算平均溫升',rise,'°C',true),item('末端平均溫度',v.start+rise,'°C'),item('累積熱量',energy,'J'),item('電芯熱容',v.mass/1000*v.cp,'J/K')]};},formula:'累積熱量 E = Q × t；熱容 C = (m[g] ÷ 1000) × cp；絕熱平均溫升 ΔT = E ÷ C。',caution:'假設整顆電芯等溫且完全沒有對外散熱。這是熱容尺度估算，並非表面溫度、最高芯溫或實際冷卻後溫升。'
  },
  {
    id:'coolant',group:'熱管理',title:'冷卻液溫升',description:'以熱負載與流量估算冷卻液出口溫度，並反推所需流量。',fields:[
      n('帶走的熱量','heat',1200,'W',0,100000000),n('體積流量','flow',10,'L/min',0.001,1000000),n('入口液溫','inlet',25,'°C',-40,120),n('目標液體溫升','target',5,'°C',0.001,100),select('液體物性','fluid','water',[['water','水'],['eg50','EG 50%（質量比）'],['pg25','PG 25%（質量比）']])
    ],calc:v=>{const fluids={water:{rho:997,cp:4180},eg50:{rho:1065,cp:3400},pg25:{rho:1026,cp:3840}};let f=fluids[v.fluid], mdot=v.flow/60000*f.rho,dt=v.heat/(mdot*f.cp),need=v.heat*60000/(v.target*f.rho*f.cp);return {results:[item('液體出口溫度',v.inlet+dt,'°C',true),item('液體溫升',dt,'°C'),item('目標溫升所需流量',need,'L/min'),item('質量流率',mdot,'kg/s'),item('採用密度',f.rho,'kg/m³'),item('採用比熱',f.cp,'J/(kg·K)')]};},formula:'ṁ = V̇[L/min] × ρ[kg/m³] ÷ 60,000；ΔT = Q ÷ (ṁ × cp)；出口溫度 = 入口溫度 + ΔT。',caution:'物性是約 25°C 的示意常數；濃度採質量比。沒有計算流道壓降、冷板表面溫度、接觸熱阻或隨溫物性，正式設計請替換成供應商物性。'
  },
  {
    id:'hvac-sizing',group:'熱管理',title:'電池櫃空調冷量',description:'依單櫃的電池組、串並聯、定功率放電與 DCIR，自動計算總熱量、回冷及放電期間限溫所需冷量。',fields:[
      n('每串並聯電芯 P','cellParallel',1,'並',1,1000,1),
      n('每串串聯電芯 S','series',140,'串',1,10000,1),
      n('每櫃組數','groupsPerCabinet',2,'組/櫃',1,10000,1),
      n('每組串數','stringsPerGroup',1,'串/組',1,10000,1),
      n('單顆額定容量','cellAh',57,'Ah',0.001,100000),
      n('單顆額定電壓','cellNominalV',3.7,'V',0.001,1000,'any','用於額定能量；與放電時的負載電壓分開計算'),
      n('單櫃輸出功率','power',300,'kW',0.001,1000000),
      n('備援放電時間','duration',9,'分鐘',0.001,100000),
      n('起始負載電壓','voltageStart',564,'V',0.001,100000),
      n('結束負載電壓','voltageEnd',420,'V',0.001,100000),
      n('單顆 BOL DCIR','dcir',0.7,'mΩ',0.00001,100000,'any','採用對應 SoC、溫度及放電時長的量測值'),
      select('電芯狀態','life','bol',[['bol','BOL（新電池）'],['eol','EOL（壽命末期）']]),
      n('EOL DCIR 倍率','eolResistance',1.7,'倍',1,20,'any','範例照片的 0.7 → 1.19 mΩ；設計時請換成實測倍率'),
      n('EOL 容量保留率','eolCapacity',80,'%',0.001,100,'any','僅用於 EOL 可用能量檢查；額定能量及 C-rate 均以 BOL 額定值表示'),
      n('單顆電芯重量','mass',1.4,'kg',0.00001,100000),
      n('單顆等效比熱','cp',1086,'J/(kg·K)',1,100000),
      n('放電起始平均溫度','initialTemp',35,'°C',-40,150,'any','只用於溫度曲線的起點'),
      n('放電後回冷時間','recovery',3,'小時',0.001,100000),
      n('放電時允許平均溫升','allowRise',10,'°C',0,200),
      n('其他連續熱負載','otherHeat',0,'W',0,100000000),
      n('額定冷量可用比例','available',100,'%',0.001,100,'any','例如高環溫或風道損失使實際可用冷量下降'),
      n('設計裕量','margin',0,'%',0,500)
    ],sections:[
      ['電池櫃配置',['groupsPerCabinet','stringsPerGroup','series','cellParallel','cellAh','cellNominalV']],
      ['放電條件',['power','duration','voltageStart','voltageEnd']],
      ['電芯與壽命',['dcir','life','eolResistance','eolCapacity','mass','cp','initialTemp']],
      ['空調設計',['recovery','allowRise','otherHeat','available','margin']]
    ],validate:v=>v.voltageStart>=v.voltageEnd?'':'結束電壓須小於或等於起始電壓。',calc:v=>{
      const parallel=v.cellParallel*v.stringsPerGroup*v.groupsPerCabinet;
      const cellCount=v.series*parallel;
      const bankEnergy=cellCount*v.cellAh*v.cellNominalV/1000;
      const resistance=v.dcir/1000*(v.life==='eol'?v.eolResistance:1);
      const powerW=v.power*1000;
      const startCurrent=powerW/(parallel*v.voltageStart);
      const endCurrent=powerW/(parallel*v.voltageEnd);
      const heatStart=cellCount*startCurrent*startCurrent*resistance;
      const heatEnd=cellCount*endCurrent*endCurrent*resistance;
      // Match the visible spreadsheet formula: trapezoid of the start/end heat rates.
      const heatAverage=(heatStart+heatEnd)/2;
      const energy=heatAverage*v.duration*60;
      const heatCapacity=cellCount*v.mass*v.cp;
      const recoveryLoad=energy/(v.recovery*3600);
      const coolingFactor=(1+v.margin/100)/(v.available/100);
      const recoveryNominal=(recoveryLoad+v.otherHeat)*coolingFactor;
      const pulseLoad=Math.max(0,(energy-heatCapacity*v.allowRise)/(v.duration*60));
      const pulseNominal=(pulseLoad+v.otherHeat)*coolingFactor;
      const usableEnergy=bankEnergy*(v.life==='eol'?v.eolCapacity/100:1);
      const stringCount=v.stringsPerGroup*v.groupsPerCabinet;
      const durationSeconds=v.duration*60;
      const profile=Array.from({length:49},(_,index)=>{
        const fraction=index/48;
        const seconds=durationSeconds*fraction;
        const heat=heatStart+(heatEnd-heatStart)*fraction;
        const joules=heatStart*seconds+(heatEnd-heatStart)*seconds*fraction/2;
        return {time:v.duration*fraction,temperature:v.initialTemp+joules/heatCapacity,loss:heat/stringCount};
      });
      const warnings=[];
      if(pulseNominal>recoveryNominal+0.01)warnings.push(`單靠 ${round(v.recovery,1)} 小時回冷冷量，不能保證放電期間的平均溫升不超過 ${round(v.allowRise,1)} °C；限溫情境至少需 ${round(pulseNominal/1000,2)} kW 標稱冷量。`);
      if(v.power*v.duration/60>usableEnergy)warnings.push('輸出電量超過估算可用能量，請核對功率、時間、EOL 容量保留率及可用 SoC。');
      return {results:[
        item('回冷情境空調標稱冷量',recoveryNominal/1000,'kW',true),
        item('同等空調冷量',recoveryNominal*3.412141633,'BTU/hr'),
        item('電池回冷平均熱負載',recoveryLoad/1000,'kW'),
        item('放電限溫情境標稱冷量',pulseNominal/1000,'kW'),
        item('計算所得放電總熱量',energy/1000,'kJ'),
        item('起終點平均發熱',heatAverage/1000,'kW'),
        item('起始電芯發熱',heatStart/1000,'kW'),
        item('結束電芯發熱',heatEnd/1000,'kW'),
        item('起始每顆電芯電流',startCurrent,'A'),
        item('結束每顆電芯電流',endCurrent,'A'),
        item('電芯總數',cellCount,'顆'),
        item('單櫃額定能量',bankEnergy,'kWh'),
        ...(v.life==='eol'?[item('EOL 容量檢查值',usableEnergy,'kWh')]:[]),
        item('絕熱平均溫升',energy/heatCapacity,'°C'),
        item('無冷卻末端平均溫度',v.initialTemp+energy/heatCapacity,'°C'),
        item('額定放電倍率',v.power/bankEnergy,'C')
      ],charts:{profile,temperatureLimit:v.initialTemp+v.allowRise,lossStart:heatStart/stringCount,lossEnd:heatEnd/stringCount},warning:warnings.join(' ')};
    },formula:'並聯路徑數 = P × 每組串數 × 每櫃組數；電芯數 = S × 並聯路徑數；單櫃額定能量[kWh] = 電芯數 × 單顆額定容量[Ah] × 單顆額定電壓[V] ÷ 1000；額定放電倍率[C] = 單櫃輸出功率[kW] ÷ 單櫃額定能量[kWh]；EOL 容量檢查值 = 額定能量 × EOL 容量保留率；單顆電流 I[A] = 單櫃輸出功率[kW] × 1000 ÷ (並聯路徑數 × 負載電壓[V])；有效電阻 R[Ω] = DCIR[mΩ] ÷ 1000 × 壽命倍率；起始與結束發熱 Q[W] = 電芯數 × I² × R；平均發熱 Q̄[W] = (起始發熱 + 結束發熱) ÷ 2；總熱量 E[kJ] = Q̄[W] × 放電時間[分鐘] × 60 ÷ 1000；每串損失[W] = 單櫃發熱[W] ÷ (每組串數 × 每櫃組數)；絕熱溫度 T(t) = 起始溫度 + [Q起始 × t + (Q結束 − Q起始) × t² ÷ (2 × 放電秒數)] ÷ (電芯數 × 重量 × 比熱)；回冷平均負載[W] = E[kJ] × 1000 ÷ 回冷時間[秒]；回冷標稱冷量[W] = (回冷平均負載 + 其他熱負載) × (1 + 裕量比例) ÷ 可用冷量比例；放電限溫負載[W] = max(0, [E[J] − 電芯數 × 重量 × 比熱 × 容許溫升] ÷ 放電秒數) + 其他熱負載。標稱值同樣套用裕量與可用冷量比例。',caution:'額定能量由額定 Ah 與額定 V 推算，不代表這次放電能取出的電量；EOL 容量檢查值未扣除可用 SoC 窗口。溫度曲線是無冷卻的電芯平均溫度，損失曲線是假設兩端點發熱之間線性變化的 I²R 電池損失。照片所見 13,863.74 W、25,000 W、9 分鐘代入會得 10,493.2 kJ，與畫面顯示的 11,015.9 kJ 不同，請核對放電時間是否有隱藏小數或重新計算 Excel。回冷與放電限溫是不同情境；本估算不含可逆熱、極耳、匯流排、逆變器及機櫃進熱。平均溫度不代表最高芯溫。BTU/hr 是冷量，不是耗電功率。'
  },
  {
    id:'cell-energy',group:'電芯',title:'電芯能量密度',description:'由額定電壓、容量、重量與外形體積求電芯能量密度。',fields:[
      n('額定電壓','voltage',3.7,'V',0.01,100),n('額定容量','capacity',5,'Ah',0.001,10000),n('電芯重量','mass',70,'g',0.001,100000),n('電芯體積','volume',24.2,'cm³',0.001,10000000)
    ],calc:v=>{let e=v.voltage*v.capacity;return {results:[item('額定電芯能量',e,'Wh',true),item('重量能量密度',e/(v.mass/1000),'Wh/kg'),item('體積能量密度',e/(v.volume/1000),'Wh/L')]};},formula:'額定能量 Wh = 額定電壓 V × 容量 Ah；重量能量密度 = Wh ÷ kg；體積能量密度 = Wh ÷ L。',caution:'額定容量與電壓須對應相同測試條件。高倍率、低溫和截止電壓會影響實際可用能量。體積應依真實外形尺寸估算。'
  },
  {
    id:'electrode',group:'電芯',title:'圓柱捲芯長度',description:'用理想螺旋幾何粗估捲芯帶材長度。',fields:[
      n('捲繞外徑','outer',19,'mm',0.001,1000),n('捲繞內徑','inner',3,'mm',0,1000),n('每圈徑向厚度','thickness',0.22,'mm',0.0001,100)
    ],validate:v=>v.outer>v.inner?'':'外徑須大於內徑。',calc:v=>{let len=Math.PI*(v.outer*v.outer-v.inner*v.inner)/(4*v.thickness),turns=(v.outer-v.inner)/(2*v.thickness);return {results:[item('估算帶材長度',len/1000,'m',true),item('估算圈數',turns,'圈'),item('環形截面積',Math.PI*(v.outer*v.outer-v.inner*v.inner)/4,'mm²')]};},formula:'帶材長度 L ≈ π × (D外² − D內²) ÷ (4 × t)；圈數 ≈ (D外 − D內) ÷ (2 × t)。',caution:'t 為正極、隔膜、負極等構成的一整圈徑向節距；忽略封裝餘量、極耳、起終端及壓縮。只作幾何級初估。'
  },
  {
    id:'pack-energy',group:'電池包',title:'電池包能量',description:'依串並聯、電芯容量與使用 SoC 視窗計算額定及可用能量。',fields:[
      n('串聯數 S','series',96,'串',1,10000,1),n('並聯數 P','parallel',3,'並',1,10000,1),n('單顆額定電壓','voltage',3.7,'V',0.01,100),n('單顆額定容量','capacity',5,'Ah',0.001,10000),n('SoC 下限','low',10,'%',0,100),n('SoC 上限','high',90,'%',0,100)
    ],validate:v=>v.high>v.low?'':'SoC 上限須大於下限。',calc:v=>{let e=v.series*v.parallel*v.voltage*v.capacity/1000;return {results:[item('估算可用能量',e*(v.high-v.low)/100,'kWh',true),item('額定總能量',e,'kWh'),item('額定電壓',v.series*v.voltage,'V'),item('電池包容量',v.parallel*v.capacity,'Ah'),item('電芯總數',v.series*v.parallel,'顆')]};},formula:'額定總能量 = S × P × 電芯額定電壓 × 電芯容量 ÷ 1000；可用能量 ≈ 額定總能量 × (SoC上限 − SoC下限) ÷ 100。',caution:'以定值額定電壓近似整段 SoC；實際可用能量須積分電壓與容量曲線，並考量溫度、倍率與老化。'
  },
  {
    id:'pack-mass',group:'電池包',title:'電池包重量初估',description:'以 Battery Design 的高壓車用電池包經驗式估算其餘零件重量。',fields:[
      n('電池包額定能量','energy',60,'kWh',0.01,10000),n('電芯總數','count',432,'顆',1,1000000,1),n('單顆電芯重量','cellMass',700,'g',0.001,100000)
    ],calc:v=>{let cm=v.count*v.cellMass/1000,other=2.204*v.energy+27.146,total=cm+other;return {results:[item('電池包總重量',total,'kg',true),item('電芯重量',cm,'kg'),item('電芯以外重量',other,'kg'),item('電芯重量占比',100*cm/total,'%')]};},formula:'其餘零件重量[kg] ≈ 2.204 × 額定總能量[kWh] + 27.146；總重量 = 電芯總數 × 單顆重量[kg] + 其餘零件重量。',caution:'原經驗式只針對高壓車用電池包的樣本。結果離散很大，不適合直接套用機櫃式儲能、電動機車或小型模組。',source:['Battery Design：Battery Pack Mass Estimation','https://www.batterydesign.net/battery-pack-mass-estimation/']
  },
  {
    id:'precharge',group:'電氣系統',title:'預充電電阻',description:'估算電容預充電的峰值電流、達標時間與電阻瞬時功率。',fields:[
      n('電池包電壓','voltage',400,'V',0.01,10000),n('等效直流鏈電容','capacitance',2,'mF',0.000001,100000),n('預充電電阻','resistance',100,'Ω',0.001,10000000),n('目標電壓比','target',95,'%',0.001,99.999)
    ],calc:v=>{let c=v.capacitance/1000,f=v.target/100,time=-v.resistance*c*Math.log(1-f);return {results:[item('達到目標的時間',time,'s',true),item('初始峰值電流',v.voltage/v.resistance,'A'),item('初始瞬時電阻功率',v.voltage*v.voltage/v.resistance,'W'),item('完全預充的電阻耗能',c*v.voltage*v.voltage/2,'J'),item('目標電容電壓',v.voltage*f,'V')]};},formula:'I初始 = V ÷ R；t目標 = −R × C × ln(1 − 目標比)；P初始 = V² ÷ R；充到全電壓時電阻耗能 = ½CV²。',caution:'理想單一 RC 模型，未計電池內阻、接觸器、線束與電容漏電。預充電阻還須核對脈衝能量、峰值功率、重複週期及耐壓。'
  },
  {
    id:'charge-time',group:'系統應用',title:'充電時間初估',description:'用平均功率占峰值的比例，估算指定 SoC 區間的充電時間。',fields:[
      n('電池包可用能量','energy',70,'kWh',0.001,100000),n('起始 SoC','low',10,'%',0,100),n('結束 SoC','high',80,'%',0,100),n('充電峰值功率','peak',150,'kW',0.001,100000),n('平均／峰值功率比','factor',68,'%',0.1,100,'輸入你掌握的充電曲線平均比例')
    ],validate:v=>v.high>v.low?'':'結束 SoC 須高於起始 SoC。',calc:v=>{let added=v.energy*(v.high-v.low)/100,avg=v.peak*v.factor/100;return {results:[item('充電時間',added/avg*60,'分鐘',true),item('補入電量',added,'kWh'),item('假設平均功率',avg,'kW')]};},formula:'補入電量 ≈ 電池包能量 × SoC變化；平均功率 = 峰值功率 × 平均比例；時間[分鐘] = 補入電量 ÷ 平均功率 × 60。',caution:'SoC 應與輸入的「可用能量」定義一致。平均比例不是通用常數，低溫、電芯溫度、BMS 限流、老化及充電樁限制都會改變結果。'
  },
  {
    id:'bess',group:'系統應用',title:'儲能容量規劃',description:'由每循環交付電量反推 BESS 裝置容量，並估算功率倍率。',fields:[
      n('期末每循環需交付電量','usable',1000,'kWh',0.001,100000000),n('使用 DoD','dod',80,'%',0.001,100),n('期末容量保留率','retention',80,'%',0.001,100),n('額定輸出功率','power',500,'kW',0,100000000),n('系統往返效率','efficiency',90,'%',0.001,100)
    ],calc:v=>{let capacity=v.usable/(v.dod/100)/(v.retention/100);return {results:[item('所需期初標稱容量',capacity,'kWh',true),item('系統額定倍率',v.power/capacity,'C'),item('每循環電網輸入',v.usable/(v.efficiency/100),'kWh'),item('電網輸入與交付之差',v.usable/(v.efficiency/100)-v.usable,'kWh')]};},formula:'期初標稱容量 = 期末交付需求 ÷ DoD ÷ 期末容量保留率；倍率 = 輸出功率 ÷ 標稱容量；電網輸入 = 交付電量 ÷ 往返效率。',caution:'往返效率損失不能全部當成電芯發熱，其中也包含逆變器、線束、輔機等損失。配置時另需考慮可用率與裕量。'
  },
  {
    id:'range',group:'系統應用',title:'車輛續航初估',description:'依可用電池能量及每公里電耗估算行駛距離。',fields:[
      n('電池包可用能量','energy',60,'kWh',0.001,100000),n('平均行駛電耗','consumption',170,'Wh/km',0.001,100000),n('額外可用電量保留','reserve',10,'%',0,99.9)
    ],calc:v=>{let e=v.energy*(1-v.reserve/100);return {results:[item('估算行駛距離',e*1000/v.consumption,'km',true),item('行駛可用能量',e,'kWh'),item('每百公里電耗',v.consumption/10,'kWh/100 km')]};},formula:'可行駛能量 = 可用電池能量 × (1 − 額外保留率)；續航距離 = 可行駛能量[kWh] × 1000 ÷ 行駛電耗[Wh/km]。',caution:'電耗應來自相似路況與溫度；此估算沒有獨立模擬車速、風阻、坡度、暖氣或空調。'
  }
];

const byId = id => document.getElementById(id);
const groups = [...new Set(tools.map(t=>t.group))];
const state = Object.fromEntries(tools.map(t=>[t.id,Object.fromEntries(t.fields.map(f=>[f.key,f.value]))]));
const finderGroups = [
  {name:'常用',ids:['hvac-sizing','heat','thermal','coolant']},
  {name:'發熱與溫度',ids:['heat','thermal']},
  {name:'冷卻與空調',ids:['coolant','hvac-sizing']},
  {name:'電芯與電池包',ids:['cell-energy','electrode','pack-energy','pack-mass']},
  {name:'電氣與系統',ids:['precharge','charge-time','bess','range']}
];
const searchAliases = {
  heat:'DCIR I2R 內阻 熵熱 發熱 loss',
  thermal:'溫升 比熱 熱容 溫度',
  coolant:'流量 水冷 液冷 冷卻液 EG50 PG25',
  'hvac-sizing':'UPS HVAC 冷房 空調 冷量 BTU 熱量 loss 溫度',
  'cell-energy':'電芯 容量 能量密度 Wh',
  electrode:'捲芯 圓柱 電極',
  'pack-energy':'串並聯 容量 SOC kWh',
  'pack-mass':'重量 質量',
  precharge:'電容 RC 預充 電阻',
  'charge-time':'充電 SOC 時間',
  bess:'儲能 備援 容量',
  range:'續航 里程 車輛'
};
let finderGroup='常用';
let active = null;

function renderFinder(){
  const query=byId('tool-search').value.trim().toLocaleLowerCase();
  const selected=finderGroups.find(group=>group.name===finderGroup);
  const matches=tools.filter(tool=>{
    if(selected&&!selected.ids.includes(tool.id))return false;
    const words=`${tool.title} ${tool.group} ${tool.description} ${searchAliases[tool.id]||''}`.toLocaleLowerCase();
    return query.split(/\s+/).every(word=>words.includes(word));
  });
  byId('finder-filters').innerHTML=[{name:'全部'},...finderGroups].map(group=>`<button type="button" class="finder-filter${finderGroup===group.name?' selected':''}" data-finder-group="${group.name}" aria-pressed="${finderGroup===group.name}">${group.name}</button>`).join('');
  byId('finder-count').textContent=`${matches.length} 項工具`;
  byId('finder-results').innerHTML=matches.length?matches.map(tool=>`<a class="finder-card${active?.id===tool.id?' selected':''}" href="#${tool.id}" ${active?.id===tool.id?'aria-current="page"':''}><strong>${tool.title}</strong><span>${tool.description}</span></a>`).join(''):'<p class="finder-empty">找不到符合的工具，試試「全部」或其他關鍵字。</p>';
}

function renderMethod(tool){
  const parts=tool.formula.split(/[；。]/).map(part=>part.trim()).filter(Boolean);
  const equations=parts.filter(part=>/[=≈]/.test(part));
  const notes=parts.filter(part=>!/[=≈]/.test(part));
  const rows=equations.map(part=>{
    const [,label,operator,expression]=part.match(/^(.+?)\s*([=≈])\s*(.+)$/);
    return `<div class="equation-row"><span class="equation-label">${label.trim()}</span><span class="equation-expression"><b>${operator}</b> ${expression}</span></div>`;
  }).join('');
  byId('method').innerHTML=`<div class="method-layout"><div class="equations"><h3>計算公式</h3><div class="equation-list">${rows}</div>${notes.map(note=>`<p class="unit-note">${note}</p>`).join('')}</div><aside class="boundary"><h3>使用邊界</h3><p>${tool.caution}</p>${tool.source?`<p class="source">參考資料：<a href="${tool.source[1]}" target="_blank" rel="noopener noreferrer">${tool.source[0]}</a></p>`:''}</aside></div>`;
}
function renderField(tool,f){
  return `<div class="field"><label for="field-${f.key}">${f.label}</label><div class="field-control">${f.options?`<select id="field-${f.key}" name="${f.key}">${f.options.map(([value,label])=>`<option value="${value}" ${state[tool.id][f.key]===value?'selected':''}>${label}</option>`).join('')}</select>`:`<input id="field-${f.key}" name="${f.key}" type="number" inputmode="decimal" value="${state[tool.id][f.key]}" min="${f.min}" max="${f.max}" step="${f.step}" required><span class="unit">${f.unit}</span>`}</div>${f.hint?`<small>${f.hint}</small>`:''}</div>`;
}
function renderFields(tool){
  if(!tool.sections)return `<div class="field-grid">${tool.fields.map(f=>renderField(tool,f)).join('')}</div>`;
  const byKey=Object.fromEntries(tool.fields.map(f=>[f.key,f]));
  return tool.sections.map(([title,keys])=>`<div class="input-section"><h3>${title}</h3><div class="field-grid">${keys.map(key=>renderField(tool,byKey[key])).join('')}</div></div>`).join('');
}
function lineChart(points,key,{color,unit,zeroBase=false,limit=null}){
  const width=520,height=300,left=67,right=18,top=18,bottom=54;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const values=points.map(point=>point[key]);
  const minValue=Math.min(...values,...(limit===null?[]:[limit]));
  const maxValue=Math.max(...values,...(limit===null?[]:[limit]));
  const pad=Math.max((maxValue-minValue)*0.12,unit==='°C'?1:100);
  const lower=zeroBase?0:minValue-pad,upper=maxValue+pad;
  const rough=(upper-lower)/4,base=10**Math.floor(Math.log10(rough));
  const step=[1,2,5,10].find(factor=>factor*base>=rough)*base;
  const yMin=zeroBase?0:Math.floor(lower/step)*step;
  const yMax=Math.ceil(upper/step)*step;
  const xAt=index=>left+plotWidth*index/(points.length-1);
  const yAt=value=>top+plotHeight*(yMax-value)/(yMax-yMin);
  const yTicks=[];
  for(let value=yMin;value<=yMax+step/10;value+=step)yTicks.push(value);
  const horizontal=yTicks.map(value=>`<line x1="${left}" x2="${width-right}" y1="${yAt(value)}" y2="${yAt(value)}" class="chart-gridline"/><text x="${left-11}" y="${yAt(value)+5}" text-anchor="end" class="chart-tick">${round(value,unit==='°C'?1:0)}</text>`).join('');
  const vertical=[0,.25,.5,.75,1].map(fraction=>{const x=left+plotWidth*fraction;return `<line x1="${x}" x2="${x}" y1="${top}" y2="${height-bottom}" class="chart-gridline"/><text x="${x}" y="${height-bottom+23}" text-anchor="middle" class="chart-tick">${round(points.at(-1).time*fraction,1)}</text>`}).join('');
  const path=points.map((point,index)=>`${index?'L':'M'}${xAt(index).toFixed(2)} ${yAt(point[key]).toFixed(2)}`).join(' ');
  const limitLine=limit===null?'':`<line x1="${left}" x2="${width-right}" y1="${yAt(limit)}" y2="${yAt(limit)}" class="chart-limit"/><text x="${width-right-4}" y="${yAt(limit)-7}" text-anchor="end" class="chart-limit-label">允許平均溫度</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${unit} 對放電時間的趨勢，起始 ${round(values[0],1)}，末端 ${round(values.at(-1),1)}"><g>${horizontal}${vertical}</g><text x="${left}" y="${top-4}" class="chart-axis-unit">${unit}</text>${limitLine}<path d="${path}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${xAt(0)}" cy="${yAt(values[0])}" r="5" fill="${color}"/><circle cx="${xAt(points.length-1)}" cy="${yAt(values.at(-1))}" r="5" fill="${color}"/><text x="${left+plotWidth/2}" y="${height-9}" text-anchor="middle" class="chart-axis-label">放電時間（分鐘）</text></svg>`;
}
function renderCharts(charts){
  const container=byId('charts');
  if(!charts){container.hidden=true;container.innerHTML='';return;}
  const {profile,temperatureLimit,lossStart,lossEnd}=charts;
  const end=profile.at(-1);
  container.hidden=false;
  container.innerHTML=`<div class="chart-section-title"><h2>放電過程曲線</h2><span>${round(end.time,2)} 分鐘</span></div><div class="chart-grid"><article class="chart-card"><div class="chart-card-head"><h3>電芯平均溫度</h3><strong>${round(end.temperature,1)} °C</strong></div><div class="chart-scroll">${lineChart(profile,'temperature',{color:'#d57838',unit:'°C',limit:temperatureLimit})}</div><p>起始溫度 ${round(profile[0].temperature,1)} °C；虛線是允許的平均溫度。曲線以無冷卻、電芯等溫估算。</p></article><article class="chart-card"><div class="chart-card-head"><h3>每串功率損失</h3><strong>${round(lossEnd/1000,2)} kW</strong></div><div class="chart-scroll">${lineChart(profile,'loss',{color:'#087c89',unit:'W',zeroBase:true})}</div><p>起始 ${round(lossStart/1000,2)} kW → 結束 ${round(lossEnd/1000,2)} kW。這裡的損失是每串電芯 I²R 發熱。</p></article></div>`;
}

function makeNav(){
  byId('tool-count').textContent=`${tools.length} 項`;
  byId('nav').innerHTML=groups.map((group,g)=>`<div class="nav-group">${group}</div>${tools.filter(t=>t.group===group).map((t,j)=>`<button class="nav-button" data-tool="${t.id}" type="button"><span class="nav-icon">${String(g+1).padStart(2,'0')}</span>${t.title}</button>`).join('')}`).join('');
  byId('nav').addEventListener('click',e=>{let button=e.target.closest('[data-tool]');if(button)location.hash=button.dataset.tool});
  byId('tool-search').addEventListener('input',()=>{if(byId('tool-search').value.trim())finderGroup='全部';renderFinder()});
  byId('finder-filters').addEventListener('click',e=>{const button=e.target.closest('[data-finder-group]');if(!button)return;finderGroup=button.dataset.finderGroup;renderFinder()});
  byId('input-form').addEventListener('input',update);
  byId('input-form').addEventListener('change',update);
}
function render(){
  let id=decodeURIComponent(location.hash.slice(1));let tool=tools.find(t=>t.id===id)||tools[0];
  active=tool;byId('category').textContent=tool.group;byId('tool-title').textContent=tool.title;byId('tool-description').textContent=tool.description;byId('tool-index').textContent=`${String(tools.indexOf(tool)+1).padStart(2,'0')} / ${tools.length}`;
  document.querySelectorAll('.nav-button').forEach(button=>{let selected=button.dataset.tool===tool.id;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  renderFinder();
  byId('input-form').innerHTML=renderFields(tool);
  renderMethod(tool);
  update();
}
function update(){
  const form=byId('input-form'),v={};
  renderCharts(null);
  for(const field of active.fields){
    const el=form.elements.namedItem(field.key);
    if(field.options){v[field.key]=el.value;continue;}
    if(!el.value.trim()||!el.validity.valid||!Number.isFinite(el.valueAsNumber)){
      byId('result-status').textContent='請檢查輸入';
      byId('results').innerHTML=`<p class="error">請輸入有效的「${field.label}」（${field.min}～${field.max}）。</p>`;return;
    }
    v[field.key]=el.valueAsNumber;
  }
  state[active.id]=v;
  const message=active.validate?.(v);
  if(message){byId('result-status').textContent='請檢查輸入';byId('results').innerHTML=`<p class="error">${message}</p>`;return;}
  const {results,warning,charts}=active.calc(v);
  if(results.some(x=>!Number.isFinite(x.value))){byId('result-status').textContent='無法計算';byId('results').innerHTML='<p class="error">結果超出計算範圍，請調整輸入值。</p>';return;}
  byId('result-status').textContent='即時計算';
  byId('results').innerHTML=results.map(r=>`<div class="${r.primary?'result-primary':'result-row'}"><div class="result-label">${r.label}</div><div class="result-value">${round(r.value,Math.abs(r.value)<0.01&&r.value!==0?5:2)} <span class="result-unit">${r.unit}</span></div></div>`).join('')+(warning?`<p class="result-warning">${warning}</p>`:'');
  renderCharts(charts);
}
makeNav();window.addEventListener('hashchange',render);render();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
