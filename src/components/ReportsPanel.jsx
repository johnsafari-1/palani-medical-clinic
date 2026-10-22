import {useEffect,useRef,useState} from 'react';
import {Printer,RefreshCw} from 'lucide-react';
import {supabase} from '../supabaseClient';
import {parseOperationsReport,operationsReportRows} from '../reporting/operationsReport';
import {buildOperationsReport,displayTime,openClinicalPrintWindow,printClinicalDocument} from '../printing/clinicalDocuments';
export default function ReportsPanel(){
  const [stats,setStats]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[printError,setPrintError]=useState('');
  const mounted=useRef(false),generation=useRef(0);
  async function load(){
    const request=++generation.current;setLoading(true);setError('');setPrintError('');
    try{const {data,error:readError}=await supabase.rpc('clinic_operations_report');if(readError)throw new Error('Operations report unavailable. Retry the report.');const verified=parseOperationsReport(data);if(mounted.current&&request===generation.current)setStats(verified);}
    catch(e){if(mounted.current&&request===generation.current)setError(e.message);}
    finally{if(mounted.current&&request===generation.current)setLoading(false);}
  }
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;generation.current++;};},[]);
  function printReport(){
    if(!stats||loading||error)return;
    let win;setPrintError('');try{win=openClinicalPrintWindow();printClinicalDocument(win,buildOperationsReport(stats,operationsReportRows(stats)));}catch(e){win?.close();setPrintError(e.message);}
  }
  return <section aria-label="Operations reports" aria-busy={loading}>
    <div className="wl-record-heading" style={{marginBottom:14}}><div><h2>Operations report</h2><p>Test-data workspace · rolling seven-day period</p></div><div className="wl-record-actions"><button className="wl-btn" disabled={loading} onClick={load}><RefreshCw size={14}/>{error?'Retry report':'Refresh report'}</button><button className="wl-btn" disabled={!stats||loading||!!error} onClick={printReport}><Printer size={14}/>Print report</button></div></div>
    {loading&&<p role="status">Loading report…</p>}
    {error&&<p className="wl-alert" role="alert">{error} {stats?'Previous snapshot shown below; printing is disabled.':'No verified totals are available.'}</p>}
    {printError&&<p className="wl-alert" role="alert">{printError}</p>}
    {stats&&<><p className="wl-record-meta">Read: {displayTime(stats.read_at)} · Period begins: {displayTime(stats.period_start)}</p>{stats.paidWithoutTimestamp>0&&<p className="wl-alert">{stats.paidWithoutTimestamp} paid invoice(s) have no payment timestamp and are excluded from the seven-day revenue figure.</p>}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}>{operationsReportRows(stats).map(([label,value])=><article className="wl-card" key={label} style={{padding:18}}><h3 style={{fontSize:13}}>{label}</h3><p style={{fontSize:21,fontWeight:600,overflowWrap:'anywhere'}}>{value}</p></article>)}</div></>}
  </section>;
}
