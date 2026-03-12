import { useState, useEffect } from 'react'
import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAMkmq0EdQt8y9tMA9UFH5feI2YyccHaa8",
  authDomain: "pontoapp-5cbc4.firebaseapp.com",
  projectId: "pontoapp-5cbc4",
  storageBucket: "pontoapp-5cbc4.firebasestorage.app",
  messagingSenderId: "532087110856",
  appId: "1:532087110856:web:15bb509ff5af13dd3879fd"
}
const firebaseApp = initializeApp(firebaseConfig)
const db = initializeFirestore(firebaseApp, { experimentalForceLongPolling: true })
const SUPER_ADMIN = { username: 'superadmin', password: 'super@2024' }

// ─── Inject fonts ─────────────────────────────────────────────────────────────
if (!document.getElementById('pf')) {
  const s = document.createElement('style'); s.id = 'pf'
  s.textContent = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;0,900;1,400&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:4px}
  input[type=month]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes shimmer{0%{background-position:-200%}100%{background-position:200%}}
  .fade-up{animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both}
  `
  document.head.appendChild(s)
}

// ─── Theme System ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react'

const LIGHT_TOKENS = {
  bg:'#F7F8FC', bgAlt:'#FFFFFF', surface:'#FFFFFF', ink:'#0F172A',
  inkMid:'#475569', inkLight:'#94A3B8', inkXLight:'#CBD5E1',
  border:'#E8EDF5', borderMid:'#CBD5E1',
}
const DARK_TOKENS = {
  bg:'#0F1117', bgAlt:'#161B27', surface:'#1E2433', ink:'#F1F5F9',
  inkMid:'#94A3B8', inkLight:'#475569', inkXLight:'#334155',
  border:'#2A3148', borderMid:'#3B4563',
}
const FIXED = {
  brand:'#5B4CF5', brandDk:'#4338CA', brandLt:'#EEF0FD', brandGlow:'rgba(91,76,245,.18)',
  emerald:'#059669', emeraldLt:'#D1FAE5', amber:'#D97706', amberLt:'#FEF3C7',
  rose:'#E11D48', roseLt:'#FFE4E6', sky:'#0369A1', skyLt:'#E0F2FE',
  gold:'#B45309', goldLt:'#FEF9C3',
  ff:"'Fraunces', Georgia, serif", fb:"'Plus Jakarta Sans', system-ui, sans-serif",
}
type Tokens = typeof LIGHT_TOKENS & typeof FIXED
const mkTokens = (dark: boolean): Tokens => ({...(dark ? DARK_TOKENS : LIGHT_TOKENS), ...FIXED})
const ThemeCtx = createContext<{dark:boolean;toggle:()=>void;C:Tokens}>({
  dark:false, toggle:()=>{}, C:mkTokens(false)
})
const useTheme = () => useContext(ThemeCtx)
// Module-level C used by non-React helpers; components use useTheme().C
const C: Tokens = mkTokens(false)

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt    = (v: number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const fmtT   = (d: Date)   => d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
const fmtD   = (d: Date)   => d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
const DOW_ABBR=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const fmtDow = (date:string) => DOW_ABBR[new Date(date+'T12:00:00').getDay()]
const fmtDs  = (d: Date)   => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})
const fmtDur = (ms: number)=> { if(!ms||ms<0) return '00:00:00'; const t=Math.floor(ms/1000); return `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}` }
const fmtH   = (ms: number)=> !ms||ms<0?'0.00h':(ms/3600000).toFixed(2)+'h'
const fmtHM  = (ms: number)=> { if(!ms||ms<0) return '0h00'; const t=Math.floor(ms/60000); return `${Math.floor(t/60)}h${String(t%60).padStart(2,'0')}` }
const TODAY  = ()=> new Date().toISOString().split('T')[0]
const getDaysInMonth = (y:number,m:number)=>{ const d=[],dt=new Date(y,m,1); while(dt.getMonth()===m){d.push(dt.toISOString().split('T')[0]);dt.setDate(dt.getDate()+1)}; return d }

const STATUS = {OUT:'out',IN:'in',BREAK:'break'}
const sLabel: Record<string,string>  = {out:'Offline',in:'Trabalhando',break:'Em pausa'}
const sColor: Record<string,string>  = {out:C.inkLight,in:C.emerald,break:C.amber}
const tLabel: Record<string,string>  = {entrada:'Entrada',saida:'Saída',inicio_pausa:'Início de Pausa',fim_pausa:'Fim de Pausa'}
const tColor: Record<string,string>  = {entrada:C.emerald,saida:C.rose,inicio_pausa:C.amber,fim_pausa:C.sky}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Discount   { id:number;value:number;reason:string;date:string }
interface Company    { name:string;cnpj:string;address:string;phone:string;email:string;logo:string }
interface CompanyMeta{ slug:string;name:string;adminUsername:string;adminPassword:string;createdAt:string }
interface Employee   { id:number;name:string;role:string;username:string;password:string;avatar:string;payType:'month'|'day'|'hour';payValue:number;hoursPerDay:number;overtimeRate:50|70|100;discounts:Discount[];gratifications:Discount[];cpf?:string;admission?:string;fgts?:boolean;inss?:boolean;irrf?:boolean;regime?:'clt'|'pj'|'avulso';overtimeToBank?:boolean;companySlug:string }
interface LogEntry   { type:string;time:Date }
type AbsenceType = 'paid'|'unpaid'|'medical'|'justified'|'holiday'|'compensatory'|'bank_in'
interface EmpState   { status:string;log:LogEntry[];workStart:Date|null;breakStart:Date|null;totalWork:number;totalBreak:number;days:string[];dailyWork:Record<string,number>;dailyOff:Record<string,AbsenceType>;dailyNight:Record<string,number>;dailyOvertimeRate:Record<string,number>;bankBalance:number }

// Configuração de cada tipo de ausência
const ABSENCE_CONFIG: Record<AbsenceType,{label:string;emoji:string;color:string;colorLt:string;paga:boolean;contaDSR:boolean;descontaDia:boolean;descricao:string}> = {
  paid:        {label:'Folga Paga',      emoji:'✅',color:'#059669',colorLt:'#D1FAE5',paga:true, contaDSR:false,descontaDia:false,descricao:'Dia de folga remunerado pela empresa'},
  unpaid:      {label:'Falta Injustif.', emoji:'❌',color:'#E11D48',colorLt:'#FFE4E6',paga:false,contaDSR:true, descontaDia:true, descricao:'Falta sem justificativa — desconta dia + DSR'},
  medical:     {label:'Atestado Médico', emoji:'🏥',color:'#0369A1',colorLt:'#E0F2FE',paga:true, contaDSR:false,descontaDia:false,descricao:'Afastamento médico — protegido por lei (CLT 473)'},
  justified:   {label:'Falta Justif.',  emoji:'📋',color:'#D97706',colorLt:'#FEF3C7',paga:false,contaDSR:false,descontaDia:true, descricao:'Falta justificada — desconta o dia, mas não o DSR'},
  holiday:     {label:'Feriado',         emoji:'🎉',color:'#7C3AED',colorLt:'#EDE9FE',paga:true, contaDSR:false,descontaDia:false,descricao:'Feriado nacional ou estadual — remunerado por lei'},
  compensatory:{label:'Folga Compens.', emoji:'🔄',color:'#0891B2',colorLt:'#CFFAFE',paga:true, contaDSR:false,descontaDia:false,descricao:'Compensação por trabalho em feriado ou hora extra'},
  bank_in:     {label:'Banco de Horas',  emoji:'🏦',color:'#6366F1',colorLt:'#EEF2FF',paga:false,contaDSR:false,descontaDia:false,descricao:'Horas extras creditadas no banco de horas'},
}
interface User       { id:number;name:string;username:string;avatar:string;role:string;payType:'month'|'day'|'hour';payValue:number;hoursPerDay:number;discounts:Discount[];companySlug?:string }

// ─── Tabelas Fiscais 2025 ────────────────────────────────────────────────────
// INSS empregado — tabela progressiva 2025
const INSS_TABLE=[
  {max:1518.00,  rate:0.075},
  {max:2793.88,  rate:0.090},
  {max:4190.83,  rate:0.120},
  {max:8157.41,  rate:0.140},
]
function calcINSS(gross:number):number{
  let inss=0,prev=0
  for(const fx of INSS_TABLE){
    if(gross<=0) break
    const base=Math.min(gross,fx.max)-prev
    if(base<=0){prev=fx.max;continue}
    inss+=base*fx.rate
    prev=fx.max
    if(gross<=fx.max) break
  }
  // teto: acima do último teto, aplica 14% sobre o excedente até o teto máximo INSS
  if(gross>8157.41) inss+=(Math.min(gross,8157.41)-8157.41)*0.14 // já coberto
  return Math.round(inss*100)/100
}

// IRRF 2025 — base = bruto - INSS - dependentes(R$189,59/dep)
const IRRF_TABLE=[
  {max:2259.20,  rate:0,    deduct:0},
  {max:2826.65,  rate:0.075,deduct:169.44},
  {max:3751.05,  rate:0.150,deduct:381.44},
  {max:4664.68,  rate:0.225,deduct:662.77},
  {max:Infinity, rate:0.275,deduct:896.00},
]
function calcIRRF(baseCalc:number,dependentes=0):number{
  const dedDep=dependentes*189.59
  const base=Math.max(0,baseCalc-dedDep)
  for(const fx of IRRF_TABLE){
    if(base<=fx.max) return Math.max(0,Math.round((base*fx.rate-fx.deduct)*100)/100)
  }
  return 0
}

function calcNightMs(s:number,e:number){ let n=0; for(let t=s;t<e;t+=60000){ const h=new Date(t).getHours(); if(h>=22||h<5)n+=60000 }; return n }

// ─── Components ───────────────────────────────────────────────────────────────
function Chip({children,color=C.brand,bg=C.brandLt}:{children:React.ReactNode;color?:string;bg?:string}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 9px',borderRadius:20,background:bg,color,fontSize:11,fontWeight:600,fontFamily:C.fb,letterSpacing:'0.02em'}}>{children}</span>
}

function Dot({status}:{status:string}){
  const {C}=useTheme()
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
      <span style={{width:7,height:7,borderRadius:'50%',background:sColor[status],boxShadow:status===STATUS.IN?`0 0 0 3px ${C.emeraldLt}`:undefined,display:'inline-block'}}/>
      <span style={{fontFamily:C.fb,fontSize:11,fontWeight:600,color:sColor[status]}}>{sLabel[status]}</span>
    </span>
  )
}

function Input({label,type='text',value,onChange,placeholder,error,hint,autoFocus}:{
  label?:string;type?:string;value:string;onChange:(v:string)=>void;placeholder?:string;error?:string;hint?:string;autoFocus?:boolean
}){
  const [show,setShow]=useState(false)
  const {C}=useTheme()
  return (
    <div style={{marginBottom:16}}>
      {label&&<div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:7}}>{label}</div>}
      <div style={{position:'relative'}}>
        <input autoFocus={autoFocus} type={type==='password'&&show?'text':type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{width:'100%',background:C.bg,border:`1.5px solid ${error?C.rose:C.border}`,borderRadius:10,padding:'12px 40px 12px 14px',color:C.ink,fontSize:14,fontFamily:C.fb,outline:'none',transition:'border-color .15s, box-shadow .15s'}}
          onFocus={e=>{e.target.style.borderColor=error?C.rose:C.brand;e.target.style.boxShadow=`0 0 0 3px ${error?C.roseLt:C.brandGlow}`}}
          onBlur={e=>{e.target.style.borderColor=error?C.rose:C.border;e.target.style.boxShadow='none'}}
        />
        {type==='password'&&<button onClick={()=>setShow(s=>!s)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.inkLight,fontSize:15,padding:0}}>{show?'🙈':'👁'}</button>}
      </div>
      {hint&&!error&&<p style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,margin:'5px 0 0'}}>{hint}</p>}
      {error&&<p style={{fontFamily:C.fb,fontSize:11,color:C.rose,margin:'5px 0 0',fontWeight:500}}>⚠ {error}</p>}
    </div>
  )
}

function Btn({children,onClick,variant='brand',full,sm,disabled}:{
  children:React.ReactNode;onClick:()=>void;variant?:'brand'|'ghost'|'danger'|'success'|'outline';full?:boolean;sm?:boolean;disabled?:boolean
}){
  const {C}=useTheme()
  const v:{[k:string]:{bg:string;color:string;border:string;shadow?:string}} = {
    brand:   {bg:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:'#fff',border:'transparent',shadow:`0 4px 14px ${C.brandGlow}`},
    ghost:   {bg:'transparent',color:C.inkMid,border:C.border},
    danger:  {bg:C.roseLt,color:C.rose,border:C.rose+'40'},
    success: {bg:C.emeraldLt,color:C.emerald,border:C.emerald+'40'},
    outline: {bg:'transparent',color:C.brand,border:C.brand},
  }
  const s=v[variant]
  return (
    <button onClick={onClick} disabled={disabled} style={{width:full?'100%':'auto',padding:sm?'8px 14px':'12px 20px',borderRadius:10,border:`1.5px solid ${s.border}`,cursor:disabled?'not-allowed':'pointer',background:s.bg,color:s.color,fontSize:sm?12:13,fontWeight:700,fontFamily:C.fb,boxShadow:s.shadow,opacity:disabled?.45:1,letterSpacing:'0.01em',transition:'opacity .15s,transform .1s'}}>
      {children}
    </button>
  )
}

function Card({children,style,pad=20}:{children:React.ReactNode;style?:object;pad?:number}){
  const {C}=useTheme()
  return <div style={{background:C.surface,borderRadius:18,border:`1px solid ${C.border}`,boxShadow:'0 1px 4px rgba(15,23,42,.04)',padding:pad,...style}}>{children}</div>
}

function Stat({label,val,sub,color=C.brand}:{label:string;val:string;sub?:string;color?:string}){
  const {C}=useTheme()
  return (
    <div style={{flex:1,padding:'12px 8px',background:C.bg,borderRadius:12,textAlign:'center'}}>
      <div style={{fontFamily:C.fb,fontSize:10,color:C.inkLight,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{label}</div>
      <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color,lineHeight:1.1}}>{val}</div>
      {sub&&<div style={{fontFamily:C.fb,fontSize:10,color:C.inkXLight,marginTop:2}}>{sub}</div>}
    </div>
  )
}

function NavBar({tabs,active,onSelect}:{tabs:{key:string;icon:string;label:string}[];active:string;onSelect:(k:string)=>void}){
  const {C}=useTheme()
  return (
    <div style={{display:'flex',padding:'8px 8px 12px',gap:2,background:C.surface,borderTop:`1px solid ${C.border}`}}>
      {tabs.map(t=>{
        const on=active===t.key
        return (
          <button key={t.key} onClick={()=>onSelect(t.key)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'9px 4px',borderRadius:12,border:'none',cursor:'pointer',background:on?C.brandLt:'transparent',transition:'background .2s'}}>
            <span style={{fontSize:18,lineHeight:1}}>{t.icon}</span>
            <span style={{fontFamily:C.fb,fontSize:10,fontWeight:on?700:400,color:on?C.brand:C.inkLight}}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── COMPANY SELECT ───────────────────────────────────────────────────────────
function CompanySelectScreen({onSelect}:{onSelect:(slug:string)=>void}){
  const [v,setV]=useState(''); const [err,setErr]=useState(''); const [load,setLoad]=useState(false)
  const {dark,toggle,C}=useTheme()

  const go=async()=>{
    const slug=v.trim().toLowerCase()
    if(!slug){setErr('Digite o código da empresa');return}
    setLoad(true);setErr('')
    try{
      const snap=await getDocs(query(collection(db,'companies'),where('slug','==',slug)))
      if(snap.empty){setErr('Empresa não encontrada. Verifique o código.');setLoad(false);return}
      onSelect(slug)
    }catch{setErr('Erro ao conectar. Tente novamente.');setLoad(false)}
  }
  return (
    <div style={{minHeight:'100vh',background:dark?`linear-gradient(160deg,#1a1f35 0%,${DARK_TOKENS.bg} 40%,#0a0d16 100%)`:`linear-gradient(160deg,${C.brandLt} 0%,#F0F4FF 40%,${C.bg} 100%)`,display:'flex',justifyContent:'center',fontFamily:C.fb,position:'relative',overflow:'hidden',transition:'background .3s'}}>
      <div style={{position:'absolute',top:-120,right:-80,width:400,height:400,borderRadius:'50%',background:`radial-gradient(circle,${C.brand}${dark?'20':'12'},transparent 70%)`,pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:-60,left:-60,width:300,height:300,borderRadius:'50%',background:`radial-gradient(circle,${C.emerald}${dark?'15':'10'},transparent 70%)`,pointerEvents:'none'}}/>

      {/* Theme Toggle */}
      <button onClick={toggle} style={{position:'absolute',top:20,right:20,zIndex:10,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:50,padding:'8px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:C.fb,fontSize:12,fontWeight:700,color:C.inkMid,boxShadow:'0 2px 12px rgba(0,0,0,.12)',transition:'all .25s'}}>
        <span style={{fontSize:16}}>{dark?'🌙':'☀️'}</span>
        <span>{dark?'Escuro':'Claro'}</span>
      </button>

      <div style={{width:'100%',maxWidth:420,display:'flex',flexDirection:'column',justifyContent:'center',padding:'40px 24px',position:'relative',zIndex:1}}>
        <div style={{textAlign:'center',marginBottom:44,animation:"fadeUp .35s cubic-bezier(.22,1,.36,1) both"}}>
          <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:76,height:76,borderRadius:24,background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,boxShadow:`0 8px 32px ${C.brandGlow}`,marginBottom:22}}>
            <span style={{fontSize:34}}>⏱</span>
          </div>
          <div style={{fontFamily:C.ff,fontSize:34,fontWeight:900,color:C.ink,letterSpacing:'-0.03em',lineHeight:1.1}}>PontoApp</div>
          <div style={{fontFamily:C.fb,fontSize:14,color:C.inkMid,marginTop:8,fontWeight:400,fontStyle:'italic'}}>Controle de ponto inteligente</div>
        </div>

        <Card style={{boxShadow:dark?'0 8px 40px rgba(0,0,0,.4)':'0 8px 40px rgba(91,76,245,.10)',animation:'fadeUp .4s .1s cubic-bezier(.22,1,.36,1) both'}}>
          <div style={{marginBottom:22}}>
            <div style={{fontFamily:C.ff,fontSize:20,fontWeight:700,color:C.ink,marginBottom:4}}>Acessar empresa</div>
            <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid}}>Digite o código fornecido pelo seu gestor.</div>
          </div>
          <Input label="Código da empresa" value={v} onChange={setV} placeholder="ex: minhaempresa" error={err} autoFocus />
          <button onClick={go} disabled={load} style={{width:'100%',padding:'15px',borderRadius:12,border:'none',background:load?C.border:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:load?C.inkLight:'#fff',fontSize:15,fontWeight:700,fontFamily:C.ff,cursor:load?'wait':'pointer',boxShadow:load?'none':`0 6px 24px ${C.brandGlow}`,letterSpacing:'0.01em',transition:'all .2s'}}>
            {load?'Verificando…':'Entrar →'}
          </button>
        </Card>

        <div style={{textAlign:'center',marginTop:20}}>
          <button onClick={()=>onSelect('__superadmin__')} style={{background:'none',border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:12,color:C.inkXLight}}>Acesso administrativo</button>
        </div>
      </div>
    </div>
  )
}

