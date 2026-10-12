import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import PatientRecord from './PatientRecord';
import {supabase} from '../supabaseClient';
vi.mock('../supabaseClient',()=>({supabase:{from:vi.fn()}}));
const patient={id:'p-a',name:'Synthetic Alice',code:'PT-A'};
let failures,delay,rows;
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const popup=()=>({closed:false,opener:{},document:{open:vi.fn(),write:vi.fn(),close:vi.fn()},focus:vi.fn(),print:vi.fn(),close:vi.fn()});
beforeEach(()=>{
  failures={};delay=null;rows={};
  supabase.from.mockImplementation(table=>{
    let id;const q={select:()=>q,eq:(k,v)=>{id=v;return q;},order:()=>q,range:()=>q,limit:()=>q,maybeSingle:()=>q,then:(resolve,reject)=>{
      if(table==='consultations' && id==='p-a' && delay)return delay.promise.then(resolve,reject);
      if(table==='staff')return Promise.resolve({data:{id:'doctor',role:'Doctor',active:true}}).then(resolve,reject);
      const data=rows[table]||[];return Promise.resolve(failures[table]?{data:null,error:{message:'Synthetic read failure'}}:{data,count:data.length}).then(resolve,reject);
    }};return q;
  });
});
afterEach(cleanup);
describe('patient record summary',()=>{
  it('disables printing during reads and prints explicit unavailable warnings after failure',async()=>{
    delay=defer();failures.lab_orders=true;
    const win=popup();vi.spyOn(window,'open').mockReturnValue(win);
    render(<PatientRecord patient={patient} staff={{id:'doctor',role:'Doctor'}} onClose={()=>{}}/>);
    expect(screen.getByRole('button',{name:'Print summary'}).disabled).toBe(true);
    await act(async()=>delay.resolve({data:[],count:0}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Print summary'}).disabled).toBe(false));
    expect(within(screen.getByRole('region',{name:'Lab tests'})).getByRole('alert').textContent).toContain('Unavailable');
    fireEvent.click(screen.getByRole('button',{name:'Print summary'}));expect(win.print).toHaveBeenCalledOnce();
    const html=win.document.write.mock.calls.at(-1)[0];expect(html).toContain('INCOMPLETE SUMMARY');expect(html).toContain('Unavailable — do not interpret');
    failures.lab_orders=false;fireEvent.click(screen.getByRole('button',{name:'Retry Lab tests'}));
    await waitFor(()=>expect(within(screen.getByRole('region',{name:'Lab tests'})).queryByRole('alert')).toBeNull());
  });
  it('does not present Reception RLS empty results as an unassessed patient',async()=>{
    render(<PatientRecord patient={patient} staff={{role:'Receptionist'}} onClose={()=>{}}/>);
    expect(await screen.findByText(/Allergy information unavailable for this staff role/)).toBeTruthy();
    expect(screen.queryByText(/Not assessed/)).toBeNull();expect(supabase.from.mock.calls.some(([table])=>table==='patient_allergy_reviews')).toBe(false);
  });
  it('drops old patient responses and resets print state on patient changes',async()=>{
    delay=defer();const {rerender}=render(<PatientRecord patient={patient} staff={{id:'doctor',role:'Doctor'}} onClose={()=>{}}/>);
    rerender(<PatientRecord patient={{id:'p-b',name:'Synthetic Bob'}} staff={{id:'doctor',role:'Doctor'}} onClose={()=>{}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Print summary'}).disabled).toBe(false));
    await act(async()=>delay.resolve({data:[{id:'old',patient_id:'p-a',diagnosis:'Alice-only diagnosis',prescriptions:[]}],count:1}));
    expect(screen.queryByText('Alice-only diagnosis')).toBeNull();expect(screen.getByRole('dialog').textContent).toContain('Synthetic Bob');
  });
  it('renders zero readings and has recoverable popup errors',async()=>{
    rows.vitals=[{id:'v',patient_id:'p-a',pulse:0,temperature:0,weight:0}];vi.spyOn(window,'open').mockReturnValue(null);
    render(<PatientRecord patient={patient} staff={{id:'doctor',role:'Doctor'}} onClose={()=>{}}/>);
    expect(await screen.findByText(/Pulse: 0 beats\/min/)).toBeTruthy();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Print summary'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Print summary'}));expect(await screen.findByText(/Allow popups to print/)).toBeTruthy();
  });
  it('supports modal keyboard containment, Escape and focus restoration',async()=>{
    const close=vi.fn(),trigger=document.createElement('button');document.body.append(trigger);trigger.focus();
    const {unmount}=render(<PatientRecord patient={patient} staff={{id:'doctor',role:'Doctor'}} onClose={close}/>);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Tab'});expect(document.activeElement.tagName).toBe('BUTTON');
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(close).toHaveBeenCalledOnce();unmount();expect(document.activeElement).toBe(trigger);trigger.remove();
  });
});
