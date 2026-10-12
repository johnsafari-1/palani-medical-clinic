import { describe, it, expect, vi } from "vitest";
import { buildPatientSummary, buildReferralLetter, openClinicalPrintWindow, printClinicalDocument } from './clinicalDocuments';
const injection = '<img src=x onerror="alert(1)"><script>alert(2)</script>&';
const patient = {id:'p',name:injection,code:injection,dob:'2000-01-01',gender:injection,phone:injection};
const allergy = {assessment:'known',revision:2,recorded_at:'2026-10-11T10:00:00Z',recorded_by:injection,change_reason:injection,allergies:[{substance:injection,reaction:injection,severity:'severe',criticality:'high',category:'medication',type:'allergy',clinical_status:'active',verification_status:'confirmed',note:injection}]};
const sections = () => Object.fromEntries(['allergies','consultations','vitals','lab_orders','admissions','invoices'].map(key => [key,{status:'ready',readAt:'2026-10-11T10:00:00Z',rows:[]} ]));
const referral = {id:'r',patient_id:'p',direction:'Outgoing',code:injection,created_by:injection,facility_name:injection,referring_doctor:injection,reason:injection,notes:injection,urgency:injection,created_at:'2026-10-11T10:00:00Z'};
describe('clinical print documents', () => {
  it('escapes all supplied text, restricts active content and labels test data', () => {
    const data=sections();data.allergies.rows=[allergy];
    data.consultations.rows=[{diagnosis:injection,notes:injection,created_at:'2026-10-11T10:00:00Z',prescriptions:[{drug:injection,dosage:injection,instructions:injection}]}];
    data.lab_orders.rows=[{test_name:injection,status:injection,result:injection}]; data.admissions.rows=[{status:injection,reason:injection}];data.invoices.rows=[{code:injection,status:injection,total:0}];
    for(const html of [buildPatientSummary(patient,data),buildReferralLetter(patient,referral,{consultations:data.consultations.rows,vitals:[],allergies:[allergy]})]) {
      expect(html).not.toContain(injection); expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).toContain('&lt;img');
      expect(html).toContain("default-src 'none'");expect(html).toContain("base-uri 'none'");expect(html).toContain('TEST DATA');expect(html).toContain('EAT');
      expect(html).toContain('Reaction severity: severe');expect(html).toContain('Future-risk criticality: high');
    }
  });
  it('keeps zero readings, measured versus recorded times, admissions and invoice totals', () => {
    const data=sections();data.vitals.rows=[{bp_systolic:0,bp_diastolic:0,temperature:0,pulse:0,weight:0,recorded_at:'2026-10-11T11:00:00Z',measured_at:null}];
    data.admissions.rows=[{status:'Admitted',reason:'Synthetic reason'}];data.invoices.rows=[{code:'IV',total:0}];
    const html=buildPatientSummary(patient,data);
    for(const value of ['0/0 mmHg','Temperature: 0 °C','Pulse: 0 beats/min','Weight: 0 kg','Measured: Not recorded','Recorded: 11 Oct 2026, 14:00 EAT','Synthetic reason','Total: KES 0']) expect(html).toContain(value);
  });
  it('distinguishes unavailable, unassessed, unknown and no-known states', () => {
    const data=sections();expect(buildPatientSummary(patient,data)).toContain('Not assessed');
    data.allergies={status:'unavailable',rows:[]};const failed=buildPatientSummary(patient,data);expect(failed).toContain('INCOMPLETE SUMMARY');expect(failed).not.toContain('Not assessed');expect(failed).not.toContain('No known allergies');
    data.allergies={status:'ready',rows:[{...allergy,assessment:'unknown',allergies:[]}]};expect(buildPatientSummary(patient,data)).toContain('Allergy status unknown');
    data.allergies.rows=[{...allergy,assessment:'no_known',allergies:[{...allergy.allergies[0],verification_status:'entered-in-error',clinical_status:null}]}];
    const corrected=buildPatientSummary(patient,data);expect(corrected).toContain('No known allergies reported');expect(corrected).toContain('entered-in-error');
  });
  it('does not attribute the referral to the staff member who prints it', () => {
    const html=buildReferralLetter(patient,{...referral,created_by:'original-doctor'},{consultations:[],vitals:[],allergies:[]});
    expect(html).toContain('Referring staff ID: original-doctor');expect(html).toContain('Receiving doctor: &lt;');
    expect(()=>buildReferralLetter(patient,{...referral,patient_id:'wrong'},{consultations:[],vitals:[],allergies:[]})).toThrow(/identity/);
  });
  it('isolates its opener, handles blocked popups and checks closed windows', () => {
    vi.spyOn(window,'open').mockReturnValueOnce(null);expect(openClinicalPrintWindow).toThrow(/Allow popups/);
    const win={opener:{},closed:false,document:{write:vi.fn(),open:vi.fn(),close:vi.fn()},focus:vi.fn(),print:vi.fn()};window.open.mockReturnValue(win);
    expect(openClinicalPrintWindow()).toBe(win);expect(win.opener).toBeNull();printClinicalDocument(win,'safe');expect(win.print).toHaveBeenCalledOnce();
    win.closed=true;expect(()=>printClinicalDocument(win,'safe')).toThrow(/closed/);
  });
});
