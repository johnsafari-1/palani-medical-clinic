import { describe, expect, it, vi } from 'vitest';
import { createInvoiceSubmission, createPaymentSubmission } from './billingSubmission';
describe('unconfirmed billing request identity',()=>{
  it('prevents a changed invoice payload being sent while the previous result is unknown',async()=>{
    const client={rpc:vi.fn().mockRejectedValue(new Error('Synthetic lost response'))};
    const submission=createInvoiceSubmission(client,()=> 'request');
    await expect(submission.save({p_patient_id:'patient',p_items:[]})).rejects.toThrow('lost response');
    await expect(submission.save({p_patient_id:'different-patient',p_items:[]})).rejects.toThrow('unconfirmed');
    expect(client.rpc).toHaveBeenCalledTimes(1);expect(submission.hasPending()).toBe(true);
  });
  it('prevents a changed method or invoice being sent while a payment is unconfirmed',async()=>{
    const client={rpc:vi.fn().mockRejectedValue(new Error('Synthetic lost response'))};const submission=createPaymentSubmission(client);
    await expect(submission.save('invoice','Cash')).rejects.toThrow('lost response');
    await expect(submission.save('invoice','Card')).rejects.toThrow('unconfirmed');await expect(submission.save('different-invoice','Cash')).rejects.toThrow('unconfirmed');
    expect(client.rpc).toHaveBeenCalledTimes(1);expect(submission.hasPending()).toBe(true);
  });
});
