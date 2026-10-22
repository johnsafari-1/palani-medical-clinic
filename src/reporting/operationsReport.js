const counts=['totalPatients','newPatients','admittedNow','consultsThisWeek','outstandingCount','paidWithoutTimestamp'];
const amounts=['totalRevenue','revenueThisWeek','outstanding'];
export function parseOperationsReport(data) {
  if(!data||data.schema_version!==1||!Number.isFinite(Date.parse(data.read_at))||!Number.isFinite(Date.parse(data.period_start))||Date.parse(data.period_start)>Date.parse(data.read_at))throw new Error('Report response could not be verified.');
  if(counts.some(key=>!Number.isSafeInteger(data[key])||data[key]<0))throw new Error('Invalid report counts.');
  const result={...data};
  for(const key of amounts){
    if(typeof data[key]!=='string'||!/^\d+(\.\d{1,2})?$/.test(data[key]))throw new Error('Invalid report total.');
    const [whole,fraction='']=data[key].split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Report total exceeds supported precision.');
    result[key]=Number(cents)/100;
  }
  return result;
}
export const formatMoney=value=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(value);
export function operationsReportRows(stats) {
  return [
    ['Total patients',String(stats.totalPatients)],['New patients in last 7 days',String(stats.newPatients)],
    ['Consultations in last 7 days',String(stats.consultsThisWeek)],['Currently admitted',String(stats.admittedNow)],
    ['Total paid revenue',formatMoney(stats.totalRevenue)],['Paid revenue in last 7 days (payment time)',formatMoney(stats.revenueThisWeek)],
    ['Outstanding invoices',`${formatMoney(stats.outstanding)} (${stats.outstandingCount} invoices)`],
    ['Paid invoices missing payment timestamp',String(stats.paidWithoutTimestamp)],
  ];
}
