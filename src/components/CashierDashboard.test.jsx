import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CashierDashboard from './CashierDashboard';
import { supabase } from '../supabaseClient';
vi.mock('../supabaseClient',()=>({supabase:{from:vi.fn(),rpc:vi.fn()}}));
vi.mock('./Header',()=>({default:()=> <header>Billing test</header>}));
const patient={id:'patient',name:'Synthetic patient',code:'PT-TEST'};
const consultation={id:'consultation',patient_id:patient.id,code:'CN-TEST',created_at:'2026-10-11',patients:patient,prescriptions:[]};
const price={id:'price',name:'Synthetic consultation fee',category:'Consultation',unit:'visit',price:10.25,active:true};
const staff={id:'cashier',role:'Cashier',name:'Synthetic cashier'};
const invoice={id:'invoice',code:'IV-TEST',patient_id:patient.id,patients:patient,total:10.25,status:'Unpaid',sale_type:'Encounter',consultation_id:consultation.id,admission_id:null,created_by:staff.id,created_at:'2026-10-11'};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
let responses;
beforeEach(()=>{
  responses={consultations:[consultation],admissions:[],invoices:[],price_list:[price],patients:[patient],lab_orders:[],invoice_items:[{label:price.name,quantity:1,unit_price:10.25,amount:10.25}]};
  supabase.rpc.mockReset();
  supabase.from.mockImplementation(table=>{
    const response=()=>responses[table]?.then?responses[table]:Promise.resolve(Array.isArray(responses[table])?{data:responses[table],error:null}:responses[table]);
    const query={select:()=>query,eq:()=>query,order:()=>query,then:(yes,no)=>response().then(yes,no)};return query;
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function openEncounter(){render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Bill this visit'}));fireEvent.change(screen.getByLabelText('Consultation fee'),{target:{value:'price'}});}
function created(payload){return {...invoice,sale_type:payload.p_sale_type,consultation_id:payload.p_consultation_id,admission_id:payload.p_admission_id,request_id:payload.p_request_id};}
describe('atomic invoice UI',()=>{
  it('sends one RPC without browser totals or actor fields and clears only on confirmation',async()=>{
    const pending=defer();supabase.rpc.mockReturnValue(pending.promise);await openEncounter();
    fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));fireEvent.click(screen.getByRole('button',{name:'Saving…'}));
    expect(supabase.rpc).toHaveBeenCalledTimes(1);const [name,payload]=supabase.rpc.mock.calls[0];
    expect(name).toBe('create_clinic_invoice');expect(payload).toMatchObject({p_patient_id:'patient',p_consultation_id:'consultation',p_admission_id:null,p_sale_type:'Encounter',p_items:[{price_item_id:'price',quantity:1,expected_unit_price:10.25,prescription_id:null,lab_order_id:null}]});
    expect(payload.total).toBeUndefined();expect(payload.created_by).toBeUndefined();
    expect(screen.getByLabelText('Consultation fee').value).toBe('price');
    responses.invoices=[invoice];await act(async()=>pending.resolve({data:created(payload),error:null}));
    expect(await screen.findByText('Invoice created.')).toBeTruthy();expect(screen.queryByLabelText('Consultation fee')).toBeNull();
  });
  it('retains a rejected invoice draft and permits corrections',async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:'22023',message:'Synthetic invoice rejection'}});await openEncounter();fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));
    await screen.findByText('Synthetic invoice rejection');expect(screen.getByLabelText('Consultation fee').value).toBe('price');
    expect(screen.getByLabelText('Consultation fee').closest('fieldset').disabled).toBe(false);expect(screen.queryByText('Invoice created.')).toBeNull();
  });
  it('freezes and retries an unconfirmed invoice with the same ID and lines',async()=>{
    supabase.rpc.mockRejectedValueOnce(new Error('Synthetic lost response')).mockImplementationOnce(async(_,payload)=>({data:created(payload),error:null}));
    await openEncounter();fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));const retry=await screen.findByRole('button',{name:'Retry invoice'});
    expect(screen.getByLabelText('Consultation fee').closest('fieldset').disabled).toBe(true);expect(screen.getByRole('button',{name:'Cancel'}).disabled).toBe(true);
    expect(screen.getByRole('button',{name:'Refresh billing'}).disabled).toBe(true);fireEvent.click(retry);
    await screen.findByText('Invoice created.');expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);
  });
  it('does not confirm a malformed invoice response',async()=>{
    supabase.rpc.mockResolvedValue({data:{id:'invoice',code:'IV-TEST'},error:null});await openEncounter();fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));
    await screen.findByRole('button',{name:'Retry invoice'});expect(screen.queryByText('Invoice created.')).toBeNull();
  });
  it('requires a price for each clinical line before a save',async()=>{
    render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Bill this visit'}));fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));
    expect(screen.getByText(/Select a price for each/)).toBeTruthy();expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('keeps an OTC draft after line storage is rejected',async()=>{
    supabase.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Synthetic line failure'}});
    render(<CashierDashboard staff={staff}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'New OTC sale'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'New OTC sale'}));fireEvent.change(screen.getByLabelText('Patient'),{target:{value:'patient'}});fireEvent.change(screen.getByLabelText('OTC item'),{target:{value:'price'}});
    fireEvent.click(screen.getByRole('button',{name:'Create OTC invoice'}));await screen.findByText('Synthetic line failure');
    expect(screen.getByLabelText('Patient').value).toBe('patient');expect(screen.getByLabelText('OTC item').value).toBe('price');expect(supabase.rpc.mock.calls[0][1].p_sale_type).toBe('OTC');
  });
});
describe('payment confirmation UI',()=>{
  it('retains and freezes the payment method after an unconfirmed response',async()=>{
    responses.invoices=[invoice];supabase.rpc.mockRejectedValueOnce(new Error('Synthetic network failure')).mockResolvedValueOnce({data:{...invoice,status:'Paid',payment_method:'Card',paid_by:'cashier',paid_at:'2026-10-11'},error:null});
    render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Mark paid'}));fireEvent.change(screen.getByLabelText('Payment method'),{target:{value:'Card'}});fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
    const retry=await screen.findByRole('button',{name:'Retry payment'});expect(screen.getByLabelText('Payment method').disabled).toBe(true);expect(screen.getByRole('button',{name:'Cancel'}).disabled).toBe(true);
    responses.invoices=[{...invoice,status:'Paid',payment_method:'Card'}];fireEvent.click(retry);await screen.findByText('Payment recorded.');
    expect(supabase.rpc.mock.calls[0]).toEqual(supabase.rpc.mock.calls[1]);expect(supabase.rpc).toHaveBeenCalledWith('record_invoice_payment',{p_invoice_id:'invoice',p_payment_method:'Card'});
  });
  it('does not show a failed payment as paid',async()=>{
    responses.invoices=[invoice];supabase.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Synthetic payment conflict'}});
    render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Mark paid'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));await screen.findByText('Synthetic payment conflict');
    expect(screen.queryByText('Payment recorded.')).toBeNull();expect(screen.getByLabelText('Payment method').disabled).toBe(false);
  });
});
describe('billing reads and receipts',()=>{
  it('retains a read-only snapshot when one billing query fails',async()=>{
    render(<CashierDashboard staff={staff}/>);await screen.findByRole('button',{name:'Bill this visit'});responses.price_list={data:null,error:{message:'Synthetic failure'}};
    fireEvent.click(screen.getByRole('button',{name:'Refresh billing'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Bill this visit'}).disabled).toBe(true);expect(screen.getByText('Synthetic patient')).toBeTruthy();
    responses.price_list=[price];fireEvent.click(screen.getByRole('button',{name:'Retry billing'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Bill this visit'}).disabled).toBe(false));
  });
  it('does not describe unavailable billing data as an empty queue',async()=>{
    responses.invoices={data:null,error:{message:'Synthetic failure'}};render(<CashierDashboard staff={staff}/>);await screen.findByRole('alert');expect(screen.queryByText('Nothing to bill right now.')).toBeNull();expect(screen.queryByText('No invoices yet.')).toBeNull();
  });
  it('refreshes a rejected draft with the new catalogue price before retrying',async()=>{
    supabase.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Price changed'}}).mockImplementationOnce(async(_,payload)=>({data:{...created(payload),total:11},error:null}));
    await openEncounter();fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));await screen.findByText('Price changed');
    responses.price_list=[{...price,price:11}];fireEvent.click(screen.getByRole('button',{name:'Refresh billing'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Create invoice'}).disabled).toBe(false));
    expect(screen.getAllByText('KES 11')).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'Create invoice'}));await screen.findByText('Invoice created.');
    expect(supabase.rpc.mock.calls[1][1].p_items[0].expected_unit_price).toBe(11);expect(supabase.rpc.mock.calls[0][1].p_request_id).not.toBe(supabase.rpc.mock.calls[1][1].p_request_id);
  });
  it('escapes receipt text and isolates the print window',async()=>{
    responses.invoices=[{...invoice,patients:{...patient,name:'<img src=x onerror="alert(1)">',code:'<script>alert(2)</script>'},code:'IV-<script>alert(3)</script>'}];responses.invoice_items=[{label:'<svg onload="alert(4)">',quantity:1,unit_price:10.25,amount:10.25}];
    const win={opener:{},document:{write:vi.fn(),close:vi.fn()},focus:vi.fn(),print:vi.fn()};vi.spyOn(window,'open').mockReturnValue(win);
    render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Print receipt'}));await waitFor(()=>expect(win.print).toHaveBeenCalledTimes(1));
    const html=win.document.write.mock.calls[0][0];expect(html).not.toContain('<script>');expect(html).not.toContain('<svg onload');expect(html).toContain('&lt;img');expect(html).toContain('Content-Security-Policy');expect(win.opener).toBeNull();
  });
  it.each(['error','empty','mismatch'])('refuses an unverifiable receipt (%s)',async kind=>{
    responses.invoices=[invoice];responses.invoice_items=kind==='error'?{data:null,error:{message:'Synthetic receipt failure'}}:kind==='empty'?[]:[{label:'Synthetic',quantity:1,amount:1}];const open=vi.spyOn(window,'open');
    render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Print receipt'}));await screen.findByText(/Receipt could not be verified/);expect(open).not.toHaveBeenCalled();
  });
  it('shows blocked popups as a recoverable print error',async()=>{
    responses.invoices=[invoice];vi.spyOn(window,'open').mockReturnValue(null);render(<CashierDashboard staff={staff}/>);fireEvent.click(await screen.findByRole('button',{name:'Print receipt'}));await screen.findByText(/Allow popups/);
  });
});
