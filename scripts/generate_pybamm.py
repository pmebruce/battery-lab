import importlib.util,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runner',root/'pybamm-runner.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
results=[]
for param in ['Chen2020','Marquis2019']:
 for model,rate in [('SPMe',.5),('SPMe',1),('SPMe',2),('SPM',1)]:
  print(param,model,rate,flush=True)
  result=runner.solve({'parameters':param,'model':model,'crate':rate,'duration_s':3600/rate})
  result['id']=f'{param}-{model}-{rate:g}C'
  results.append(result)
(root/'data/pybamm-examples.json').write_text(json.dumps({'schema':'battery-lab-pybamm-examples-v1','cases':results},ensure_ascii=False,allow_nan=False),encoding='utf-8')
print('Generated',len(results),'cases',flush=True)
