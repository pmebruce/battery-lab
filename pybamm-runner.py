"""Generate one real PyBaMM discharge simulation for Battery Lab (BSD-3-Clause PyBaMM).
Install: python -m pip install pybamm==26.10.1.0
Run: python pybamm-runner.py
No cloud service is used. Change DEFAULT_CONFIG or download a configured copy from the app.
"""
import os
os.environ['PYBAMM_DISABLE_TELEMETRY'] = 'true'
import argparse
import csv
import json
from pathlib import Path
import numpy as np
import pybamm

DEFAULT_CONFIG = {'model':'SPMe','parameters':'Chen2020','crate':1.0,'temperature_c':25.0,'initial_soc':1.0,'htc':10.0,'duration_s':3600.0}
COLUMNS = ['time_s','current_a','voltage_v','temperature_c','heat_w','ohmic_w','reaction_w','reversible_w','volume_m3','heat_w_m3']

def solve(config):
    c = {**DEFAULT_CONFIG, **config}
    if c['model'] not in ['SPM','SPMe'] or c['parameters'] not in ['Chen2020','Marquis2019']:
        raise ValueError('Unsupported model or parameter set')
    for k,lo,hi in [('crate',.1,3),('temperature_c',0,60),('initial_soc',.1,1),('htc',0,200),('duration_s',10,86400)]:
        if not isinstance(c[k],(int,float)) or not np.isfinite(c[k]) or not lo<=c[k]<=hi:
            raise ValueError(f'{k} must be between {lo} and {hi}')
    model = getattr(pybamm.lithium_ion,c['model'])({'thermal':'lumped'})
    params = pybamm.ParameterValues(c['parameters'])
    params.update({'Current function [A]':c['crate']*params['Nominal cell capacity [A.h]'],
                   'Ambient temperature [K]':c['temperature_c']+273.15,
                   'Initial temperature [K]':c['temperature_c']+273.15,
                   'Total heat transfer coefficient [W.m-2.K-1]':c['htc']})
    sim = pybamm.Simulation(model,parameter_values=params,solver=pybamm.IDAKLUSolver(rtol=1e-7,atol=1e-8))
    solution = sim.solve([0,c['duration_s']], initial_soc=c['initial_soc'])
    times = np.linspace(0,float(solution.t[-1]),121)
    def values(name):return np.asarray(solution[name](times),dtype=float).reshape(-1)
    heat=values('Total heating [W]')
    volume=float(params['Cell volume [m3]'])
    rows=np.column_stack([times,values('Current [A]'),values('Voltage [V]'),values('Volume-averaged cell temperature [K]')-273.15,
                          heat,values('Ohmic heating [W]'),values('Irreversible electrochemical heating [W]'),values('Reversible heating [W]'),
                          np.full(len(times),volume),heat/volume])
    if not np.isfinite(rows).all():raise ValueError('Non-finite simulation output')
    # This schema uses whole-cell Total heating [W] and the parameter set's external Cell volume.
    # The exported W/m3 is Q/V of a homogeneous CFD cell, not the local electrode source.
    meta={'schema':'battery-lab-pybamm-v1','pybamm_version':pybamm.__version__,'config':c,'cell_capacity_ah':float(params['Nominal cell capacity [A.h]']),
          'cell_volume_m3':volume,'cooling_area_m2':float(params['Cell cooling surface area [m2]']),
          'termination':str(solution.termination),'columns':COLUMNS,
          'note':'Illustrative published parameter set, not a fitted user cell. Positive current = discharge. heat_w_m3 = whole-cell heat_w / external cell volume.',
          'entropy_note':'Chen2020 entropic coefficients default to zero; reversible heat is therefore zero.' if c['parameters']=='Chen2020' else 'Marquis2019 includes SOC-dependent electrode entropic coefficients.'}
    meta['rows']=rows.tolist()
    return meta

def write(result,output):
    path=Path(output)
    path.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
    with path.with_suffix('.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.writer(f);writer.writerow(COLUMNS);writer.writerows(result['rows'])

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path)
    parser.add_argument('--output',default='pybamm-result.json')
    args=parser.parse_args()
    c=json.loads(args.config.read_text(encoding='utf-8')) if args.config else DEFAULT_CONFIG
    result=solve(c);write(result,args.output)
    print(f"Saved {args.output} and matching CSV; ended at {result['rows'][-1][0]:.2f} s ({result['termination']})")
