import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { AppBar, Button, Card, Field, Loading, Notice, Rupees, TextInput, useAsync } from '../../components/ui.js'

export function Subscription() {
  const t=useT(); const nav=useNavigate(); const [data,loading]=useAsync(()=>api.subscription(),[])
  const [utr,setUtr]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false)
  if(loading||!data) return <><AppBar title={t('pay.title')} backTo="/seller"/><div className="screen"><Loading/></div></>
  const {account,plan,status,slots,payments}=data; const latest=payments[0]
  const waiting=status==='PAYMENT_SUBMITTED'; const needsInitial=status==='REGISTERED'||status==='PAYMENT_REJECTED'; const canBuyExtra=status==='ACTIVE'&&slots.isFull
  async function submit(){
    if(utr.trim().length<6){setErr(t('pay.utrHint'));return}
    setBusy(true);setErr('')
    try{await api.submitPayment(utr.trim());nav('/seller/waiting',{replace:true})}
    catch(e){setErr(e instanceof ApiError?(e.messageMr??e.message):'Network error')}finally{setBusy(false)}
  }
  const upiLink=`upi://pay?pa=${account.upiId}&pn=${encodeURIComponent(account.label)}&am=${plan.price}.00&cu=INR&tn=Shanta Mahila Bazar%20${canBuyExtra?'additional slots':'registration'}`
  if(waiting) return <><AppBar title={t('pay.title')} backTo="/seller"/><div className="screen stack"><Notice tone="info" title="पेमेंट पडताळणी सुरू आहे">तुमचे पेमेंट आणि UTR आधीच सबमिट झाले आहेत. पडताळणी पूर्ण होईपर्यंत पुन्हा पैसे भरू नका.</Notice>{latest&&<Card><div className="row-between"><span className="dim">{t('pay.utr')}</span><strong className="num">{latest.utr}</strong></div><div className="row-between" style={{marginTop:8}}><span className="dim">रक्कम</span><Rupees value={latest.amount}/></div></Card>}<Button variant="quiet" onClick={()=>nav('/seller/waiting')}>पडताळणी स्थिती पाहा</Button><Button variant="quiet" onClick={()=>nav('/seller')}>{t('biz.title')}</Button></div></>
  if(!needsInitial&&!canBuyExtra) return <><AppBar title={t('pay.title')} backTo="/seller"/><div className="screen stack"><Notice tone="ok" title="सध्या पेमेंटची गरज नाही">तुमची नोंदणी मंजूर आहे आणि तुमच्याकडे {slots.left} उत्पादन जागा उपलब्ध आहेत. सर्व जागा भरल्यानंतरच अतिरिक्त स्लॉटसाठी पेमेंट करा.</Notice><Card><div className="row-between"><span>{t('biz.myProducts')}</span><strong>{slots.used} / {slots.total}</strong></div></Card><Button onClick={()=>nav('/seller/products')}>{t('biz.myProducts')}</Button></div></>
  return <><AppBar title={canBuyExtra?'अतिरिक्त उत्पादन जागा':t('pay.title')} backTo="/seller"/><div className="screen stack"><Card style={{textAlign:'center'}}><div className="hero-num"><Rupees value={plan.price}/></div><p className="muted" style={{marginTop:'var(--s2)'}}>{canBuyExtra?'सर्व उत्पादन जागा भरल्या आहेत. आणखी 5 जागांसाठी पेमेंट करा.':t('pay.what')}</p></Card><Card><div className="section-title">{t('pay.payTo')}</div><div className="stack-sm"><div style={{aspectRatio:1,maxWidth:200,margin:'0 auto',background:'var(--surface-2)',borderRadius:'var(--r)',display:'grid',placeItems:'center',fontSize:'3rem',border:'1px solid var(--line)'}} aria-label={t('pay.scanQr')}>🔳</div><div className="center"><div className="small dim">{t('pay.upiId')}</div><strong className="num">{account.upiId}</strong></div><a className="btn" href={upiLink}>{t('cus.payNow')} · ₹{plan.price}</a><div className="small dim center">{account.bankName} · A/C {account.accountNo} · {account.ifsc}</div></div></Card><Card><div className="section-title">{t('pay.afterPaying')}</div><Field label={t('pay.utr')} hint={t('pay.utrHint')} error={err} required htmlFor="utr"><TextInput id="utr" inputMode="numeric" value={utr} error={!!err} onChange={e=>{setUtr(e.target.value.replace(/\s/g,''));setErr('')}} placeholder="512309887711"/></Field></Card><Button onClick={()=>void submit()} disabled={busy}>{busy?t('common.loading'):t('pay.submit')}</Button></div></>
}

export function PaymentWaiting(){
  const t=useT(); const nav=useNavigate(); const [data,loading]=useAsync(()=>api.subscription(),[])
  if(loading||!data) return <div className="app-shell"><div className="screen"><Loading/></div></div>
  const latest=data.payments[0]
  if(data.status==='ACTIVE') return <div className="app-shell"><div className="screen screen--nonav stack center" style={{justifyContent:'center',minHeight:'100vh'}}><div style={{fontSize:'4rem'}}>🎉</div><h1 className="h1">{t('wait.approved')}</h1><p className="muted">{t('wait.approvedSub')}</p><Button onClick={()=>nav('/seller/upload',{replace:true})}>{t('wait.addFirst')}</Button><Button variant="quiet" onClick={()=>nav('/seller',{replace:true})}>{t('biz.title')}</Button></div></div>
  if(data.status==='PAYMENT_REJECTED') return <div className="app-shell"><AppBar title={t('pay.title')}/><div className="screen screen--nonav stack"><div className="center stack-sm"><div style={{fontSize:'3.5rem'}}>⚠️</div><h1 className="h1">{t('wait.rejected')}</h1></div>{latest?.rejectReason&&<Notice tone="danger">{latest.rejectReason}</Notice>}<Button onClick={()=>nav('/seller/subscription')}>{t('wait.resubmit')}</Button></div></div>
  return <div className="app-shell"><AppBar title={t('pay.title')}/><div className="screen screen--nonav stack"><div className="center stack-sm" style={{paddingTop:'var(--s5)'}}><div style={{fontSize:'4rem'}}>⏳</div><h1 className="h1">{t('wait.title')}</h1><p className="h3" style={{color:'var(--ink-2)',fontWeight:600}}>{t('wait.sub')}</p></div><Notice tone="info">तुमचे पेमेंट सबमिट झाले आहे. पडताळणी पूर्ण होईपर्यंत पुन्हा नोंदणी किंवा पेमेंट करू नका.</Notice>{latest&&<Card><div className="section-title">{t('wait.youSent')}</div><div className="stack-sm"><div className="row-between"><span className="dim">{t('pay.title')}</span><strong><Rupees value={latest.amount}/></strong></div><div className="row-between"><span className="dim">{t('pay.utr')}</span><strong className="num">{latest.utr}</strong></div></div></Card>}<Button variant="quiet" onClick={()=>nav('/seller')}>{t('biz.title')}</Button></div></div>
}
