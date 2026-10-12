import { describe, it, expect, vi } from "vitest";
import { readRecordSection, readReferralContext } from "./recordReads";
const staff = {id:'doctor',role:'Doctor',active:true};
function clientFor(results, currentStaff = staff) {
  const calls = []; let index = 0;
  const client = { from: vi.fn(table => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query), range: vi.fn((from,to) => { calls.push([table,from,to]); return query; }), maybeSingle: () => query, then: (resolve,reject) => Promise.resolve(table === "staff" ? {data:currentStaff} : results[index++]).then(resolve,reject) };
    return query;
  }) }; return {client,calls};
}
const rows = Array.from({length:201}, (_,i) => ({id:`v-${i}`,patient_id:'patient'}));
describe('clinical record reads', () => {
  it('paginates beyond one page and checks exact counts', async () => {
    const {client,calls} = clientFor([{data:rows.slice(0,200),count:201},{data:rows.slice(200),count:201}]);
    expect(await readRecordSection(client,'vitals','patient',staff)).toEqual(rows);
    expect(calls).toEqual([['vitals',0,199],['vitals',200,399]]);
  });
  it.each([
    [{data:[],error:{message:'denied'},count:0}], [{data:null,count:0}], [{data:[],count:null}], [{data:[],count:5001}],
    [{data:[],count:1}], [{data:[{id:'wrong',patient_id:'other'}],count:1}],
    [{data:[rows[0],rows[0]],count:2}],
    [{data:rows.slice(0,200),count:201},{data:rows.slice(200),count:202}],
    [{data:rows.slice(0,200),count:201},{data:[rows[0]],count:201}],
    [{data:[{id:'c',patient_id:'patient',prescriptions:[{consultation_id:'wrong'}]}],count:1}],
  ])('rejects denied, malformed, changing or incomplete reads %#', async (...results) => {
    const {client} = clientFor(results);
    const table = results[0]?.data?.[0]?.id === 'c' ? 'consultations' : 'vitals';
    await expect(readRecordSection(client,table,'patient',staff)).rejects.toThrow();
  });
  it('does not issue an allergy read for Reception or an unknown role', async () => {
    const {client} = clientFor([{data:[]}]);
    for (const role of ['Receptionist',undefined,'Cashier']) await expect(readRecordSection(client,'allergies','patient',{id:'doctor',role})).rejects.toThrow(/staff role/);
    expect(client.from).not.toHaveBeenCalled();
  });
  it.each([{...staff,active:false},{...staff,role:'Receptionist'},null])('rejects stale staff authorization %#',async current=>{
    const {client}=clientFor([{data:[]}],current);
    await expect(readRecordSection(client,'allergies','patient',staff)).rejects.toThrow(/access/);
    expect(client.from.mock.calls.some(([table])=>table==='patient_allergy_reviews')).toBe(false);
  });
  it('accepts an empty allergy read only for an allowed role', async () => {
    const {client} = clientFor([{data:[]}]);
    expect(await readRecordSection(client,'allergies','patient',staff)).toEqual([]);
  });
  it('rejects malformed allergy records', async () => {
    const {client} = clientFor([{data:[{id:'wrong',patient_id:'patient'}]}]);
    await expect(readRecordSection(client,'allergies','patient',staff)).rejects.toThrow();
  });
  it('referral context fails when any required section is unavailable', async () => {
    const {client} = clientFor([{data:[],count:0},{data:null,error:{message:'offline'}},{data:[]}]);
    await expect(readReferralContext(client,'patient',staff)).rejects.toThrow();
  });
});