// ─── SUPER ADMIN SCREEN ───────────────────────────────────────────────────────
function SuperAdminScreen({onLogout}:{onLogout:()=>void}){
  const {dark,toggle,C}=useTheme()
  const [companies,setCompanies]=useState<CompanyMeta[]>([])
  const [view,setView]=useState<'list'|'new'>('list')
  const [form,setForm]=useState({slug:'',name:'',adminUsername:'',adminPassword:''})
  const [errs,setErrs]=useState<Record<string,string>>({})
  const [ok,setOk]=useState('')
  const [now,setNow]=useState(new Date())
  const [copied,setCopied]=useState<string|null>(null)

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[])
  useEffect(()=>{const u=onSnapshot(collection(db,'companies'),s=>{setCompanies(s.docs.map(d=>d.data() as CompanyMeta))});return()=>u()},[])

  const validate=()=>{
    const e:Record<string,string>={}
    if(!form.slug.trim())e.slug='Obrigatório'
    else if(!/^[a-z0-9_-]+$/.test(form.slug))e.slug='Apenas minúsculas, números, - e _'
    else if(companies.find(c=>c.slug===form.slug))e.slug='Código já em uso'
    if(!form.name.trim())e.name='Obrigatório'
    if(!form.adminUsername.trim())e.adminUsername='Obrigatório'
    if(!form.adminPassword.trim())e.adminPassword='Obrigatório'
    return e
  }
  const save=async()=>{
    const e=validate();if(Object.keys(e).length){setErrs(e);return}
    const slug=form.slug.trim()
    await setDoc(doc(db,'companies',slug),{slug,name:form.name.trim(),adminUsername:form.adminUsername.trim(),adminPassword:form.adminPassword,createdAt:new Date().toISOString()})
    await setDoc(doc(db,`companies/${slug}/config`,'company'),{name:form.name.trim(),cnpj:'',address:'',phone:'',email:'',logo:''})
    setOk(`"${form.name}" criada com sucesso!`);setTimeout(()=>setOk(''),4000)
    setForm({slug:'',name:'',adminUsername:'',adminPassword:''});setErrs({});setView('list')
  }
  const del=async(slug:string)=>{if(!window.confirm(`Excluir "${slug}"?`))return;await deleteDoc(doc(db,'companies',slug))}
  const copy=(slug:string)=>{navigator.clipboard.writeText(slug);setCopied(slug);setTimeout(()=>setCopied(null),2000)}

  return (
    <div style={{minHeight:'100vh',background:dark?`linear-gradient(160deg,#1a1f35 0%,${DARK_TOKENS.bg} 40%,#0a0d16 100%)`:`linear-gradient(160deg,${C.goldLt} 0%,#F7F8FC 40%,${C.bg} 100%)`,display:'flex',justifyContent:'center',fontFamily:C.fb,transition:'background .3s'}}>
      <div style={{width:'100%',maxWidth:420,display:'flex',flexDirection:'column'}}>
        {/* Header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'18px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <Chip color={C.gold} bg={C.goldLt}>Master</Chip>
            <div style={{fontFamily:C.ff,fontSize:22,fontWeight:800,color:C.ink,marginTop:4,letterSpacing:'-0.02em'}}>Gestão de Empresas</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:C.brand,background:C.brandLt,borderRadius:10,padding:'6px 14px'}}>{fmtT(now)}</div>
            <button onClick={toggle} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:20,padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid}}><span>{dark?'🌙':'☀️'}</span></button>
            <Btn sm variant="danger" onClick={onLogout}>Sair</Btn>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'18px 16px 32px'}}>
          {ok&&<div style={{background:C.emeraldLt,border:`1px solid ${C.emerald}40`,borderRadius:12,padding:'12px 16px',marginBottom:14,fontFamily:C.fb,fontSize:13,color:C.emerald,fontWeight:600,animation:"fadeUp .3s both"}}>✓ {ok}</div>}

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
            <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid}}>{companies.length} empresa{companies.length!==1?'s':''} cadastrada{companies.length!==1?'s':''}</div>
            <Btn sm onClick={()=>setView(view==='new'?'list':'new')} variant={view==='new'?'ghost':'brand'}>{view==='new'?'← Voltar':'+ Nova empresa'}</Btn>
          </div>

          {view==='new'&&(
            <Card style={{marginBottom:16,border:`1px solid ${C.brand}30`,animation:"fadeUp .4s .1s cubic-bezier(.22,1,.36,1) both"}}>
              <div style={{fontFamily:C.ff,fontSize:18,fontWeight:700,color:C.ink,marginBottom:18}}>Nova empresa</div>
              <Input label="Nome da empresa" value={form.name} onChange={v=>{
                const slug=v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
                setForm(f=>({...f,name:v,slug:f.slug===''||f.slug===form.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')?slug:f.slug}))
              }} placeholder="Ex: Mercado Central LTDA" error={errs.name}/>

              <div style={{marginBottom:16}}>
                <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.brand,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:7}}>🔑 Código de acesso</div>
                <input value={form.slug} onChange={e=>setForm(f=>({...f,slug:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,'')}))}
                  placeholder="ex: mercado-central"
                  style={{width:'100%',background:C.brandLt,border:`1.5px solid ${errs.slug?C.rose:C.brand}30`,borderRadius:10,padding:'13px 16px',color:C.brand,fontSize:17,fontFamily:C.ff,fontWeight:700,outline:'none',letterSpacing:'0.03em'}}
                  onFocus={e=>{e.target.style.borderColor=C.brand}}
                />
                {errs.slug&&<p style={{fontFamily:C.fb,fontSize:11,color:C.rose,margin:'5px 0 0'}}>⚠ {errs.slug}</p>}
                {form.slug&&<p style={{fontFamily:C.fb,fontSize:11,color:C.inkMid,margin:'5px 0 0'}}>Clientes digitarão: <strong style={{color:C.brand}}>{form.slug}</strong></p>}
              </div>

              <Input label="Usuário do admin" value={form.adminUsername} onChange={v=>setForm(f=>({...f,adminUsername:v}))} placeholder="admin" error={errs.adminUsername}/>
              <Input label="Senha do admin" type="password" value={form.adminPassword} onChange={v=>setForm(f=>({...f,adminPassword:v}))} error={errs.adminPassword}/>
              <button onClick={save} style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:'#fff',fontSize:14,fontWeight:700,fontFamily:C.ff,cursor:'pointer',boxShadow:`0 6px 20px ${C.brandGlow}`,letterSpacing:'0.01em'}}>
                Criar empresa →
              </button>
            </Card>
          )}

          {view==='list'&&(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {companies.length===0&&(
                <div style={{textAlign:'center',padding:'60px 0',color:C.inkLight}}>
                  <div style={{fontSize:48,marginBottom:12}}>🏢</div>
                  <div style={{fontFamily:C.ff,fontSize:16,fontWeight:600,color:C.inkMid}}>Nenhuma empresa ainda</div>
                  <div style={{fontFamily:C.fb,fontSize:13,marginTop:6}}>Comece criando a primeira!</div>
                </div>
              )}
              {companies.map(c=>(
                <Card key={c.slug} style={{overflow:'hidden',padding:0}}>
                  {/* Accent bar */}
                  <div style={{height:4,background:`linear-gradient(90deg,${C.brand},${C.emerald})`}}/>
                  <div style={{padding:18}}>
                    <div style={{background:C.brandLt,borderRadius:12,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontFamily:C.fb,fontSize:10,color:C.brand,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Código de acesso</div>
                        <div style={{fontFamily:C.ff,fontSize:22,fontWeight:900,color:C.brand,letterSpacing:'0.03em'}}>{c.slug}</div>
                      </div>
                      <button onClick={()=>copy(c.slug)} style={{background:copied===c.slug?C.emeraldLt:C.surface,border:`1.5px solid ${copied===c.slug?C.emerald:C.border}`,borderRadius:10,padding:'8px 14px',cursor:'pointer',fontFamily:C.fb,fontSize:12,fontWeight:700,color:copied===c.slug?C.emerald:C.inkMid,transition:'all .2s'}}>
                        {copied===c.slug?'✓ Copiado!':'📋 Copiar'}
                      </button>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:C.ink,marginBottom:4}}>{c.name}</div>
                        <div style={{fontFamily:C.fb,fontSize:12,color:C.inkMid}}>Admin: <strong style={{color:C.ink}}>{c.adminUsername}</strong></div>
                        <div style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,marginTop:2}}>Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <Btn sm variant="danger" onClick={()=>del(c.slug)}>Excluir</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SUPER ADMIN LOGIN ────────────────────────────────────────────────────────
function SuperAdminLogin({onLogout}:{onLogout:()=>void}){
  const [u,setU]=useState('');const [p,setP]=useState('');const [err,setErr]=useState('');const [ok,setOk]=useState(false)
  const {dark,C}=useTheme()
  const login=()=>{ if(u===SUPER_ADMIN.username&&p===SUPER_ADMIN.password){setOk(true);setErr('')}else setErr('Credenciais incorretas.') }
  if(ok) return <SuperAdminScreen onLogout={onLogout}/>
  return (
    <div style={{minHeight:'100vh',background:dark?`linear-gradient(160deg,${DARK_TOKENS.bg},#1a0f00 50%)`:`linear-gradient(160deg,${C.goldLt},${C.bg} 50%)`,display:'flex',justifyContent:'center',fontFamily:C.fb}}>
      <div style={{width:'100%',maxWidth:420,display:'flex',flexDirection:'column',justifyContent:'center',padding:'40px 24px'}}>
        <div style={{textAlign:'center',marginBottom:36,animation:"fadeUp .35s cubic-bezier(.22,1,.36,1) both"}}>
          <div style={{fontSize:52,marginBottom:14}}>🛡</div>
          <div style={{fontFamily:C.ff,fontSize:26,fontWeight:800,color:C.ink,letterSpacing:'-0.02em'}}>Acesso Restrito</div>
          <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid,marginTop:4}}>Painel de super administrador</div>
        </div>
        <Card style={{boxShadow:'0 8px 40px rgba(180,83,9,.10)',border:`1px solid ${C.gold}30`,animation:'fadeUp .4s .1s both'}}>
          <Input label="Usuário" value={u} onChange={setU} placeholder="superadmin"/>
          <Input label="Senha" type="password" value={p} onChange={setP} error={err}/>
          <button onClick={login} style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:`linear-gradient(135deg,${C.gold},${C.amber})`,color:'#fff',fontSize:15,fontWeight:700,fontFamily:C.ff,cursor:'pointer',boxShadow:'0 6px 20px rgba(180,83,9,.25)',marginTop:4}}>
            Entrar →
          </button>
        </Card>
        <div style={{textAlign:'center',marginTop:16}}>
          <button onClick={onLogout} style={{background:'none',border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:12,color:C.inkLight}}>← Voltar</button>
        </div>
      </div>
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function PontoApp(){
  const [slug,setSlug]=useState<string|null>(null)
  const [sa,setSa]=useState(false)
  const [dark,setDark]=useState(()=>localStorage.getItem('pontoTheme')==='dark')

  const toggle=()=>{ const next=!dark; setDark(next); localStorage.setItem('pontoTheme',next?'dark':'light') }
  const themeVal={dark,toggle,C:mkTokens(dark)}

  return (
    <ThemeCtx.Provider value={themeVal}>
      {!slug
        ? <CompanySelectScreen onSelect={s=>{ if(s==='__superadmin__'){setSa(true);setSlug('__superadmin__')}else setSlug(s) }}/>
        : sa
          ? <SuperAdminLogin onLogout={()=>{setSlug(null);setSa(false)}}/>
          : <CompanyApp slug={slug} onLogout={()=>setSlug(null)}/>
      }
    </ThemeCtx.Provider>
  )
}

// ─── COMPANY APP ──────────────────────────────────────────────────────────────
function CompanyApp({slug,onLogout}:{slug:string;onLogout:()=>void}){
  const {dark,toggle,C}=useTheme()
  const [now,setNow]=useState(new Date())
  const [meta,setMeta]=useState<CompanyMeta|null>(null)
  const [user,setUser]=useState<User|null>(null)
  const [employees,setEmployees]=useState<Employee[]>([])
  const [records,setRecords]=useState<Record<number,EmpState>>({})
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState('clock')
  const [lu,setLu]=useState('');const [lp,setLp]=useState('');const [le,setLe]=useState('')
  const [av,setAv]=useState('list')
  const [editEmp,setEditEmp]=useState<Employee|null>(null)
  const [form,setForm]=useState<any>({name:'',role:'',username:'',password:'',payType:'day',payValue:'',hoursPerDay:'8',overtimeRate:'50',cpf:'',admission:'',fgts:false})
  const [fErr,setFErr]=useState<Record<string,string>>({})
  const [ok,setOk]=useState('')
  const [dtgt,setDtgt]=useState<number|null>(null)
  const [dform,setDform]=useState({value:'',reason:''})
  const [derr,setDerr]=useState('')
  const [expR,setExpR]=useState<number|null>(null)
  const [rMonth,setRMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
  const [addG,setAddG]=useState(false);const [gtgt,setGtgt]=useState<number|null>(null)
  const [gform,setGform]=useState({value:'',reason:''});const [gerr,setGerr]=useState('')
  const [mapTgt,setMapTgt]=useState<number|null>(null)
  const [mapM,setMapM]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
  const [editDay,setEditDay]=useState<{empId:number;date:string}|null>(null)
  const [editH,setEditH]=useState('');const [editMin,setEditMin]=useState('')
  const [geo,setGeo]=useState<{lat:number;lng:number;radius:number;address:string}|null>(null)
  const [geoF,setGeoF]=useState({address:'',radius:'100'})
  const [geoErr,setGeoErr]=useState('');const [geoOk,setGeoOk]=useState('');const [geoLoad,setGeoLoad]=useState(false)
  const [livePos,setLivePos]=useState<{lat:number;lng:number;dist:number}|null>(null)
  const [blocked,setBlocked]=useState('');const [checking,setChecking]=useState(false)
  const [co,setCo]=useState<Company|null>(null)
  const [coForm,setCoForm]=useState({name:'',cnpj:'',address:'',phone:'',email:'',logo:''})
  const [coSaved,setCoSaved]=useState(false);const [coErr,setCoErr]=useState('')

  const ec=`companies/${slug}/employees`, rc=`companies/${slug}/records`
  const cfg=(id:string)=>doc(db,`companies/${slug}/config`,id)

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[])
  useEffect(()=>{const u=onSnapshot(doc(db,'companies',slug),s=>{if(s.exists())setMeta(s.data() as CompanyMeta)});return()=>u()},[slug])
  useEffect(()=>{const u=onSnapshot(collection(db,ec),s=>{setEmployees(s.docs.map(d=>({...(d.data() as Employee)})));setLoading(false)});return()=>u()},[slug])
  useEffect(()=>{const u=onSnapshot(collection(db,rc),s=>{const r:Record<number,EmpState>={};s.docs.forEach(d=>{const dt=d.data();r[Number(d.id)]={...dt,log:(dt.log||[]).map((e:{type:string;time:string})=>({type:e.type,time:new Date(e.time)})),workStart:dt.workStart?new Date(dt.workStart):null,breakStart:dt.breakStart?new Date(dt.breakStart):null,dailyWork:dt.dailyWork||{},dailyOff:dt.dailyOff||{},dailyNight:dt.dailyNight||{},dailyOvertimeRate:dt.dailyOvertimeRate||{},bankBalance:dt.bankBalance||0} as EmpState});setRecords(r)});return()=>u()},[slug])
  useEffect(()=>{const u=onSnapshot(doc(db,`companies/${slug}/config`,'geofence'),s=>{if(s.exists())setGeo(s.data() as any);else setGeo(null)});return()=>u()},[slug])
  useEffect(()=>{const u=onSnapshot(doc(db,`companies/${slug}/config`,'company'),s=>{if(s.exists()){const d=s.data() as Company;setCo(d);setCoForm({name:d.name||'',cnpj:d.cnpj||'',address:d.address||'',phone:d.phone||'',email:d.email||'',logo:d.logo||''})}});return()=>u()},[slug])

  const gs=(id:number):EmpState=>records[id]||{status:STATUS.OUT,log:[],workStart:null,breakStart:null,totalWork:0,totalBreak:0,days:[],dailyWork:{},dailyOff:{},dailyNight:{},dailyOvertimeRate:{},bankBalance:0}
  const geocode=async(a:string)=>{try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(a)}&limit=1`);const d=await r.json();if(!d.length)return null;return{lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon)}}catch{return null}}
  const dist=(a:number,b:number,c:number,d:number)=>{const R=6371000,dLat=(c-a)*Math.PI/180,dLng=(d-b)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}

  const saveGeo=async()=>{
    setGeoErr('');setGeoOk('');setGeoLoad(true)
    if(!geoF.address.trim()){setGeoErr('Digite um endereço');setGeoLoad(false);return}
    const r=Number(geoF.radius);if(!r||r<10||r>5000){setGeoErr('Raio entre 10 e 5000m');setGeoLoad(false);return}
    const coords=await geocode(geoF.address);if(!coords){setGeoErr('Endereço não encontrado');setGeoLoad(false);return}
    await setDoc(cfg('geofence'),{...coords,radius:r,address:geoF.address})
    setGeoOk(`Cerca ativa — raio de ${r}m`);setGeoLoad(false);setTimeout(()=>setGeoOk(''),4000)
  }

  const punch=(type:string)=>{
    if(!user||user.role!=='employee') return
    setBlocked('');setChecking(true)
    const doReg=async()=>{
      const id=user.id,st=gs(id),ts=new Date(),td=TODAY()
      let s:EmpState={...st,log:[...st.log,{type,time:ts}]}
      if(type==='entrada'){s.status=STATUS.IN;s.workStart=ts}
      else if(type==='saida'){const w=st.workStart?ts.getTime()-st.workStart.getTime():0,n=st.workStart?calcNightMs(st.workStart.getTime(),ts.getTime()):0;s.totalWork=(st.totalWork||0)+w;s.dailyWork={...(st.dailyWork||{})};s.dailyWork[td]=(s.dailyWork[td]||0)+w;s.dailyNight={...(st.dailyNight||{})};s.dailyNight[td]=(s.dailyNight[td]||0)+n;s.status=STATUS.OUT;s.workStart=null;if(!s.days.includes(td))s.days=[...s.days,td]}
      else if(type==='inicio_pausa'){const w=st.workStart?ts.getTime()-st.workStart.getTime():0,n=st.workStart?calcNightMs(st.workStart.getTime(),ts.getTime()):0;s.totalWork=(st.totalWork||0)+w;s.dailyWork={...(st.dailyWork||{})};s.dailyWork[td]=(s.dailyWork[td]||0)+w;s.dailyNight={...(st.dailyNight||{})};s.dailyNight[td]=(s.dailyNight[td]||0)+n;s.status=STATUS.BREAK;s.workStart=null;s.breakStart=ts}
      else if(type==='fim_pausa'){s.totalBreak=(st.totalBreak||0)+(st.breakStart?ts.getTime()-st.breakStart.getTime():0);s.status=STATUS.IN;s.breakStart=null;s.workStart=ts}
      await setDoc(doc(db,rc,String(id)),{...s,log:s.log.map(e=>({type:e.type,time:e.time.toISOString()})),workStart:s.workStart?s.workStart.toISOString():null,breakStart:s.breakStart?s.breakStart.toISOString():null})
      setChecking(false)
    }
    if(!geo){doReg();return}
    navigator.geolocation.getCurrentPosition(
      pos=>{const d=dist(pos.coords.latitude,pos.coords.longitude,geo.lat,geo.lng);if(d<=geo.radius)doReg();else{setChecking(false);setBlocked(`📍 Você está a ${Math.round(d)}m. Máximo: ${geo.radius}m.`);setTimeout(()=>setBlocked(''),6000)}},
      ()=>{setChecking(false);setBlocked('⚠️ Localização não disponível.');setTimeout(()=>setBlocked(''),6000)},
      {enableHighAccuracy:true,timeout:8000}
    )
  }

  const calcPay=(emp:Employee,st:EmpState,lw:number,mf?:string)=>{
    // ── valor hora base ──
    const salMes = emp.payType==='month' ? emp.payValue : 0
    const hv = emp.payType==='hour' ? emp.payValue
             : emp.payType==='day'  ? emp.payValue/emp.hoursPerDay
             : emp.payValue/(emp.hoursPerDay*22) // mensal: ÷ 220h (22 dias úteis × 10h, ou seja ÷ dias*h)
    const hvMes = emp.payType==='month' ? emp.payValue/(emp.hoursPerDay*22) : hv
    const jMs = emp.hoursPerDay*3600000
    const salDia = emp.payType==='month' ? emp.payValue/30
                 : emp.payType==='day'   ? emp.payValue
                 : emp.payValue*emp.hoursPerDay

    // ── horas do período ──
    const allD={...(st.dailyWork||{})}
    if(!mf&&st.status!==STATUS.OUT){const t=TODAY();allD[t]=(allD[t]||0)+(st.workStart?now.getTime()-st.workStart.getTime():0)}
    const fd=mf?Object.fromEntries(Object.entries(allD).filter(([d])=>d.startsWith(mf))):allD
    const fo=mf?Object.fromEntries(Object.entries(st.dailyOff||{}).filter(([d])=>d.startsWith(mf))):(st.dailyOff||{})
    const fn=mf?Object.fromEntries(Object.entries(st.dailyNight||{}).filter(([d])=>d.startsWith(mf))):(st.dailyNight||{})

    // ── calcular horas normais, extras e banco ──
    let regMs=0, otR:Record<number,number>={}, bankCreditMs=0
    Object.entries(fd).forEach(([date,ms])=>{
      const isBankDay=fo[date]==='bank_in'||emp.overtimeToBank
      if(isBankDay){
        // hora extra vai pro banco de horas, não gera pagamento adicional
        bankCreditMs+=Math.max(0,(ms as number)-jMs)
        regMs+=Math.min(ms as number,jMs)
      } else {
        const reg=Math.min(ms as number,jMs), ot=Math.max(0,(ms as number)-jMs)
        regMs+=reg
        if(ot>0){const r=(st.dailyOvertimeRate||{})[date]??(emp.overtimeRate||50);otR[r]=(otR[r]||0)+ot}
      }
    })

    // ── dias trabalhados e ausências ──
    const dw=Object.keys(fd).filter(d=>(fd[d]||0)>0).length+(!mf&&st.status!==STATUS.OUT?1:0)
    const paidAbsDays=Object.entries(fo).filter(([date,absType])=>ABSENCE_CONFIG[absType]?.paga&&!(fd[date]&&(fd[date] as number)>0)).length
    const deductedDays=Object.values(fo).filter(v=>ABSENCE_CONFIG[v]?.descontaDia).length

    // ── DSR proporcional ──
    // Agrupa faltas injustificadas por semana; desconta 1 DSR por semana afetada
    // DSR integra HE habituais: (salDia + mediaHEsemanal) × semanasAfetadas
    let dsrDeduction=0
    if(emp.payType!=='hour'){
      const injustWeeks=new Map<string,number>() // weekKey → total OT ms naquela semana
      Object.entries(fo).forEach(([date,absType])=>{
        if(ABSENCE_CONFIG[absType]?.contaDSR){
          const d=new Date(date+'T12:00:00')
          const ws=new Date(d);ws.setDate(d.getDate()-d.getDay())
          const wk=ws.toISOString().split('T')[0]
          if(!injustWeeks.has(wk)) injustWeeks.set(wk,0)
        }
      })
      // acumula OT por semana para integrar no DSR
      Object.entries(otR).forEach(([,ms])=>{
        // distribui igualmente pelas semanas afetadas (aproximação)
        if(injustWeeks.size>0) injustWeeks.forEach((_,wk)=>injustWeeks.set(wk,(injustWeeks.get(wk)||0)+(ms as number)/injustWeeks.size))
      })
      injustWeeks.forEach((otMs)=>{
        const dsrBase=salDia+(otMs>0?(otMs/3600000)*hvMes*1.5/6:0) // integração HE no DSR
        dsrDeduction+=dsrBase
      })
    }

    // ── desconto de faltas ──
    const absDeduction = emp.payType==='month'
      ? deductedDays*salDia                         // mensal: desconta por dia
      : emp.payType==='day'
        ? deductedDays*emp.payValue
        : deductedDays*emp.hoursPerDay*hv

    // ── totais de horas ──
    const totalMs=mf?Object.values(fd).reduce((a,b)=>a+(b as number),0):lw
    const brkMs=mf?0:(st.totalBreak||0)+(st.breakStart?now.getTime()-st.breakStart.getTime():0)
    const otMs=Object.values(otR).reduce((a,b)=>a+b,0)

    // ── valor bruto ──
    let rv=0, ov=0
    if(emp.payType==='month'){
      // Salário mensal fixo + abono de dias de ausência paga (já inclusos no mês)
      // desconto de faltas é feito em absDeduction
      rv=salMes
    } else if(emp.payType==='hour'){
      rv=((regMs+paidAbsDays*emp.hoursPerDay*3600000)/3600000)*hv
    } else {
      rv=(dw+paidAbsDays)*emp.payValue
    }

    // hora extra
    Object.entries(otR).forEach(([r,ms])=>{ov+=(ms as number)/3600000*hvMes*(1+Number(r)/100)})

    // adicional noturno (20%)
    const nMs=Object.values(fn).reduce((a:number,b)=>a+(b as number),0)
    const nb=(nMs/3600000)*hvMes*0.20

    // FGTS (8% — encargo da empresa, exibido no holerite mas não desconta do líquido)
    const fgtsV = emp.fgts ? (rv+ov+nb)*0.08 : 0

    // Bruto para cálculos fiscais
    const gross=rv+ov+nb

    // ── INSS (desconto do empregado) ──
    const inssV = emp.inss ? calcINSS(gross) : 0

    // ── IRRF (base = bruto - INSS) ──
    const irrfV = emp.irrf ? calcIRRF(gross-inssV) : 0

    // ── descontos manuais e gratificações ──
    const disc=(emp.discounts||[]).reduce((s,d)=>s+d.value,0)
    const grat=(emp.gratifications||[]).reduce((s,g)=>s+g.value,0)

    const autoDeduct=dsrDeduction+absDeduction+inssV+irrfV
    const totalDeductions=disc+autoDeduct

    return{
      totalMs, daysWorked:dw, grossValue:gross,
      regularValue:rv, overtimeValue:ov,
      overtimeMs:otMs, overtimeByRate:otR,
      nightMs:nMs, nightBonus:nb,
      paidAbsDays, deductedDays,
      absDeduction, dsrDeduction,
      inssV, irrfV, fgtsV,
      autoDeductions:autoDeduct,
      manualDiscountTotal:disc, totalDeductions,
      gratificationsTotal:grat,
      net:Math.max(0,gross-totalDeductions)+grat,
      breakMs:brkMs,
      bankCreditMs, bankBalance:st.bankBalance||0,
    }
  }

  const valForm=()=>{const e:Record<string,string>={};if(!form.name.trim())e.name='Obrigatório';if(!form.role.trim())e.role='Obrigatório';if(!form.username.trim())e.username='Obrigatório';else if(employees.find(e=>e.username===form.username&&e.id!==editEmp?.id))e.username='Usuário já existe';if(!editEmp&&!form.password.trim())e.password='Obrigatório';if(!form.payValue||isNaN(Number(form.payValue))||Number(form.payValue)<=0)e.payValue='Valor inválido';return e}

  const saveEmp=async()=>{
    const e=valForm();if(Object.keys(e).length){setFErr(e);return}
    const ini=form.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
    const data={name:form.name,role:form.role,username:form.username,avatar:ini,payType:form.payType as 'month'|'day'|'hour',payValue:Number(form.payValue),hoursPerDay:Number(form.hoursPerDay)||8,overtimeRate:Number(form.overtimeRate) as 50|70|100,cpf:form.cpf||'',admission:form.admission||'',regime:(form.regime||'clt') as 'clt'|'pj'|'avulso',fgts:form.fgts||false,inss:form.inss||false,irrf:form.irrf||false,overtimeToBank:form.overtimeToBank||false,companySlug:slug,...(form.password?{password:form.password}:{})}
    if(editEmp){await setDoc(doc(db,ec,String(editEmp.id)),{...editEmp,...data});setOk('Funcionário atualizado!')}
    else{const id=Date.now();await setDoc(doc(db,ec,String(id)),{id,password:form.password,discounts:[],gratifications:[],...data});setOk('Funcionário cadastrado!')}
    setTimeout(()=>setOk(''),3000)
    setForm({name:'',role:'',username:'',password:'',payType:'month',payValue:'',hoursPerDay:'8',overtimeRate:'50',cpf:'',admission:'',regime:'clt',fgts:true,inss:true,irrf:true,overtimeToBank:false});setFErr({});setEditEmp(null);setAv('list')
  }
  const delEmp=async(id:number)=>{await deleteDoc(doc(db,ec,String(id)));await deleteDoc(doc(db,rc,String(id)))}
  const startEdit=(emp:Employee)=>{setEditEmp(emp);setForm({name:emp.name,role:emp.role,username:emp.username,password:'',payType:emp.payType,payValue:String(emp.payValue),hoursPerDay:String(emp.hoursPerDay),overtimeRate:String(emp.overtimeRate||50),cpf:emp.cpf||'',admission:emp.admission||'',regime:emp.regime||'clt',fgts:emp.fgts||false,inss:emp.inss||false,irrf:emp.irrf||false,overtimeToBank:emp.overtimeToBank||false});setFErr({});setAv('edit')}

  const addDisc=async(eid:number)=>{setDerr('');if(!dform.value||isNaN(Number(dform.value))||Number(dform.value)<=0){setDerr('Valor inválido');return}if(!dform.reason.trim()){setDerr('Informe o motivo');return};const emp=employees.find(e=>e.id===eid);if(!emp)return;const d:Discount={id:Date.now(),value:Number(dform.value),reason:dform.reason.trim(),date:fmtDs(new Date())};await setDoc(doc(db,ec,String(eid)),{...emp,discounts:[...(emp.discounts||[]),d]});setDform({value:'',reason:''});setDtgt(null)}
  const remDisc=async(eid:number,did:number)=>{const emp=employees.find(e=>e.id===eid);if(!emp)return;await setDoc(doc(db,ec,String(eid)),{...emp,discounts:emp.discounts.filter(d=>d.id!==did)})}
  const addGrat=async(eid:number)=>{setGerr('');if(!gform.value||isNaN(Number(gform.value))||Number(gform.value)<=0){setGerr('Valor inválido');return}if(!gform.reason.trim()){setGerr('Informe o motivo');return};const emp=employees.find(e=>e.id===eid);if(!emp)return;const g:Discount={id:Date.now(),value:Number(gform.value),reason:gform.reason.trim(),date:fmtDs(new Date())};await setDoc(doc(db,ec,String(eid)),{...emp,gratifications:[...(emp.gratifications||[]),g]});setGform({value:'',reason:''});setGtgt(null);setAddG(false)}
  const remGrat=async(eid:number,gid:number)=>{const emp=employees.find(e=>e.id===eid);if(!emp)return;await setDoc(doc(db,ec,String(eid)),{...emp,gratifications:(emp.gratifications||[]).filter(g=>g.id!==gid)})}

  const markOff=async(eid:number,date:string,type:AbsenceType|null)=>{
    const st=gs(eid);const off={...(st.dailyOff||{})}
    if(type===null)delete off[date];else off[date]=type
    await setDoc(doc(db,rc,String(eid)),{...st,dailyOff:off,log:st.log.map(e=>({type:e.type,time:e.time.toISOString()})),workStart:st.workStart?st.workStart.toISOString():null,breakStart:st.breakStart?st.breakStart.toISOString():null})
  }

  const useBankHours=async(eid:number,hoursMs:number)=>{
    const st=gs(eid)
    const newBalance=Math.max(0,(st.bankBalance||0)-hoursMs)
    await setDoc(doc(db,rc,String(eid)),{...st,bankBalance:newBalance,log:st.log.map(e=>({type:e.type,time:e.time.toISOString()})),workStart:st.workStart?st.workStart.toISOString():null,breakStart:st.breakStart?st.breakStart.toISOString():null})
  }

  const exportBankHours=()=>{
    // Monta CSV com todos os funcionários e saldo do banco de horas
    const rows=[['Matrícula','Nome','Cargo','Regime','Tipo Pagamento','Salário','Banco de Horas (h)','Banco de Horas (min)','Banco de Horas Formatado']]
    const sorted=[...employees].sort((a,b)=>a.id-b.id)
    sorted.forEach((emp,i)=>{
      const st=gs(emp.id)
      const bank=st.bankBalance||0
      const h=Math.floor(bank/3600000)
      const m=Math.floor((bank%3600000)/60000)
      const mat=String(i+1).padStart(3,'0')
      rows.push([mat,emp.name,emp.role,emp.regime||'clt',emp.payType==='month'?'Mensal':emp.payType==='day'?'Diário':'Horário',String(emp.payValue),String(h),String(m),`${h}h${String(m).padStart(2,'0')}`])
    })
    const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n')
    const bom='\uFEFF' // BOM para Excel reconhecer UTF-8
    const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url
    const mes=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
    a.download=`BancoHoras_${mes.replace(' ','_')}.csv`
    a.click();URL.revokeObjectURL(url)
  }

  const saveHours=async(eid:number,date:string,h:number,m:number,otRate?:number)=>{
    const ms=(h*60+m)*60000,st=gs(eid),oldMs=(st.dailyWork||{})[date]||0,diff=ms-oldMs
    const emp=employees.find(e=>e.id===eid)
    const nDW={...(st.dailyWork||{}),[date]:ms},nTW=Math.max(0,(st.totalWork||0)+diff)
    let nd=[...(st.days||[])];if(ms>0&&!nd.includes(date))nd=[...nd,date];if(ms===0)nd=nd.filter(d=>d!==date)
    const nOT={...(st.dailyOvertimeRate||{})};if(otRate!==undefined)nOT[date]=otRate
    // se funcionário tem banco de horas automático, credita hora extra no banco
    const jMs=(emp?.hoursPerDay||8)*3600000
    const oldOT=Math.max(0,oldMs-jMs), newOT=Math.max(0,ms-jMs)
    const bankDelta=emp?.overtimeToBank?(newOT-oldOT):0
    const newBank=Math.max(0,(st.bankBalance||0)+bankDelta)
    await setDoc(doc(db,rc,String(eid)),{...st,dailyWork:nDW,totalWork:nTW,days:nd,dailyOvertimeRate:nOT,bankBalance:newBank,log:st.log.map(e=>({type:e.type,time:e.time.toISOString()})),workStart:st.workStart?st.workStart.toISOString():null,breakStart:st.breakStart?st.breakStart.toISOString():null})
    setEditDay(null);setEditH('');setEditMin('')
  }

  const genHolerite=async(emp:Employee,_st:EmpState,pay:ReturnType<typeof calcPay>,hm:string)=>{
    if(!(window as any).jspdf){await new Promise<void>((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s)})}
    const{jsPDF}=(window as any).jspdf
    const jd=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
    const W=210, H=297, mg=18, cW=W-mg*2
    let y=0

    // ── helpers ──
    const hex2rgb=(h:string)=>h.match(/\w\w/g)!.map(x=>parseInt(x,16)) as [number,number,number]
    const setFill=(h:string)=>{const[r,g,b]=hex2rgb(h);jd.setFillColor(r,g,b)}
    const setStroke=(h:string,w=0.25)=>{const[r,g,b]=hex2rgb(h);jd.setDrawColor(r,g,b);jd.setLineWidth(w)}
    const setColor=(h:string)=>{const[r,g,b]=hex2rgb(h);jd.setTextColor(r,g,b)}
    const box=(x:number,yy:number,w:number,h:number,fill:string,stroke?:string,r=0)=>{
      setFill(fill);if(stroke){setStroke(stroke,0.3);jd.roundedRect(x,yy,w,h,r,r,'FD')}
      else jd.roundedRect(x,yy,w,h,r,r,'F')
    }
    const line=(x1:number,yy:number,x2:number,col='#E2E8F0',w=0.25)=>{setStroke(col,w);jd.line(x1,yy,x2,yy)}
    const vline=(xx:number,y1:number,y2:number,col='#E2E8F0',w=0.25)=>{setStroke(col,w);jd.line(xx,y1,xx,y2)}
    const txt=(t:string,x:number,yy:number,o:{size?:number;bold?:boolean;italic?:boolean;color?:string;align?:'left'|'right'|'center'|'justify'}={})=>{
      jd.setFontSize(o.size||9)
      jd.setFont('helvetica',o.bold&&o.italic?'bolditalic':o.bold?'bold':o.italic?'italic':'normal')
      setColor(o.color||'#1E293B')
      jd.text(t,x,yy,{align:o.align||'left'})
    }

    // ══════════════════════════════════════════════════════════
    // HEADER — barra escura de topo + bloco empresa/título
    // ══════════════════════════════════════════════════════════
    // Faixa decorativa topo
    box(0,0,W,3,'#1E293B')
    // Fundo header principal
    box(0,3,W,42,'#0F172A')
    // Faixa colorida lateral esquerda
    box(0,3,4,42,'#5B4CF5')

    // Logo da empresa (se houver)
    let logoEndX = mg+8
    if(co?.logo){try{jd.addImage(co.logo,'AUTO',mg+8,8,22,22,'','FAST');logoEndX=mg+8+22+6}catch(_){}}

    // Nome e dados da empresa
    txt(co?.name||'PontoApp', logoEndX, 16, {size:15,bold:true,color:'#F8FAFC'})
    const subInfoY=21
    if(co?.cnpj) txt(`CNPJ: ${co.cnpj}`, logoEndX, subInfoY, {size:7.5,color:'#94A3B8'})
    if(co?.address) txt(co.address, logoEndX, subInfoY+5, {size:7,color:'#64748B'})
    if(co?.phone||co?.email) txt([co?.phone,co?.email].filter(Boolean).join('  ·  '), logoEndX, subInfoY+10, {size:7,color:'#64748B'})

    // Bloco HOLERITE (lado direito)
    const[hY,hM]=hm.split('-').map(Number)
    const mesRef=new Date(hY,hM-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase()
    box(W-mg-52, 8, 52, 28, '#1E3A5F', '#2563EB', 2)
    txt('RECIBO DE PAGAMENTO', W-mg-52+26, 16, {size:6.5,bold:true,color:'#93C5FD',align:'center'})
    txt('DE SALÁRIO', W-mg-52+26, 21, {size:6.5,bold:true,color:'#93C5FD',align:'center'})
    line(W-mg-52+4, 23, W-mg-4, '#2563EB', 0.3)
    txt(mesRef, W-mg-52+26, 29, {size:8,bold:true,color:'#DBEAFE',align:'center'})
    txt(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, W-mg-52+26, 34, {size:6,color:'#64748B',align:'center'})

    y = 52

    // ══════════════════════════════════════════════════════════
    // DADOS DO FUNCIONÁRIO
    // ══════════════════════════════════════════════════════════
    // Cabeçalho da seção
    box(mg, y, cW, 7, '#1E293B', undefined, 1)
    box(mg, y, 3, 7, '#5B4CF5', undefined, 0)
    txt('IDENTIFICAÇÃO DO FUNCIONÁRIO', mg+6, y+4.8, {size:7.5,bold:true,color:'#E2E8F0'})
    y+=10

    // Avatar/Iniciais
    box(mg, y, 14, 14, '#EEF0FD', '#C7D2FE', 2)
    txt(emp.avatar, mg+7, y+9.5, {size:11,bold:true,color:'#5B4CF5',align:'center'})

    // Dados principais
    txt(emp.name, mg+17, y+5.5, {size:12,bold:true,color:'#0F172A'})
    txt(emp.role, mg+17, y+10.5, {size:8.5,color:'#475569',italic:true})

    // Badge matrícula — sequencial por ordem de cadastro
    const sortedIds=[...employees].sort((a,b)=>a.id-b.id).map(e=>e.id)
    const matNum=sortedIds.indexOf(emp.id)+1
    const matRef=String(matNum).padStart(3,"0")
    box(W-mg-34, y+1, 34, 10, '#F1F5F9', '#E2E8F0', 2)
    txt('Matrícula', W-mg-17, y+5, {size:6,color:'#94A3B8',align:'center'})
    txt(matRef, W-mg-17, y+9.5, {size:8,bold:true,color:'#334155',align:'center'})
    y+=18

    // Grade de dados (4 colunas)
    const fields=[
      {l:'CPF',v:emp.cpf||'Não informado'},
      {l:'Data de Admissão',v:emp.admission?new Date(emp.admission+'T12:00:00').toLocaleDateString('pt-BR'):'Não informada'},
      {l:'Tipo de Pagamento',v:emp.payType==='hour'?'Por Hora':'Por Dia'},
      {l:'Salário Base',v:fmt(emp.payValue)+(emp.payType==='hour'?'/hora':'/dia')},
      {l:'Carga Horária',v:`${emp.hoursPerDay}h/dia`},
      {l:'FGTS',v:emp.fgts?'Optante (8%)':'Não optante'},
    ]
    const colW=cW/3, colH=11
    fields.forEach((f,i)=>{
      const col=i%3, row=Math.floor(i/3)
      const fx=mg+col*colW, fy=y+row*(colH+2)
      box(fx, fy, colW-2, colH, col%2===0?'#F8FAFC':'#FFFFFF', '#E8EDF5', 1)
      txt(f.l, fx+3, fy+4.5, {size:6.5,color:'#94A3B8'})
      txt(f.v, fx+3, fy+8.8, {size:8,bold:true,color:'#1E293B'})
    })
    y+=2*(colH+2)+8

    // ══════════════════════════════════════════════════════════
    // RESUMO DE HORAS — mini dashboard
    // ══════════════════════════════════════════════════════════
    box(mg, y, cW, 7, '#F0FDF4', '#BBF7D0', 1)
    box(mg, y, 3, 7, '#059669', undefined, 0)
    txt('RESUMO DE HORAS TRABALHADAS', mg+6, y+4.8, {size:7.5,bold:true,color:'#065F46'})
    y+=10

    const hStats=[
      {l:'Horas Normais', v:fmtH(Math.min(pay.totalMs,(emp.hoursPerDay*3600000*pay.daysWorked))), c:'#059669'},
      {l:'Horas Extras', v:pay.overtimeMs>0?fmtH(pay.overtimeMs):'—', c:pay.overtimeMs>0?'#D97706':'#94A3B8'},
      {l:'Adicional Noturno', v:pay.nightMs>0?fmtH(pay.nightMs):'—', c:pay.nightMs>0?'#7C3AED':'#94A3B8'},
      {l:'Dias Trabalhados', v:`${pay.daysWorked} dias`, c:'#0369A1'},
    ]
    const sW=cW/4
    hStats.forEach((s,i)=>{
      const sx=mg+i*sW
      box(sx, y, sW-2, 16, '#FFFFFF', '#E2E8F0', 1)
      // Ícone colorido no topo do card
      box(sx+sW/2-5, y+1.5, 10, 2, s.c==='#94A3B8'?'#F1F5F9':s.c+'22', undefined, 1)
      txt(s.l, sx+(sW-2)/2, y+7, {size:6,color:'#64748B',align:'center'})
      txt(s.v, sx+(sW-2)/2, y+13, {size:9.5,bold:true,color:s.c,align:'center'})
    })
    y+=20

    // ══════════════════════════════════════════════════════════
    // TABELA DE PROVENTOS
    // ══════════════════════════════════════════════════════════
    box(mg, y, cW, 7, '#F0FDF4', '#BBF7D0', 1)
    box(mg, y, 3, 7, '#059669', undefined, 0)
    txt('PROVENTOS', mg+6, y+4.8, {size:7.5,bold:true,color:'#065F46'})
    txt('REFERÊNCIA', mg+cW*0.55, y+4.8, {size:6.5,bold:true,color:'#64748B'})
    txt('VALOR (R$)', mg+cW-2, y+4.8, {size:6.5,bold:true,color:'#064E3B',align:'right'})
    y+=9

    const earn:[string,string,string][]=[
      ['Salário / Horas Trabalhadas', `${fmtH(pay.totalMs)} · ${pay.daysWorked} dia(s)`, fmt(pay.regularValue)]
    ]
    Object.entries(pay.overtimeByRate).sort(([a],[b])=>Number(a)-Number(b)).forEach(([r,ms])=>{
      const hv=emp.payType==='hour'?emp.payValue:emp.payValue/emp.hoursPerDay
      earn.push([`Hora Extra (+${r}%)`, fmtH(ms as number), fmt((ms as number)/3600000*hv*(1+Number(r)/100))])
    })
    if(pay.nightMs>0) earn.push(['Adicional Noturno (20%)', fmtH(pay.nightMs), fmt(pay.nightBonus)])
    ;(emp.gratifications||[]).forEach(g=>earn.push([`Gratificação — ${g.reason}`, g.date, fmt(g.value)]))

    earn.forEach((row,i)=>{
      box(mg, y, cW, 7.5, i%2===0?'#F8FAFC':'#FFFFFF', undefined, 0)
      line(mg, y, mg+cW, '#E2E8F0')
      txt(row[0], mg+5, y+5, {size:8,color:'#334155'})
      txt(row[1], mg+cW*0.55, y+5, {size:7.5,color:'#64748B'})
      txt(row[2], mg+cW-3, y+5, {size:8,bold:true,color:'#059669',align:'right'})
      y+=7.5
    })
    line(mg, y, mg+cW, '#E2E8F0')

    // Total proventos
    box(mg, y, cW, 9, '#DCFCE7', '#86EFAC', 0)
    txt('TOTAL DE PROVENTOS', mg+5, y+6, {size:8.5,bold:true,color:'#14532D'})
    txt(fmt(pay.grossValue), mg+cW-3, y+6, {size:10,bold:true,color:'#15803D',align:'right'})
    y+=14

    // ══════════════════════════════════════════════════════════
    // TABELA DE DESCONTOS
    // ══════════════════════════════════════════════════════════
    box(mg, y, cW, 7, '#FFF1F2', '#FECDD3', 1)
    box(mg, y, 3, 7, '#E11D48', undefined, 0)
    txt('DESCONTOS', mg+6, y+4.8, {size:7.5,bold:true,color:'#881337'})
    txt('DATA', mg+cW*0.55, y+4.8, {size:6.5,bold:true,color:'#64748B'})
    txt('VALOR (R$)', mg+cW-2, y+4.8, {size:6.5,bold:true,color:'#881337',align:'right'})
    y+=9

    // ── descontos legais automáticos ──
    const ded:[string,string,string][]=[]
    if(pay.absDeduction>0)  ded.push([`Desconto de faltas (${pay.deductedDays} dia(s))`,'Auto',fmt(pay.absDeduction)])
    if(pay.dsrDeduction>0)  ded.push(['Desc. DSR — faltas injustificadas','Auto',fmt(pay.dsrDeduction)])
    if(pay.inssV>0)         ded.push(['INSS — Contrib. Previdenciária','Progressive',fmt(pay.inssV)])
    if(pay.irrfV>0)         ded.push(['IRRF — Imposto de Renda Retido','Tabela 2025',fmt(pay.irrfV)])
    // descontos manuais
    ;(emp.discounts||[]).forEach(d=>ded.push([d.reason,d.date,fmt(d.value)]))

    if(ded.length===0){
      box(mg, y, cW, 9, '#FFF8F8', undefined, 0)
      txt('Nenhum desconto nesta competência.', mg+cW/2, y+6, {size:8,color:'#94A3B8',italic:true,align:'center'})
      y+=9
    } else {
      ded.forEach((row,i)=>{
        box(mg, y, cW, 7.5, i%2===0?'#FFF8F8':'#FFFFFF', undefined, 0)
        line(mg, y, mg+cW, '#FDE8EC')
        txt(row[0], mg+5, y+5, {size:8,color:'#334155'})
        txt(row[1], mg+cW*0.55, y+5, {size:7,color:'#64748B'})
        txt(`- ${row[2]}`, mg+cW-3, y+5, {size:8,bold:true,color:'#E11D48',align:'right'})
        y+=7.5
      })
      line(mg, y, mg+cW, '#FECDD3')
    }

    // FGTS — encargo da empresa (informativo)
    if(pay.fgtsV>0){
      y+=2
      box(mg, y, cW, 8, '#EFF6FF', '#BFDBFE', 1)
      txt('FGTS — Encargo da empresa (8%) — não desconta do líquido', mg+5, y+5.5, {size:7.5,color:'#1D4ED8'})
      txt(fmt(pay.fgtsV), mg+cW-3, y+5.5, {size:8,bold:true,color:'#1D4ED8',align:'right'})
      y+=10
    }

    // Banco de horas
    if(pay.bankBalance>0){
      box(mg, y, cW, 8, '#EEF2FF', '#C7D2FE', 1)
      txt('Banco de Horas acumulado', mg+5, y+5.5, {size:7.5,color:'#4338CA'})
      const bH=Math.floor(pay.bankBalance/3600000),bM=Math.floor((pay.bankBalance%3600000)/60000)
      txt(`${bH}h${String(bM).padStart(2,'0')} disponíveis`, mg+cW-3, y+5.5, {size:8,bold:true,color:'#4338CA',align:'right'})
      y+=10
    }

    // Total descontos
    box(mg, y, cW, 9, '#FFE4E6', '#FECDD3', 0)
    txt('TOTAL DE DESCONTOS', mg+5, y+6, {size:8.5,bold:true,color:'#881337'})
    txt(`- ${fmt(pay.totalDeductions)}`, mg+cW-3, y+6, {size:10,bold:true,color:'#E11D48',align:'right'})
    y+=14

    // ══════════════════════════════════════════════════════════
    // PAINEL LÍQUIDO
    // ══════════════════════════════════════════════════════════
    box(mg, y, cW, 22, '#1E3A5F', undefined, 2)
    box(mg, y, cW*0.55, 22, '#0F2444', undefined, 2)
    box(mg, y, 4, 22, '#5B4CF5', undefined, 0)
    vline(mg+cW*0.55, y+3, y+19, '#2563EB', 0.4)

    txt('VALOR LÍQUIDO A RECEBER', mg+8, y+8, {size:8,bold:true,color:'#93C5FD'})
    txt(fmt(pay.net), mg+8, y+17, {size:16,bold:true,color:'#FFFFFF'})

    const bkX=mg+cW*0.55+5
    txt('Bruto', bkX, y+7, {size:6.5,color:'#94A3B8'})
    txt(fmt(pay.grossValue), bkX+32, y+7, {size:7,bold:true,color:'#BFDBFE',align:'right'})
    txt('Descontos', bkX, y+12, {size:6.5,color:'#94A3B8'})
    txt(`- ${fmt(pay.totalDeductions)}`, bkX+32, y+12, {size:7,bold:true,color:'#FCA5A5',align:'right'})
    line(bkX, y+14.5, mg+cW-4, '#2563EB', 0.3)
    txt('Líquido', bkX, y+18.5, {size:7,bold:true,color:'#BFDBFE'})
    txt(fmt(pay.net), bkX+32, y+18.5, {size:7.5,bold:true,color:'#6EE7B7',align:'right'})
    y+=28

    // ══════════════════════════════════════════════════════════
    // ASSINATURAS
    // ══════════════════════════════════════════════════════════
    box(mg, y, cW, 28, '#F8FAFC', '#E2E8F0', 2)
    txt('DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DESCRITA NESTE RECIBO, REFERENTE À COMPETÊNCIA INDICADA.',
      W/2, y+6, {size:6.5,color:'#64748B',align:'center',italic:true})

    const sigY=y+22, sigW=68
    // Linha empregador
    line(mg+8, sigY, mg+8+sigW, '#334155', 0.4)
    txt(co?.name||'Empregador', mg+8+sigW/2, sigY+4, {size:7,color:'#475569',align:'center'})
    txt('Assinatura do Empregador', mg+8+sigW/2, sigY+8, {size:6,color:'#94A3B8',align:'center'})
    // Linha funcionário
    line(mg+cW-sigW-8, sigY, mg+cW-8, '#334155', 0.4)
    txt(emp.name, mg+cW-sigW/2-8, sigY+4, {size:7,color:'#475569',align:'center'})
    txt('Assinatura do Funcionário', mg+cW-sigW/2-8, sigY+8, {size:6,color:'#94A3B8',align:'center'})
    y+=34

    // ══════════════════════════════════════════════════════════
    // RODAPÉ
    // ══════════════════════════════════════════════════════════
    box(0, H-12, W, 12, '#0F172A')
    box(0, H-12, 4, 12, '#5B4CF5')
    txt('PontoApp — Sistema de Controle de Ponto', mg+6, H-5.5, {size:6.5,color:'#64748B'})
    txt(`Documento gerado em ${new Date().toLocaleString('pt-BR')} · Página 1/1`, W-mg, H-5.5, {size:6,color:'#475569',align:'right'})

    jd.save(`Holerite_${emp.name.replace(/\s+/g,'_')}_${hm}.pdf`)
  }

  // Live
  const est=user?.role==='employee'?gs(user.id):null
  const lw=est?(est.totalWork||0)+(est.workStart?now.getTime()-est.workStart.getTime():0):0
  const lb=est?(est.totalBreak||0)+(est.breakStart?now.getTime()-est.breakStart.getTime():0):0
  const myEmp=user?.role==='employee'?employees.find(e=>e.id===user.id):null
  const myPay=myEmp&&est?calcPay(myEmp,est,lw):null
  const td=TODAY()
  const tdWork=est?((est.dailyWork||{})[td]||0)+(est.workStart?now.getTime()-est.workStart.getTime():0):0

  const handleLogin=()=>{
    setLe('')
    if(meta&&lu===meta.adminUsername&&lp===meta.adminPassword){setUser({id:0,name:'Administrador',username:meta.adminUsername,avatar:'AD',role:'admin',payType:'day',payValue:0,hoursPerDay:8,discounts:[],companySlug:slug});setView('list');return}
    const emp=employees.find(e=>e.username===lu&&e.password===lp)
    if(emp){setUser({...emp,role:'employee'});setView('clock');return}
    setLe('Usuário ou senha incorretos.')
  }
  const logout=()=>{setUser(null);setLu('');setLp('');setLe('')}

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if(loading) return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:44,height:44,border:`3px solid ${C.border}`,borderTopColor:C.brand,borderRadius:'50%',margin:'0 auto 16px',animation:'spin .8s linear infinite'}}/>
        <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid}}>Carregando…</div>
      </div>
    </div>
  )

  // ─── LOGIN ─────────────────────────────────────────────────────────────────
  if(!user) return (
    <div style={{minHeight:'100vh',background:dark?`linear-gradient(160deg,${DARK_TOKENS.bg} 0%,#0d1525 50%,#0a1a0f 100%)`:`linear-gradient(160deg,#EEF0FD 0%,#F7F8FC 50%,#ECFDF5 100%)`,display:'flex',justifyContent:'center',fontFamily:C.fb,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:'8%',right:'-80px',width:320,height:320,borderRadius:'50%',background:`radial-gradient(circle,${C.brand}10,transparent 70%)`,pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:'5%',left:'-60px',width:280,height:280,borderRadius:'50%',background:`radial-gradient(circle,${C.emerald}08,transparent 70%)`,pointerEvents:'none'}}/>
      {/* Theme toggle on login */}
      <button onClick={toggle} style={{position:'absolute',top:20,right:20,zIndex:10,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:50,padding:'7px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:7,fontFamily:C.fb,fontSize:12,fontWeight:700,color:C.inkMid,boxShadow:'0 2px 12px rgba(0,0,0,.12)'}}>
        <span style={{fontSize:15}}>{dark?'🌙':'☀️'}</span><span>{dark?'Escuro':'Claro'}</span>
      </button>
      <div style={{width:'100%',maxWidth:420,display:'flex',flexDirection:'column',justifyContent:'center',padding:'40px 24px',position:'relative',zIndex:1}}>
        <button onClick={onLogout} style={{alignSelf:'flex-start',background:'none',border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:12,color:C.inkLight,marginBottom:36}}>← Trocar empresa</button>
        <div style={{textAlign:'center',marginBottom:36,animation:"fadeUp .35s cubic-bezier(.22,1,.36,1) both"}}>
          {co?.logo?(
            <img src={co.logo} alt="" style={{height:60,maxWidth:180,objectFit:'contain',borderRadius:12,marginBottom:16}}/>
          ):(
            <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:68,height:68,borderRadius:22,background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,boxShadow:`0 8px 32px ${C.brandGlow}`,marginBottom:16,fontSize:30}}>⏱</div>
          )}
          <div style={{fontFamily:C.ff,fontSize:28,fontWeight:900,color:C.ink,letterSpacing:'-0.025em',lineHeight:1.1}}>{co?.name||meta?.name||'PontoApp'}</div>
          <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid,marginTop:6,fontStyle:'italic'}}>Registre seu ponto com segurança</div>
        </div>
        <Card style={{boxShadow:'0 12px 48px rgba(91,76,245,.12)',animation:'fadeUp .4s .1s both'}}>
          <Input label="Usuário" value={lu} onChange={setLu} placeholder="seu.usuario"/>
          <Input label="Senha" type="password" value={lp} onChange={setLp} error={le}/>
          <button onClick={handleLogin} style={{width:'100%',padding:'15px',borderRadius:12,border:'none',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:'#fff',fontSize:15,fontWeight:700,fontFamily:C.ff,cursor:'pointer',boxShadow:`0 6px 24px ${C.brandGlow}`,letterSpacing:'0.01em',marginTop:4}}>
            Entrar →
          </button>
        </Card>
        <p style={{textAlign:'center',marginTop:18,fontFamily:C.fb,fontSize:12,color:C.inkLight,fontStyle:'italic'}}>{fmtD(now)}</p>
      </div>
    </div>
  )

  // ─── EMPLOYEE ──────────────────────────────────────────────────────────────
  if(user.role==='employee'&&est){
    const tabs=[{key:'clock',icon:'⏱',label:'Ponto'},{key:'payment',icon:'💰',label:'Pagamento'},{key:'history',icon:'📋',label:'Histórico'}]

    const punchBtns=[
      {type:'entrada',label:'Entrada',icon:'▶',color:C.emerald,bg:C.emeraldLt,dis:est.status!==STATUS.OUT},
      {type:'inicio_pausa',label:'Pausa',icon:'⏸',color:C.amber,bg:C.amberLt,dis:est.status!==STATUS.IN},
      {type:'fim_pausa',label:'Retornar',icon:'↩',color:C.sky,bg:C.skyLt,dis:est.status!==STATUS.BREAK},
      {type:'saida',label:'Saída',icon:'■',color:C.rose,bg:C.roseLt,dis:est.status===STATUS.OUT},
    ]

    return (
      <div style={{minHeight:'100vh',background:C.bg,display:'flex',justifyContent:'center',fontFamily:C.fb}}>
        <div style={{width:'100%',maxWidth:420,minHeight:'100vh',display:'flex',flexDirection:'column'}}>
          {/* Header */}
          <div style={{background:C.surface,padding:'18px 20px 14px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:42,height:42,borderRadius:14,background:`linear-gradient(135deg,${C.brand}20,${C.brandLt})`,border:`1.5px solid ${C.brand}30`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:C.ff,fontSize:14,fontWeight:800,color:C.brand,flexShrink:0}}>{user.avatar}</div>
                <div>
                  <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:C.ink,lineHeight:1.1}}>{user.name}</div>
                  <Dot status={est.status}/>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button onClick={toggle} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:20,padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid}}><span>{dark?'🌙':'☀️'}</span></button>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:C.ff,fontSize:20,fontWeight:700,color:C.brand,letterSpacing:'-0.02em'}}>{fmtT(now)}</div>
                  <div style={{fontFamily:C.fb,fontSize:10,color:C.inkLight,marginTop:1}}>{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date().getDay()]}, {new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'16px 16px 8px'}}>
            {view==='clock'&&(
              <>
                {/* Stats row */}
                <div style={{display:'flex',gap:8,marginBottom:14}}>
                  <Stat label="Hoje" val={fmtHM(tdWork)} sub={fmtDur(tdWork)} color={C.emerald}/>
                  <Stat label="Pausas" val={fmtHM(lb)} sub={fmtDur(lb)} color={C.amber}/>
                  <Stat label="A receber" val={myPay?fmt(myPay.net):fmt(0)} sub="líquido" color={C.brand}/>
                </div>

                {/* Punch area */}
                <Card style={{marginBottom:14,padding:18}}>
                  {geo&&(
                    <div style={{background:C.skyLt,border:`1px solid ${C.sky}30`,borderRadius:10,padding:'9px 12px',display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                      <span style={{fontSize:14}}>📍</span>
                      <span style={{fontFamily:C.fb,fontSize:12,color:C.sky,fontWeight:500}}>Ponto restrito — raio de {geo.radius}m</span>
                    </div>
                  )}
                  {checking&&<div style={{background:C.brandLt,border:`1px solid ${C.brand}30`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontFamily:C.fb,fontSize:12,color:C.brand,textAlign:'center',animation:'pulse 1s infinite'}}>🔍 Verificando localização…</div>}
                  {blocked&&<div style={{background:C.roseLt,border:`1px solid ${C.rose}30`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontFamily:C.fb,fontSize:12,color:C.rose,fontWeight:500}}>{blocked}</div>}

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {punchBtns.map(({type,label,icon,color,bg,dis})=>(
                      <button key={type} onClick={()=>!dis&&punch(type)} style={{padding:'20px 10px',borderRadius:14,border:`1.5px solid ${dis?C.border:color+'30'}`,cursor:dis?'not-allowed':'pointer',background:dis?C.bg:bg,color:dis?C.inkXLight:color,display:'flex',flexDirection:'column',alignItems:'center',gap:8,transition:'transform .1s,box-shadow .2s',boxShadow:dis?'none':`0 4px 16px ${color}20`}}>
                        <span style={{fontSize:22,lineHeight:1,filter:dis?'grayscale(1) opacity(0.3)':'none'}}>{icon}</span>
                        <span style={{fontFamily:C.ff,fontSize:14,fontWeight:700,letterSpacing:'-0.01em'}}>{label}</span>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Recent */}
                {Object.keys(est.dailyWork||{}).length>0&&(
                  <Card pad={16}>
                    <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkLight,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12}}>Últimos dias</div>
                    {Object.entries(est.dailyWork).sort(([a],[b])=>b.localeCompare(a)).slice(0,5).map(([date,ms])=>{
                      const[,mo,d]=date.split('-');const dow=fmtDow(date)
                      return (
                        <div key={date} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${C.border}`}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,width:28,textTransform:'capitalize'}}>{dow}</span>
                            <span style={{fontFamily:C.fb,fontSize:13,color:C.inkMid}}>{d}/{mo}</span>
                          </div>
                          <span style={{fontFamily:C.ff,fontSize:15,fontWeight:700,color:C.emerald}}>{fmtHM(ms as number)}</span>
                        </div>
                      )
                    })}
                  </Card>
                )}
              </>
            )}

            {view==='payment'&&myPay&&myEmp&&(
              <>
                <Card style={{marginBottom:12,textAlign:'center',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,border:'none',boxShadow:`0 8px 32px ${C.brandGlow}`}}>
                  <div style={{fontFamily:C.fb,fontSize:11,color:'rgba(255,255,255,.7)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,fontWeight:600}}>Valor líquido</div>
                  <div style={{fontFamily:C.ff,fontSize:42,fontWeight:900,color:'#fff',letterSpacing:'-0.03em'}}>{fmt(myPay.net)}</div>
                </Card>
                {[
                  {label:'⏱ Horas trabalhadas',val:fmtH(myPay.totalMs),sub:fmtDur(myPay.totalMs),c:C.emerald},
                  {label:'☕ Em pausas',val:fmtH(myPay.breakMs),sub:fmtDur(myPay.breakMs),c:C.amber},
                  {label:'📅 Dias trabalhados',val:myPay.daysWorked+' dia(s)',sub:'',c:C.sky},
                  {label:'💵 Bruto',val:fmt(myPay.grossValue),sub:'',c:C.brand},
                  ...(myPay.nightMs>0?[{label:'🌙 Noturno',val:fmt(myPay.nightBonus),sub:'+20%',c:'#7C3AED'}]:[]),
                  ...(myPay.dsrDeduction>0?[{label:'📉 Desc. DSR',val:'- '+fmt(myPay.dsrDeduction),sub:'faltas injustif.',c:C.rose}]:[]),
                  ...(myPay.absDeduction>0?[{label:'📉 Faltas',val:'- '+fmt(myPay.absDeduction),sub:myPay.deductedDays+' dia(s)',c:C.rose}]:[]),
                  ...(myPay.inssV>0?[{label:'🏛 INSS',val:'- '+fmt(myPay.inssV),sub:'previdência',c:C.rose}]:[]),
                  ...(myPay.irrfV>0?[{label:'📊 IRRF',val:'- '+fmt(myPay.irrfV),sub:'imp. de renda',c:C.rose}]:[]),
                  ...(myPay.bankBalance>0?[{label:'🏦 Banco hrs',val:fmtHM(myPay.bankBalance),sub:'disponível',c:'#6366F1'}]:[]),
                ].map(({label,val,sub,c})=>(
                  <Card key={label} style={{padding:'14px 18px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid}}>{label}</div>
                      {sub&&<div style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,marginTop:2}}>{sub}</div>}
                    </div>
                    <div style={{fontFamily:C.ff,fontSize:15,fontWeight:700,color:c}}>{val}</div>
                  </Card>
                ))}
              </>
            )}

            {view==='history'&&(
              <div>
                <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkLight,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:14}}>Histórico de registros</div>
                {est.log.length===0?(
                  <div style={{textAlign:'center',padding:'60px 0',color:C.inkLight}}>
                    <div style={{fontSize:40,marginBottom:12}}>📋</div>
                    <div style={{fontFamily:C.ff,fontSize:15,color:C.inkMid}}>Nenhum registro ainda</div>
                  </div>
                ):(
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {[...est.log].reverse().map((entry,i)=>(
                      <div key={i} style={{background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,borderLeft:`4px solid ${tColor[entry.type]}`,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <div style={{fontFamily:C.ff,fontSize:14,fontWeight:600,color:C.ink}}>{tLabel[entry.type]}</div>
                          <div style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,marginTop:2}}>{fmtDs(entry.time)}</div>
                        </div>
                        <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:tColor[entry.type]}}>{fmtT(entry.time)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <NavBar tabs={tabs} active={view} onSelect={setView}/>
        </div>
      </div>
    )
  }

  // ─── ADMIN ─────────────────────────────────────────────────────────────────
  const aTabs=[{key:'list',icon:'👥',label:'Equipe'},{key:'reports',icon:'💰',label:'Pagamentos'},{key:'monthly',icon:'📅',label:'Calendário'},{key:'geofence',icon:'📍',label:'Local'},{key:'empresa',icon:'🏢',label:'Empresa'}]

  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',justifyContent:'center',fontFamily:C.fb}}>
      <div style={{width:'100%',maxWidth:420,minHeight:'100vh',display:'flex',flexDirection:'column'}}>
        {/* Admin header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'16px 20px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {co?.logo?<img src={co.logo} alt="" style={{height:28,maxWidth:90,objectFit:'contain',borderRadius:6}}/>:<div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>⏱</div>}
            <div>
              <div style={{fontFamily:C.ff,fontSize:14,fontWeight:700,color:C.ink,lineHeight:1.2}}>{co?.name||meta?.name||'Empresa'}</div>
              <Chip color={C.brand} bg={C.brandLt}>Admin</Chip>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={toggle} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:20,padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid}}><span>{dark?'🌙':'☀️'}</span></button>
            <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:C.brand,background:C.brandLt,borderRadius:10,padding:'5px 12px'}}>{fmtT(now)}</div>
            <Btn sm variant="ghost" onClick={logout}>Sair</Btn>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'16px 16px 8px'}}>

          {/* ── EQUIPE ── */}
          {view==='list'&&(
            <>
              {ok&&<div style={{background:C.emeraldLt,border:`1px solid ${C.emerald}40`,borderRadius:12,padding:'12px 16px',marginBottom:14,fontFamily:C.fb,fontSize:13,color:C.emerald,fontWeight:600,animation:"fadeUp .3s both"}}>✓ {ok}</div>}

              {av==='list'&&(
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                    <div>
                      <div style={{fontFamily:C.ff,fontSize:20,fontWeight:700,color:C.ink,letterSpacing:'-0.02em'}}>Equipe</div>
                      <div style={{fontFamily:C.fb,fontSize:12,color:C.inkMid,marginTop:2}}>{employees.length} funcionário{employees.length!==1?'s':''}</div>
                    </div>
                    <Btn sm onClick={()=>{setForm({name:'',role:'',username:'',password:'',payType:'month',payValue:'',hoursPerDay:'8',overtimeRate:'50',cpf:'',admission:'',regime:'clt',fgts:true,inss:true,irrf:true,overtimeToBank:false});setFErr({});setEditEmp(null);setAv('new')}}>+ Novo</Btn>
                  </div>

                  {employees.length===0&&(
                    <div style={{textAlign:'center',padding:'60px 0',color:C.inkLight}}>
                      <div style={{fontSize:40,marginBottom:12}}>👤</div>
                      <div style={{fontFamily:C.ff,fontSize:15,color:C.inkMid}}>Nenhum funcionário ainda</div>
                      <div style={{fontFamily:C.fb,fontSize:13,color:C.inkLight,marginTop:4}}>Adicione o primeiro!</div>
                    </div>
                  )}

                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {employees.map(emp=>{
                      const st=gs(emp.id),tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0),pay=calcPay(emp,st,tw)
                      return (
                        <Card key={emp.id} style={{padding:0,overflow:'hidden'}}>
                          <div style={{height:3,background:st.status===STATUS.IN?`linear-gradient(90deg,${C.emerald},${C.emerald}60)`:st.status===STATUS.BREAK?`linear-gradient(90deg,${C.amber},${C.amber}60)`:`linear-gradient(90deg,${C.border},${C.border})`}}/>
                          <div style={{padding:16}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                              <div style={{display:'flex',alignItems:'center',gap:12}}>
                                <div style={{width:42,height:42,borderRadius:13,background:`linear-gradient(135deg,${C.brand}15,${C.brandLt})`,border:`1.5px solid ${C.brand}20`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:C.ff,fontSize:14,fontWeight:800,color:C.brand,flexShrink:0}}>{emp.avatar}</div>
                                <div>
                                  <div style={{fontFamily:C.ff,fontSize:14,fontWeight:700,color:C.ink,lineHeight:1.2}}>{emp.name}</div>
                                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}><Dot status={st.status}/></div>
                                </div>
                              </div>
                              <div style={{display:'flex',gap:6}}>
                                <button onClick={()=>startEdit(emp)} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>✏️</button>
                                <button onClick={()=>delEmp(emp.id)} style={{background:C.roseLt,border:`1px solid ${C.rose}30`,borderRadius:8,width:32,height:32,cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>🗑</button>
                              </div>
                            </div>
                            <div style={{display:'flex',gap:8}}>
                              <Stat label="Horas" val={fmtH(tw)} color={C.emerald}/>
                              <Stat label="Descontos" val={(emp.discounts||[]).length>0?'- '+fmt((emp.discounts||[]).reduce((s,d)=>s+d.value,0)):'—'} color={(emp.discounts||[]).length>0?C.rose:C.inkXLight}/>
                              <Stat label="A receber" val={fmt(pay.net)} color={C.brand}/>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </>
              )}

              {(av==='new'||av==='edit')&&(
                <Card>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <div style={{fontFamily:C.ff,fontSize:18,fontWeight:700,color:C.ink}}>{av==='new'?'Novo funcionário':'Editar funcionário'}</div>
                    <Btn sm variant="ghost" onClick={()=>{setAv('list');setFErr({})}}>← Voltar</Btn>
                  </div>
                  <Input label="Nome completo" value={form.name} onChange={v=>setForm((f:any)=>({...f,name:v}))} placeholder="Ex: João da Silva" error={fErr.name}/>
                  <Input label="Cargo" value={form.role} onChange={v=>setForm((f:any)=>({...f,role:v}))} placeholder="Ex: Operador" error={fErr.role}/>
                  <Input label="Usuário (login)" value={form.username} onChange={v=>setForm((f:any)=>({...f,username:v}))} placeholder="Ex: joao.silva" error={fErr.username}/>
                  <Input label={av==='edit'?'Nova senha (em branco = manter)':'Senha'} type="password" value={form.password} onChange={v=>setForm((f:any)=>({...f,password:v}))} error={fErr.password}/>

                  <div style={{marginBottom:16}}>
                    <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Tipo de pagamento</div>
                    <div style={{display:'flex',background:C.bg,borderRadius:10,padding:3,gap:3}}>
                      {[['month','📆 Mensal'],['day','📅 Por dia'],['hour','⏱ Por hora']].map(([k,l])=>(
                        <button key={k} onClick={()=>setForm((f:any)=>({...f,payType:k}))} style={{flex:1,padding:'10px 0',borderRadius:8,border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:13,fontWeight:600,background:form.payType===k?C.surface:C.bg,color:form.payType===k?C.brand:C.inkLight,boxShadow:form.payType===k?'0 1px 4px rgba(15,23,42,.08)':'none',transition:'all .2s'}}>{l}</button>
                      ))}
                    </div>
                  </div>

                  <Input label={form.payType==='month'?'Salário mensal (R$)':form.payType==='day'?'Valor por dia (R$)':'Valor por hora (R$)'} type="number" value={form.payValue} onChange={v=>setForm((f:any)=>({...f,payValue:v}))} placeholder={form.payType==='month'?'2500.00':form.payType==='day'?'120.00':'15.00'} error={fErr.payValue}/>
                  <Input label="Horas por dia" type="number" value={form.hoursPerDay} onChange={v=>setForm((f:any)=>({...f,hoursPerDay:v}))} placeholder="8"/>

                  <div style={{marginBottom:16}}>
                    <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Hora extra padrão</div>
                    <div style={{display:'flex',background:C.bg,borderRadius:10,padding:3,gap:3,marginBottom:10}}>
                      {['50','70','100'].map(r=>(
                        <button key={r} onClick={()=>setForm((f:any)=>({...f,overtimeRate:r}))} style={{flex:1,padding:'10px 0',borderRadius:8,border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:13,fontWeight:700,background:form.overtimeRate===r?C.amber:C.bg,color:form.overtimeRate===r?'#fff':C.inkLight,transition:'all .2s'}}>+{r}%</button>
                      ))}
                    </div>
                    {/* Banco de horas automático */}
                    <div onClick={()=>setForm((f:any)=>({...f,overtimeToBank:!f.overtimeToBank}))}
                      style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:form.overtimeToBank?'#EEF2FF':C.bg,borderRadius:10,border:`1.5px solid ${form.overtimeToBank?'#6366F1':C.border}`,cursor:'pointer',transition:'all .2s'}}>
                      <div style={{width:20,height:20,borderRadius:6,background:form.overtimeToBank?'#6366F1':C.surface,border:`2px solid ${form.overtimeToBank?'#6366F1':C.borderMid}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .2s'}}>
                        {form.overtimeToBank&&<span style={{color:'#fff',fontSize:13,lineHeight:1}}>✓</span>}
                      </div>
                      <div>
                        <div style={{fontFamily:C.fb,fontSize:13,fontWeight:600,color:form.overtimeToBank?'#4338CA':C.inkMid}}>🏦 Horas extras vão para o banco</div>
                        <div style={{fontFamily:C.fb,fontSize:11,color:form.overtimeToBank?'#6366F1':C.inkLight,marginTop:1}}>Não gera pagamento adicional — acumula saldo para folgas futuras</div>
                      </div>
                    </div>
                  </div>

                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,marginBottom:16}}>
                    <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkLight,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12}}>Dados para holerite</div>
                    <Input label="CPF" value={form.cpf||''} onChange={v=>setForm((f:any)=>({...f,cpf:v}))} placeholder="000.000.000-00"/>
                    <Input label="Data de admissão" type="date" value={form.admission||''} onChange={v=>setForm((f:any)=>({...f,admission:v}))}/>
                    {/* Regime de contratação */}
                    <div style={{marginBottom:14}}>
                      <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Regime de contratação</div>
                      <div style={{display:'flex',background:C.bg,borderRadius:10,padding:3,gap:3}}>
                        {[['clt','🏢 CLT'],['pj','💼 PJ'],['avulso','👷 Avulso']].map(([k,l])=>(
                          <button key={k} onClick={()=>setForm((f:any)=>({...f,regime:k,...(k==='clt'?{inss:true,irrf:true,fgts:true}:{inss:false,irrf:false,fgts:false})}))} style={{flex:1,padding:'9px 0',borderRadius:8,border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:12,fontWeight:600,background:(form.regime||'clt')===k?C.surface:C.bg,color:(form.regime||'clt')===k?C.brand:C.inkLight,boxShadow:(form.regime||'clt')===k?'0 1px 4px rgba(15,23,42,.08)':'none',transition:'all .2s'}}>{l}</button>
                        ))}
                      </div>
                    </div>

                    {/* Checkboxes legais */}
                    {[
                      {id:'fgts',label:'FGTS (8% — encargo empresa)',field:'fgts'},
                      {id:'inss',label:'INSS (desconto progressivo empregado)',field:'inss'},
                      {id:'irrf',label:'IRRF (desconto imposto de renda)',field:'irrf'},
                    ].map(({id,label,field})=>(
                      <div key={id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',background:C.bg,borderRadius:10,marginBottom:8,border:`1px solid ${C.border}`}}>
                        <input type="checkbox" id={id} checked={(form as any)[field]||false} onChange={e=>setForm((f:any)=>({...f,[field]:e.target.checked}))} style={{width:18,height:18,accentColor:C.brand,cursor:'pointer'}}/>
                        <label htmlFor={id} style={{fontFamily:C.fb,fontSize:13,color:C.inkMid,cursor:'pointer'}}>{label}</label>
                      </div>
                    ))}
                    <div style={{height:6}}/>
                  </div>
                  <Btn full onClick={saveEmp}>{av==='new'?'Cadastrar funcionário':'Salvar alterações'}</Btn>
                </Card>
              )}
            </>
          )}

          {/* ── PAGAMENTOS ── */}
          {view==='reports'&&(
            <div>
              {/* Month picker */}
              <Card style={{padding:'13px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:20}}>📅</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:C.fb,fontSize:10,fontWeight:700,color:C.inkLight,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>Competência</div>
                  <input type="month" value={rMonth} onChange={e=>{setRMonth(e.target.value);setExpR(null)}}
                    style={{background:'transparent',border:'none',color:C.ink,fontSize:16,fontWeight:700,fontFamily:C.ff,outline:'none',cursor:'pointer'}}/>
                </div>
                <button onClick={()=>{const d=new Date();setRMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setExpR(null)}}
                  style={{background:C.brandLt,border:`1px solid ${C.brand}30`,borderRadius:8,padding:'6px 12px',cursor:'pointer',fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.brand}}>
                  Atual
                </button>
              </Card>

              {/* Total */}
              <Card style={{padding:22,marginBottom:14,textAlign:'center',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,border:'none',boxShadow:`0 8px 32px ${C.brandGlow}`}}>
                <div style={{fontFamily:C.fb,fontSize:11,color:'rgba(255,255,255,.65)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,fontWeight:600}}>
                  Total a pagar · {new Date(rMonth+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
                </div>
                <div style={{fontFamily:C.ff,fontSize:38,fontWeight:900,color:'#fff',letterSpacing:'-0.03em'}}>
                  {fmt(employees.reduce((sum,emp)=>{const st=gs(emp.id);const tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0);return sum+calcPay(emp,st,tw,rMonth).net},0))}
                </div>
                <div style={{fontFamily:C.fb,fontSize:12,color:'rgba(255,255,255,.5)',marginTop:4}}>{employees.length} funcionário(s)</div>
              </Card>

              {employees.map(emp=>{
                const st=gs(emp.id),tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0),pay=calcPay(emp,st,tw,rMonth)
                const isOpen=expR===emp.id,isAddD=dtgt===emp.id,isAddG=gtgt===emp.id&&addG
                return (
                  <Card key={emp.id} style={{marginBottom:10,padding:0,overflow:'hidden'}}>
                    <div style={{padding:16}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:11}}>
                          <div style={{width:38,height:38,borderRadius:12,background:C.brandLt,border:`1.5px solid ${C.brand}20`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:C.ff,fontSize:13,fontWeight:800,color:C.brand,flexShrink:0}}>{emp.avatar}</div>
                          <div>
                            <div style={{fontFamily:C.ff,fontSize:14,fontWeight:700,color:C.ink}}>{emp.name}</div>
                            <div style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,display:'flex',alignItems:'center',gap:5}}><span>{emp.payType==='month'?fmt(emp.payValue)+'/mês':emp.payType==='hour'?fmt(emp.payValue)+'/h':fmt(emp.payValue)+'/dia'}{emp.regime&&emp.regime!=='clt'?' · '+emp.regime.toUpperCase():''}</span>{emp.overtimeToBank&&<span style={{background:'#EEF2FF',color:'#4338CA',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:20}}>🏦 Banco HE</span>}</div>
                          </div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontFamily:C.ff,fontSize:18,fontWeight:800,color:C.emerald}}>{fmt(pay.net)}</div>
                          <button onClick={()=>setExpR(isOpen?null:emp.id)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.brand,padding:'2px 0'}}>
                            {isOpen?'fechar ▲':'detalhes ▼'}
                          </button>
                        </div>
                      </div>

                      {isOpen&&(
                        <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
                          {/* Key stats */}
                          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
                            {/* Proventos */}
                            <div style={{fontFamily:C.fb,fontSize:10,fontWeight:700,color:C.emerald,textTransform:'uppercase',letterSpacing:'0.08em',padding:'4px 0 2px'}}>Proventos</div>
                            {[
                              {label:'⏱ Horas trabalhadas',val:fmtH(pay.totalMs),c:C.emerald},
                              {label:'📅 Dias trabalhados',val:pay.daysWorked+' dia(s)',c:C.sky},
                              {label:'💵 Salário '+(emp.payType==='month'?'mensal':emp.payType==='day'?'por dia':'por hora'),val:fmt(pay.regularValue),c:C.brand},
                              ...(pay.overtimeMs>0?[{label:'⚡ Hora extra ('+fmtH(pay.overtimeMs)+')',val:fmt(pay.overtimeValue),c:C.amber}]:[]),
                              ...(pay.nightMs>0?[{label:'🌙 Adicional noturno 20%',val:fmt(pay.nightBonus),c:'#7C3AED'}]:[]),
                              {label:'💰 Total bruto',val:fmt(pay.grossValue),c:C.brand},
                            ].map(({label,val,c})=>(
                              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:C.bg,borderRadius:9}}>
                                <span style={{fontFamily:C.fb,fontSize:12,color:C.inkMid}}>{label}</span>
                                <span style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:c}}>{val}</span>
                              </div>
                            ))}
                            {/* Descontos legais */}
                            <div style={{fontFamily:C.fb,fontSize:10,fontWeight:700,color:C.rose,textTransform:'uppercase',letterSpacing:'0.08em',padding:'8px 0 2px'}}>Descontos legais</div>
                            {[
                              ...(pay.inssV>0?[{label:'🏛 INSS (empregado)',val:'- '+fmt(pay.inssV),c:C.rose}]:[]),
                              ...(pay.irrfV>0?[{label:'📊 IRRF',val:'- '+fmt(pay.irrfV),c:C.rose}]:[]),
                              ...(pay.fgtsV>0?[{label:'🏦 FGTS 8% (encargo empresa)',val:fmt(pay.fgtsV),c:'#0891B2'}]:[]),
                              ...(pay.dsrDeduction>0?[{label:'📉 Desconto DSR',val:'- '+fmt(pay.dsrDeduction),c:C.rose}]:[]),
                              ...(pay.absDeduction>0?[{label:'📉 Desconto faltas ('+pay.deductedDays+' dia(s))',val:'- '+fmt(pay.absDeduction),c:C.rose}]:[]),
                              ...(pay.bankBalance>0?[{label:'🏦 Banco de horas acumulado',val:fmtHM(pay.bankBalance),c:'#6366F1'}]:[]),
                            ].map(({label,val,c})=>(
                              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:C.bg,borderRadius:9}}>
                                <span style={{fontFamily:C.fb,fontSize:12,color:C.inkMid}}>{label}</span>
                                <span style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:c}}>{val}</span>
                              </div>
                            ))}
                          </div>

                          {/* Descontos */}
                          <div style={{background:C.roseLt,borderRadius:12,padding:14,marginBottom:10,border:`1px solid ${C.rose}20`}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                              <span style={{fontFamily:C.fb,fontSize:12,fontWeight:700,color:C.rose}}>Descontos</span>
                              <button onClick={()=>{setDtgt(isAddD?null:emp.id);setDform({value:'',reason:''});setDerr('')}}
                                style={{background:C.surface,border:`1px solid ${C.rose}30`,borderRadius:8,padding:'4px 10px',cursor:'pointer',fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.rose}}>
                                {isAddD?'✕ Cancelar':'+ Desconto'}
                              </button>
                            </div>
                            {isAddD&&(
                              <div style={{background:C.surface,borderRadius:10,padding:14,marginBottom:10,border:`1px solid ${C.border}`}}>
                                <Input label="Valor (R$)" type="number" value={dform.value} onChange={v=>setDform(f=>({...f,value:v}))} placeholder="50.00" error={derr}/>
                                <div style={{marginBottom:12}}>
                                  <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:7}}>Motivo</div>
                                  <textarea value={dform.reason} onChange={e=>setDform(f=>({...f,reason:e.target.value}))} placeholder="Ex: Falta não justificada…" rows={2}
                                    style={{width:'100%',background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,padding:'10px 14px',color:C.ink,fontSize:13,fontFamily:C.fb,outline:'none',resize:'none'}}/>
                                </div>
                                <Btn full variant="danger" onClick={()=>addDisc(emp.id)}>Confirmar desconto</Btn>
                              </div>
                            )}
                            {(emp.discounts||[]).length===0&&!isAddD&&<div style={{fontFamily:C.fb,fontSize:12,color:C.inkLight,textAlign:'center',padding:'4px 0'}}>Nenhum desconto</div>}
                            {(emp.discounts||[]).map(d=>(
                              <div key={d.id} style={{background:C.surface,borderRadius:9,padding:'9px 12px',marginBottom:6,borderLeft:`3px solid ${C.rose}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                                <div style={{flex:1}}>
                                  <div style={{fontFamily:C.fb,fontSize:12,fontWeight:600,color:C.rose}}>{d.reason}</div>
                                  <div style={{fontFamily:C.fb,fontSize:10,color:C.inkLight,marginTop:1}}>{d.date}</div>
                                </div>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:C.rose}}>-{fmt(d.value)}</span>
                                  <button onClick={()=>remDisc(emp.id,d.id)} style={{background:C.roseLt,border:`1px solid ${C.rose}30`,borderRadius:6,padding:'3px 7px',cursor:'pointer',fontSize:11,color:C.rose}}>🗑</button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Gratificações */}
                          <div style={{background:C.emeraldLt,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${C.emerald}20`}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                              <span style={{fontFamily:C.fb,fontSize:12,fontWeight:700,color:C.emerald}}>Gratificações</span>
                              <button onClick={()=>{setGtgt(isAddG?null:emp.id);setAddG(!isAddG);setGform({value:'',reason:''});setGerr('')}}
                                style={{background:C.surface,border:`1px solid ${C.emerald}30`,borderRadius:8,padding:'4px 10px',cursor:'pointer',fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.emerald}}>
                                {isAddG?'✕ Cancelar':'+ Gratificação'}
                              </button>
                            </div>
                            {isAddG&&(
                              <div style={{background:C.surface,borderRadius:10,padding:14,marginBottom:10,border:`1px solid ${C.border}`}}>
                                <Input label="Valor (R$)" type="number" value={gform.value} onChange={v=>setGform(f=>({...f,value:v}))} placeholder="100.00" error={gerr}/>
                                <div style={{marginBottom:12}}>
                                  <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:7}}>Motivo</div>
                                  <textarea value={gform.reason} onChange={e=>setGform(f=>({...f,reason:e.target.value}))} placeholder="Ex: Bom desempenho…" rows={2}
                                    style={{width:'100%',background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,padding:'10px 14px',color:C.ink,fontSize:13,fontFamily:C.fb,outline:'none',resize:'none'}}/>
                                </div>
                                <Btn full variant="success" onClick={()=>addGrat(emp.id)}>Confirmar gratificação</Btn>
                              </div>
                            )}
                            {(emp.gratifications||[]).length===0&&!isAddG&&<div style={{fontFamily:C.fb,fontSize:12,color:C.inkLight,textAlign:'center',padding:'4px 0'}}>Nenhuma gratificação</div>}
                            {(emp.gratifications||[]).map(g=>(
                              <div key={g.id} style={{background:C.surface,borderRadius:9,padding:'9px 12px',marginBottom:6,borderLeft:`3px solid ${C.emerald}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                                <div style={{flex:1}}>
                                  <div style={{fontFamily:C.fb,fontSize:12,fontWeight:600,color:C.emerald}}>{g.reason}</div>
                                  <div style={{fontFamily:C.fb,fontSize:10,color:C.inkLight,marginTop:1}}>{g.date}</div>
                                </div>
                                <div style={{display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:C.emerald}}>+{fmt(g.value)}</span>
                                  <button onClick={()=>remGrat(emp.id,g.id)} style={{background:C.emeraldLt,border:`1px solid ${C.emerald}30`,borderRadius:6,padding:'3px 7px',cursor:'pointer',fontSize:11,color:C.emerald}}>🗑</button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button onClick={()=>genHolerite(emp,gs(emp.id),pay,rMonth)} style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:'#fff',fontSize:13,fontWeight:700,fontFamily:C.ff,cursor:'pointer',boxShadow:`0 6px 20px ${C.brandGlow}`,letterSpacing:'0.01em'}}>
                            📄 Baixar Holerite · {new Date(rMonth+'-02').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* ── CALENDÁRIO ── */}
          {view==='monthly'&&(
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16}}>
                <input type="month" value={mapM} onChange={e=>setMapM(e.target.value)}
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',color:C.ink,fontSize:13,fontFamily:C.ff,fontWeight:700,outline:'none'}}/>
                <select value={mapTgt??''} onChange={e=>setMapTgt(e.target.value?Number(e.target.value):null)}
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',color:C.ink,fontSize:13,fontFamily:C.fb,outline:'none'}}>
                  <option value="">Todos</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Export banco de horas */}
              <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
                <button onClick={exportBankHours} style={{display:'flex',alignItems:'center',gap:7,background:'#EEF2FF',border:'1px solid #6366F130',borderRadius:10,padding:'9px 14px',cursor:'pointer',fontFamily:C.fb,fontSize:12,fontWeight:700,color:'#4338CA'}}>
                  📊 Exportar Banco de Horas (.csv)
                </button>
              </div>

              {/* Legenda de ausências */}
              <Card style={{marginBottom:12,padding:'10px 14px'}}>
                <div style={{fontFamily:C.fb,fontSize:10,fontWeight:700,color:C.inkLight,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Legenda de ocorrências</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {(Object.entries(ABSENCE_CONFIG) as [AbsenceType,typeof ABSENCE_CONFIG[AbsenceType]][]).map(([k,v])=>(
                    <span key={k} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'3px 8px',borderRadius:20,background:v.colorLt,color:v.color,fontSize:10,fontWeight:600,fontFamily:C.fb}} title={v.descricao}>
                      {v.emoji} {v.label} {v.paga?'✓':'✗'}
                    </span>
                  ))}
                </div>
                <div style={{fontFamily:C.fb,fontSize:10,color:C.inkLight,marginTop:6}}>✓ = remunerado · ✗ = não remunerado</div>
              </Card>

              {(mapTgt?employees.filter(e=>e.id===mapTgt):employees).map(emp=>{
                const st=gs(emp.id),[year,month]=mapM.split('-').map(Number),days=getDaysInMonth(year,month-1)
                const mTotal=days.reduce((s,d)=>s+(st.dailyWork[d]||0),0)
                const bankBal=st.bankBalance||0
                return (
                  <Card key={emp.id} style={{marginBottom:14,padding:0,overflow:'hidden'}}>
                    <div style={{padding:'12px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:bankBal>0?8:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{fontFamily:C.ff,fontSize:15,fontWeight:700,color:C.ink}}>{emp.name}</div>{emp.overtimeToBank&&<span style={{background:'#EEF2FF',color:'#4338CA',fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20}}>🏦 HE → Banco</span>}</div>
                        <div style={{fontFamily:C.ff,fontSize:15,fontWeight:700,color:C.emerald}}>{fmtHM(mTotal)}</div>
                      </div>
                      {bankBal>0&&(
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#EEF2FF',borderRadius:8,padding:'6px 10px',border:'1px solid #6366F130'}}>
                          <span style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:'#6366F1'}}>🏦 Banco de Horas: {fmtHM(bankBal)}</span>
                          <button onClick={()=>useBankHours(emp.id,bankBal)} style={{background:'#6366F1',border:'none',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontFamily:C.fb,fontSize:10,fontWeight:700,color:'#fff'}}>Zerar</button>
                        </div>
                      )}
                    </div>
                    <div style={{padding:'8px 12px 12px'}}>
                      {days.map(date=>{
                        const ms=st.dailyWork[date]||0,off=st.dailyOff?.[date],isToday=date===TODAY(),[,mo,d]=date.split('-')
                        const dow=fmtDow(date)
                        const isEd=editDay?.empId===emp.id&&editDay?.date===date
                        const absConf=off?ABSENCE_CONFIG[off]:null
                        const isWeekend=new Date(date+'T12:00:00').getDay()===0||new Date(date+'T12:00:00').getDay()===6
                        return (
                          <div key={date}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:isToday?C.brandLt:isWeekend?C.bg:'transparent',borderRadius:9,marginBottom:2,border:isToday?`1px solid ${C.brand}20`:isWeekend?`1px solid ${C.border}`:'1px solid transparent',opacity:isWeekend&&!ms&&!off?0.5:1}}>
                              <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
                                <span style={{fontFamily:C.fb,fontSize:10,color:isWeekend?C.brand:C.inkLight,width:26,fontWeight:isWeekend?700:400}}>{dow}</span>
                                <span style={{fontFamily:C.fb,fontSize:13,color:C.inkMid,fontWeight:isToday?600:400}}>{d}/{mo}</span>
                                {absConf&&<span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',borderRadius:20,background:absConf.colorLt,color:absConf.color,fontSize:10,fontWeight:600,fontFamily:C.fb}}>{absConf.emoji} {absConf.label}</span>}
                              </div>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:ms>0?C.emerald:C.inkXLight}}>{ms>0?fmtHM(ms):off?'—':'0h00'}</span>
                                <button onClick={()=>{setEditDay(isEd?null:{empId:emp.id,date});if(!isEd){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);setEditH(String(h));setEditMin(String(m))}}}
                                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11,color:C.inkMid}}>
                                  {isEd?'✕':'✏️'}
                                </button>
                                <select value={off||''} onChange={e=>markOff(emp.id,date,(e.target.value as AbsenceType|null)||null)}
                                  style={{background:absConf?absConf.colorLt:C.bg,border:`1px solid ${absConf?absConf.color+'50':C.border}`,borderRadius:6,padding:'4px 6px',color:absConf?absConf.color:C.inkMid,fontSize:10,fontFamily:C.fb,cursor:'pointer',fontWeight:absConf?700:400,maxWidth:110}}>
                                  <option value="">— Ocorrência</option>
                                  {(Object.entries(ABSENCE_CONFIG) as [AbsenceType,typeof ABSENCE_CONFIG[AbsenceType]][]).map(([k,v])=>(
                                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {isEd&&(
                              <div style={{background:C.brandLt,borderRadius:12,padding:14,marginBottom:8,border:`1px solid ${C.brand}30`}}>
                                <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.brand,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Editar {d}/{mo}</div>
                                <div style={{display:'flex',gap:10,marginBottom:12}}>
                                  {[['Horas',editH,setEditH,'0','23'],['Min',editMin,setEditMin,'0','59']].map(([lbl,val,setter,min,max])=>(
                                    <div key={lbl as string} style={{flex:1}}>
                                      <div style={{fontFamily:C.fb,fontSize:10,color:C.inkMid,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6,fontWeight:700}}>{lbl as string}</div>
                                      <input type="number" min={min as string} max={max as string} value={val as string} onChange={e=>(setter as Function)(e.target.value)}
                                        style={{width:'100%',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:'11px 12px',color:C.ink,fontSize:18,fontFamily:C.ff,fontWeight:700,outline:'none',textAlign:'center'}}/>
                                    </div>
                                  ))}
                                </div>
                                <div style={{display:'flex',gap:8}}>
                                  <Btn full onClick={()=>saveHours(emp.id,date,Number(editH)||0,Number(editMin)||0,st.dailyOvertimeRate?.[date]??emp.overtimeRate)}>Salvar</Btn>
                                  <Btn full variant="ghost" onClick={()=>setEditDay(null)}>Cancelar</Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* ── GEOFENCE ── */}
          {view==='geofence'&&(
            <div>
              <div style={{fontFamily:C.ff,fontSize:20,fontWeight:700,color:C.ink,letterSpacing:'-0.02em',marginBottom:14}}>Localização</div>
              <Card style={{marginBottom:14,padding:0,overflow:'hidden',border:`1px solid ${geo?C.emerald+'40':C.border}`}}>
                <div style={{height:3,background:geo?`linear-gradient(90deg,${C.emerald},${C.emerald}60)`:`linear-gradient(90deg,${C.border},${C.border})`}}/>
                <div style={{padding:18,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <Chip color={geo?C.emerald:C.inkLight} bg={geo?C.emeraldLt:C.bg}>{geo?'🟢 Cerca ativa':'🔴 Sem restrição'}</Chip>
                    {geo?(
                      <div style={{marginTop:10}}>
                        <div style={{fontFamily:C.ff,fontSize:14,fontWeight:600,color:C.ink,marginBottom:6}}>{geo.address}</div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
                          <Chip color={C.sky} bg={C.skyLt}>📍 Raio permitido: {geo.radius}m</Chip>
                          {livePos
                            ? <Chip color={livePos.dist<=geo.radius?C.emerald:C.rose} bg={livePos.dist<=geo.radius?C.emeraldLt:C.roseLt}>
                                {livePos.dist<=geo.radius?'✅':'⚠️'} Você está a {Math.round(livePos.dist)}m
                              </Chip>
                            : <button onClick={()=>navigator.geolocation.getCurrentPosition(p=>{const d=dist(p.coords.latitude,p.coords.longitude,geo.lat,geo.lng);setLivePos({lat:p.coords.latitude,lng:p.coords.longitude,dist:d})},()=>{})}
                                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:20,padding:'3px 10px',cursor:'pointer',fontFamily:C.fb,fontSize:11,color:C.inkMid}}>
                                📡 Ver minha distância
                              </button>
                          }
                        </div>
                        {livePos&&(
                          <div style={{marginTop:8,background:C.bg,borderRadius:10,padding:'10px 14px',border:`1px solid ${C.border}`}}>
                            <div style={{fontFamily:C.fb,fontSize:11,color:C.inkLight,marginBottom:4}}>Posição atual</div>
                            <div style={{fontFamily:C.ff,fontSize:13,fontWeight:700,color:livePos.dist<=geo.radius?C.emerald:C.rose}}>
                              {Math.round(livePos.dist)}m do ponto de referência
                            </div>
                            <div style={{marginTop:8,height:6,borderRadius:6,background:C.border,overflow:'hidden'}}>
                              <div style={{height:'100%',borderRadius:6,width:`${Math.min(100,(livePos.dist/geo.radius)*100)}%`,background:livePos.dist<=geo.radius?C.emerald:C.rose,transition:'width .5s'}}/>
                            </div>
                            <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                              <span style={{fontFamily:C.fb,fontSize:10,color:C.inkLight}}>0m</span>
                              <span style={{fontFamily:C.fb,fontSize:10,color:C.inkLight}}>limite: {geo.radius}m</span>
                            </div>
                            <button onClick={()=>navigator.geolocation.getCurrentPosition(p=>{const d=dist(p.coords.latitude,p.coords.longitude,geo.lat,geo.lng);setLivePos({lat:p.coords.latitude,lng:p.coords.longitude,dist:d})},()=>{})}
                              style={{marginTop:8,background:C.brandLt,border:`1px solid ${C.brand}20`,borderRadius:8,padding:'5px 12px',cursor:'pointer',fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.brand}}>
                              🔄 Atualizar posição
                            </button>
                          </div>
                        )}
                      </div>
                    ):(
                      <div style={{fontFamily:C.fb,fontSize:13,color:C.inkMid,marginTop:8}}>Ponto permitido de qualquer local.</div>
                    )}
                  </div>
                  {geo&&<Btn sm variant="danger" onClick={async()=>{await deleteDoc(cfg('geofence'));setGeoF({address:'',radius:'100'});setLivePos(null)}}>Remover</Btn>}
                </div>
              </Card>

              <Card>
                <div style={{fontFamily:C.ff,fontSize:16,fontWeight:700,color:C.ink,marginBottom:18}}>{geo?'Alterar':'Definir'} ponto de referência</div>
                <Input label="Endereço" value={geoF.address} onChange={v=>setGeoF(f=>({...f,address:v}))} placeholder="Av. Paulista, 1000, São Paulo, SP" error={geoErr}/>
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkMid,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Raio: <span style={{color:C.sky,fontFamily:C.ff}}>{geoF.radius}m</span></div>
                  <input type="range" min="10" max="1000" step="10" value={geoF.radius} onChange={e=>setGeoF(f=>({...f,radius:e.target.value}))} style={{width:'100%',accentColor:C.brand,height:4,cursor:'pointer'}}/>
                </div>
                {geoOk&&<div style={{background:C.emeraldLt,border:`1px solid ${C.emerald}40`,borderRadius:10,padding:'10px 14px',marginBottom:12,fontFamily:C.fb,fontSize:12,color:C.emerald,fontWeight:500}}>✓ {geoOk}</div>}
                <button onClick={saveGeo} disabled={geoLoad} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:geoLoad?C.border:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:geoLoad?C.inkLight:'#fff',fontSize:13,fontWeight:700,fontFamily:C.ff,cursor:geoLoad?'wait':'pointer',boxShadow:geoLoad?'none':`0 4px 16px ${C.brandGlow}`}}>
                  {geoLoad?'🔍 Localizando…':'📍 Salvar localização'}
                </button>
              </Card>
            </div>
          )}

          {/* ── EMPRESA ── */}
          {view==='empresa'&&(
            <div>
              <div style={{fontFamily:C.ff,fontSize:20,fontWeight:700,color:C.ink,letterSpacing:'-0.02em',marginBottom:14}}>Dados da Empresa</div>

              <Card style={{marginBottom:14,textAlign:'center',padding:22}}>
                <div style={{fontFamily:C.fb,fontSize:11,fontWeight:700,color:C.inkLight,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:14}}>Logo</div>
                {coForm.logo?(
                  <img src={coForm.logo} alt="" style={{maxHeight:80,maxWidth:'100%',borderRadius:12,objectFit:'contain',marginBottom:12,display:'block',margin:'0 auto 12px'}}/>
                ):(
                  <div style={{width:72,height:72,borderRadius:18,background:C.brandLt,border:`2px dashed ${C.brand}30`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:30}}>🏢</div>
                )}
                <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                  <label style={{background:C.brandLt,border:`1px solid ${C.brand}30`,borderRadius:10,padding:'8px 16px',cursor:'pointer',fontFamily:C.fb,fontSize:12,fontWeight:700,color:C.brand,display:'inline-block'}}>
                    {coForm.logo?'Trocar':'Enviar logo'}
                    <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setCoForm(f=>({...f,logo:ev.target?.result as string}));r.readAsDataURL(f)}}/>
                  </label>
                  {coForm.logo&&<button onClick={()=>setCoForm(f=>({...f,logo:''}))} style={{background:C.roseLt,border:`1px solid ${C.rose}30`,borderRadius:10,padding:'8px 12px',cursor:'pointer',fontSize:12,color:C.rose,fontFamily:C.fb,fontWeight:600}}>Remover</button>}
                </div>
              </Card>

              <Input label="Nome da empresa" value={coForm.name} onChange={v=>setCoForm(f=>({...f,name:v}))} placeholder="Ex: Empresa LTDA"/>
              <Input label="CNPJ" value={coForm.cnpj} onChange={v=>setCoForm(f=>({...f,cnpj:v}))} placeholder="00.000.000/0000-00"/>
              <Input label="Endereço" value={coForm.address} onChange={v=>setCoForm(f=>({...f,address:v}))} placeholder="Rua, Nº, Bairro, Cidade – UF"/>
              <Input label="Telefone" value={coForm.phone} onChange={v=>setCoForm(f=>({...f,phone:v}))} placeholder="(00) 00000-0000"/>
              <Input label="E-mail" value={coForm.email} onChange={v=>setCoForm(f=>({...f,email:v}))} placeholder="contato@empresa.com"/>

              {coSaved&&<div style={{background:C.emeraldLt,border:`1px solid ${C.emerald}40`,borderRadius:12,padding:'12px 16px',marginBottom:14,fontFamily:C.fb,fontSize:13,color:C.emerald,fontWeight:600}}>✓ Dados salvos com sucesso!</div>}
              {coErr&&<div style={{background:C.roseLt,border:`1px solid ${C.rose}30`,borderRadius:12,padding:'12px 16px',marginBottom:14,fontFamily:C.fb,fontSize:13,color:C.rose}}>⚠ {coErr}</div>}

              <button onClick={async()=>{
                setCoErr('')
                try{
                  const size=coForm.logo?new Blob([coForm.logo]).size:0
                  if(size>900000){setCoErr('Logo muito grande! Use uma imagem menor (máx ~700KB).');return}
                  await setDoc(doc(db,`companies/${slug}/config`,'company'),{name:coForm.name,cnpj:coForm.cnpj,address:coForm.address,phone:coForm.phone,email:coForm.email,logo:coForm.logo})
                  setCoSaved(true);setTimeout(()=>setCoSaved(false),3000)
                }catch(err:any){setCoErr('Erro: '+(err?.message||'tente novamente.'))}
              }} style={{width:'100%',padding:'14px',borderRadius:14,border:'none',background:`linear-gradient(135deg,${C.brand},${C.brandDk})`,color:'#fff',fontSize:14,fontWeight:700,fontFamily:C.ff,cursor:'pointer',boxShadow:`0 6px 24px ${C.brandGlow}`,letterSpacing:'0.01em'}}>
                Salvar dados da empresa
              </button>
            </div>
          )}
        </div>

        <NavBar tabs={aTabs} active={view} onSelect={k=>{setView(k);if(k==='list')setAv('list')}}/>
      </div>
    </div>
  )
}
