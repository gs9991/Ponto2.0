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

// ─── CREDENCIAIS ────────────────────────────────────────────────────────────
// Super-admin: acessa todas as empresas e pode criar/excluir empresas
const SUPER_ADMIN = { username: 'superadmin', password: 'super@2024' }

function formatTime(d: Date) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function formatDate(d: Date) { return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) }
function formatDateShort(d: Date) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
function formatDuration(ms: number) {
  if (!ms || ms < 0) return '00:00:00'
  const t = Math.floor(ms / 1000)
  return `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
}
function formatHours(ms: number) { return !ms || ms < 0 ? '0.00h' : (ms/3600000).toFixed(2)+'h' }
function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function msToHHMM(ms: number) {
  if (!ms || ms < 0) return '0h00'
  const t = Math.floor(ms/60000); return `${Math.floor(t/60)}h${String(t%60).padStart(2,'0')}`
}
function getDaysInMonth(year: number, month: number) {
  const days: string[] = []; const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1) }
  return days
}
const TODAY = () => new Date().toISOString().split('T')[0]
const STATUS = { OUT: 'out', IN: 'in', BREAK: 'break' }
const statusLabel: Record<string,string> = { out:'Fora', in:'Trabalhando', break:'Pausa' }
const statusColor: Record<string,string> = { out:'#94a3b8', in:'#22c55e', break:'#f59e0b' }
const typeLabel: Record<string,string> = { entrada:'Entrada', saida:'Saída', inicio_pausa:'Início Pausa', fim_pausa:'Fim Pausa' }
const typeColor: Record<string,string> = { entrada:'#22c55e', saida:'#ef4444', inicio_pausa:'#f59e0b', fim_pausa:'#3b82f6' }

interface Discount { id: number; value: number; reason: string; date: string }
interface Company { name: string; cnpj: string; address: string; phone: string; email: string; logo: string }
interface CompanyMeta {
  slug: string          // código único ex: "empresa123"
  name: string
  adminUsername: string
  adminPassword: string
  createdAt: string
}
interface Employee {
  id: number; name: string; role: string; username: string; password: string; avatar: string
  payType: 'day'|'hour'; payValue: number; hoursPerDay: number
  overtimeRate: 50|70|100
  discounts: Discount[]; gratifications: Discount[]
  cpf?: string; admission?: string; fgts?: boolean
  companySlug: string   // para filtrar por empresa
}
interface LogEntry { type: string; time: Date }
interface EmpState {
  status: string; log: LogEntry[]; workStart: Date|null; breakStart: Date|null
  totalWork: number; totalBreak: number; days: string[]
  dailyWork: Record<string,number>
  dailyOff: Record<string,'paid'|'unpaid'>
  dailyNight: Record<string,number>
  dailyOvertimeRate: Record<string,number>
}
interface User {
  id: number; name: string; username: string; avatar: string; role: string
  payType: 'day'|'hour'; payValue: number; hoursPerDay: number; discounts: Discount[]
  companySlug?: string
}

function Input({ label, type='text', value, onChange, placeholder, error }: {
  label?: string; type?: string; value: string; onChange: (v:string)=>void; placeholder?: string; error?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>{label}</div>}
      <div style={{ position:'relative' }}>
        <input type={type==='password'&&show?'text':type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:`1px solid ${error?'#ef4444':'#334155'}`, borderRadius:10, padding:'12px 40px 12px 14px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }} />
        {type==='password' && (
          <button onClick={()=>setShow(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:14 }}>
            {show?'🙈':'👁'}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize:11, color:'#ef4444', marginTop:4 }}>{error}</div>}
    </div>
  )
}

function Btn({ children, onClick, color='#6366f1', disabled, full, small, outline }: {
  children: React.ReactNode; onClick: ()=>void; color?: string
  disabled?: boolean; full?: boolean; small?: boolean; outline?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:full?'100%':'auto', padding:small?'8px 14px':'13px 20px',
      borderRadius:10, border:outline?`1.5px solid ${color}`:'none',
      cursor:disabled?'not-allowed':'pointer',
      background:disabled?'#1e293b':outline?'transparent':color,
      color:disabled?'#334155':outline?color:'#fff',
      fontSize:small?11:13, fontWeight:700, fontFamily:'inherit', opacity:disabled?0.6:1
    }}>{children}</button>
  )
}

function calcNightMs(startMs: number, endMs: number) {
  let night = 0
  for (let t = startMs; t < endMs; t += 60000) {
    const h = new Date(t).getHours()
    if (h >= 22 || h < 5) night += 60000
  }
  return night
}

// ─── TELA DE SELEÇÃO DE EMPRESA ─────────────────────────────────────────────
function CompanySelectScreen({ onSelect }: { onSelect: (slug: string) => void }) {
  const [slugInput, setSlugInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    const slug = slugInput.trim().toLowerCase()
    if (!slug) { setError('Digite o código da empresa'); return }
    setLoading(true); setError('')
    try {
      const snap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)))
      if (snap.empty) { setError('Empresa não encontrada. Verifique o código.'); setLoading(false); return }
      onSelect(slug)
    } catch {
      setError('Erro ao conectar. Tente novamente.'); setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', justifyContent:'center', fontFamily:"'Courier New',monospace" }}>
      <div style={{ width:'100%', maxWidth:420, display:'flex', flexDirection:'column' }}>
        <div style={{ height:3, background:'linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 24px' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:80, height:80, borderRadius:24, background:'linear-gradient(135deg,#6366f1,#06b6d4)', boxShadow:'0 0 40px #6366f140', marginBottom:20, fontSize:36 }}>⏱</div>
            <div style={{ fontSize:28, fontWeight:900, color:'#f1f5f9' }}>PontoApp</div>
            <div style={{ fontSize:12, color:'#475569', marginTop:6, letterSpacing:2, textTransform:'uppercase' }}>Controle de Ponto Digital</div>
          </div>

          <div style={{ background:'linear-gradient(160deg,#1e293b,#162032)', borderRadius:20, padding:'28px 24px', border:'1px solid #334155' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:6 }}>🏢 Identificar Empresa</div>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:20 }}>Digite o código da sua empresa para continuar.</div>
            <Input
              label="Código da Empresa"
              value={slugInput}
              onChange={setSlugInput}
              placeholder="Ex: minhaempresa"
              error={error}
            />
            <button
              onClick={handleContinue}
              disabled={loading}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', cursor:loading?'wait':'pointer', background:loading?'#334155':'linear-gradient(135deg,#6366f1,#4f46e5)', color:loading?'#64748b':'#fff', fontSize:14, fontWeight:800, fontFamily:'inherit' }}>
              {loading ? '🔍 Verificando...' : 'CONTINUAR →'}
            </button>
          </div>

          <div style={{ textAlign:'center', marginTop:20 }}>
            <button onClick={()=>onSelect('__superadmin__')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#334155', fontFamily:'inherit' }}>
              Acesso administrativo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TELA SUPER-ADMIN ────────────────────────────────────────────────────────
function SuperAdminScreen({ onLogout }: { onLogout: () => void }) {
  const [companies, setCompanies] = useState<CompanyMeta[]>([])
  const [view, setView] = useState<'list'|'new'>('list')
  const [form, setForm] = useState({ slug:'', name:'', adminUsername:'', adminPassword:'' })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [successMsg, setSuccessMsg] = useState('')
  const [now, setNow] = useState(new Date())

  useEffect(() => { const t = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t) }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'companies'), snap => {
      setCompanies(snap.docs.map(d => d.data() as CompanyMeta))
    }); return () => unsub()
  }, [])

  const validateForm = () => {
    const e: Record<string,string> = {}
    if (!form.slug.trim()) e.slug = 'Código obrigatório'
    else if (!/^[a-z0-9_-]+$/.test(form.slug.trim())) e.slug = 'Apenas letras minúsculas, números, - e _'
    else if (companies.find(c => c.slug === form.slug.trim())) e.slug = 'Código já em uso'
    if (!form.name.trim()) e.name = 'Nome obrigatório'
    if (!form.adminUsername.trim()) e.adminUsername = 'Usuário obrigatório'
    if (!form.adminPassword.trim()) e.adminPassword = 'Senha obrigatória'
    return e
  }

  const saveCompany = async () => {
    const e = validateForm(); if (Object.keys(e).length) { setFormErrors(e); return }
    const slug = form.slug.trim().toLowerCase()
    const meta: CompanyMeta = { slug, name:form.name.trim(), adminUsername:form.adminUsername.trim(), adminPassword:form.adminPassword, createdAt: new Date().toISOString() }
    await setDoc(doc(db, 'companies', slug), meta)
    // Também salvar config inicial da empresa
    await setDoc(doc(db, `companies/${slug}/config`, 'company'), { name:form.name.trim(), cnpj:'', address:'', phone:'', email:'', logo:'' })
    setSuccessMsg(`Empresa "${form.name}" criada!`)
    setTimeout(() => setSuccessMsg(''), 4000)
    setForm({ slug:'', name:'', adminUsername:'', adminPassword:'' }); setFormErrors({}); setView('list')
  }

  const deleteCompany = async (slug: string) => {
    if (!window.confirm(`Excluir a empresa "${slug}"? Isso não remove os dados dos funcionários.`)) return
    await deleteDoc(doc(db, 'companies', slug))
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', justifyContent:'center', fontFamily:"'Courier New',monospace" }}>
      <div style={{ width:'100%', maxWidth:420, minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column' }}>
        <div style={{ height:3, background:'linear-gradient(90deg,#f59e0b,#ef4444,#6366f1)' }} />

        {/* Header */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:4, color:'#f59e0b', textTransform:'uppercase' }}>Super Admin</div>
            <div style={{ fontSize:18, fontWeight:900, color:'#f1f5f9' }}>🛡 PontoApp</div>
          </div>
          <div style={{ textAlign:'right', background:'#1e293b', borderRadius:12, padding:'8px 14px', border:'1px solid #334155' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#f59e0b' }}>{formatTime(now)}</div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px 24px' }}>
          {successMsg && <div style={{ background:'#16a34a20', border:'1px solid #22c55e60', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#22c55e', fontWeight:600 }}>✅ {successMsg}</div>}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:10, letterSpacing:3, color:'#f59e0b', textTransform:'uppercase' }}>Empresas Cadastradas</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{companies.length} empresa(s)</div>
            </div>
            <Btn small color="#f59e0b" onClick={()=>setView(view==='new'?'list':'new')}>
              {view==='new' ? '← Voltar' : '+ Nova Empresa'}
            </Btn>
          </div>

          {view==='new' && (
            <div style={{ background:'#1e293b', borderRadius:16, padding:18, border:'1px solid #f59e0b30', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:16 }}>➕ Nova Empresa</div>

              <Input label="Nome da Empresa" value={form.name} onChange={v => {
                // Auto-sugere o slug a partir do nome se o slug ainda não foi editado manualmente
                const autoSlug = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
                setForm(f => ({ ...f, name: v, slug: f.slug === '' || f.slug === form.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') ? autoSlug : f.slug }))
              }} placeholder="Ex: Mercearia do Zé LTDA" error={formErrors.name} />

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:'#f59e0b', textTransform:'uppercase', marginBottom:6 }}>Código de Acesso (slug)</div>
                <div style={{ position:'relative' }}>
                  <input
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,'') }))}
                    placeholder="Ex: mercearia-ze"
                    style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:`1px solid ${formErrors.slug?'#ef4444':'#f59e0b60'}`, borderRadius:10, padding:'12px 14px', color:'#f59e0b', fontSize:14, fontWeight:800, fontFamily:'inherit', outline:'none', letterSpacing:1 }}
                  />
                </div>
                {formErrors.slug && <div style={{ fontSize:11, color:'#ef4444', marginTop:4 }}>{formErrors.slug}</div>}
                <div style={{ fontSize:10, color:'#475569', marginTop:6 }}>
                  Este é o código que o cliente digitará para acessar o app. Use apenas letras minúsculas, números, <code style={{color:'#64748b'}}>-</code> e <code style={{color:'#64748b'}}>_</code>.
                </div>
                {form.slug && (
                  <div style={{ marginTop:8, background:'#0f172a', borderRadius:8, padding:'8px 12px', border:'1px solid #f59e0b20', fontSize:12, color:'#64748b' }}>
                    Preview: <span style={{ color:'#f59e0b', fontWeight:800 }}>{form.slug}</span>
                  </div>
                )}
              </div>

              <Input label="Usuário do Admin" value={form.adminUsername} onChange={v=>setForm(f=>({...f,adminUsername:v}))} placeholder="Ex: admin" error={formErrors.adminUsername} />
              <Input label="Senha do Admin" type="password" value={form.adminPassword} onChange={v=>setForm(f=>({...f,adminPassword:v}))} placeholder="Senha de acesso do admin" error={formErrors.adminPassword} />
              <Btn full color="#f59e0b" onClick={saveCompany}>✅ Criar Empresa</Btn>
            </div>
          )}

          {view==='list' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {companies.length === 0 && (
                <div style={{ textAlign:'center', padding:'50px 0', color:'#475569' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🏢</div>
                  <div style={{ fontSize:13 }}>Nenhuma empresa cadastrada</div>
                  <div style={{ fontSize:11, marginTop:6 }}>Clique em "+ Nova Empresa" para começar</div>
                </div>
              )}
              {companies.map(c => (
                <div key={c.slug} style={{ background:'#1e293b', borderRadius:14, padding:16, border:'1px solid #334155' }}>
                  {/* Código em destaque */}
                  <div style={{ background:'#0f172a', borderRadius:10, padding:'10px 14px', marginBottom:12, border:'1px solid #f59e0b30', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:9, letterSpacing:3, color:'#f59e0b', textTransform:'uppercase', marginBottom:3 }}>🔑 Código de Acesso</div>
                      <div style={{ fontSize:20, fontWeight:900, color:'#f59e0b', letterSpacing:2 }}>{c.slug}</div>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(c.slug); }}
                      title="Copiar código"
                      style={{ background:'#f59e0b20', border:'1px solid #f59e0b40', borderRadius:8, padding:'8px 12px', cursor:'pointer', fontSize:12, color:'#f59e0b', fontFamily:'inherit', fontWeight:700 }}>
                      📋 Copiar
                    </button>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:6 }}>{c.name}</div>
                      <div style={{ fontSize:11, color:'#64748b' }}>Admin: <span style={{ color:'#94a3b8', fontWeight:700 }}>{c.adminUsername}</span></div>
                      <div style={{ fontSize:10, color:'#475569', marginTop:3 }}>Criada em {new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <Btn small outline color="#ef4444" onClick={()=>deleteCompany(c.slug)}>🗑</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:9, color:'#334155', letterSpacing:2, textTransform:'uppercase' }}>🛡 Super Administrador</div>
          <button onClick={onLogout} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#ef4444', fontFamily:'inherit', fontWeight:700 }}>Sair →</button>
        </div>
      </div>
    </div>
  )
}

// ─── APP PRINCIPAL (por empresa) ─────────────────────────────────────────────
export default function PontoApp() {
  const [companySlug, setCompanySlug] = useState<string|null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Se ainda não escolheu empresa, mostra tela de seleção
  if (!companySlug) {
    return <CompanySelectScreen onSelect={slug => {
      if (slug === '__superadmin__') {
        setIsSuperAdmin(true)
        setCompanySlug('__superadmin__')
      } else {
        setCompanySlug(slug)
      }
    }} />
  }

  if (isSuperAdmin) {
    return <SuperAdminLogin onLogout={() => { setCompanySlug(null); setIsSuperAdmin(false) }} />
  }

  return <CompanyApp slug={companySlug} onLogout={() => { setCompanySlug(null) }} />
}

// ─── LOGIN SUPER ADMIN ───────────────────────────────────────────────────────
function SuperAdminLogin({ onLogout }: { onLogout: ()=>void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [authed, setAuthed] = useState(false)

  const login = () => {
    if (user === SUPER_ADMIN.username && pass === SUPER_ADMIN.password) { setAuthed(true); setError('') }
    else setError('Credenciais incorretas.')
  }

  if (authed) return <SuperAdminScreen onLogout={onLogout} />

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', justifyContent:'center', fontFamily:"'Courier New',monospace" }}>
      <div style={{ width:'100%', maxWidth:420, display:'flex', flexDirection:'column' }}>
        <div style={{ height:3, background:'linear-gradient(90deg,#f59e0b,#ef4444,#6366f1)' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 24px' }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🛡</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#f1f5f9' }}>Acesso Restrito</div>
            <div style={{ fontSize:12, color:'#475569', marginTop:6, letterSpacing:2, textTransform:'uppercase' }}>Super Administrador</div>
          </div>
          <div style={{ background:'linear-gradient(160deg,#1e293b,#162032)', borderRadius:20, padding:'28px 24px', border:'1px solid #f59e0b30' }}>
            <Input label="Usuário" value={user} onChange={setUser} placeholder="superadmin" />
            <Input label="Senha" type="password" value={pass} onChange={setPass} placeholder="••••••••" error={error} />
            <button onClick={login} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#000', fontSize:14, fontWeight:800, fontFamily:'inherit', marginTop:8 }}>
              ENTRAR →
            </button>
          </div>
          <div style={{ textAlign:'center', marginTop:16 }}>
            <button onClick={onLogout} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#475569', fontFamily:'inherit' }}>← Voltar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── APP DA EMPRESA ──────────────────────────────────────────────────────────
function CompanyApp({ slug, onLogout }: { slug: string; onLogout: ()=>void }) {
  const [now, setNow] = useState(new Date())
  const [companyMeta, setCompanyMeta] = useState<CompanyMeta|null>(null)
  const [loggedIn, setLoggedIn] = useState<User|null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<Record<number,EmpState>>({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('clock')
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [adminView, setAdminView] = useState('list')
  const [editingEmp, setEditingEmp] = useState<Employee|null>(null)
  const [form, setForm] = useState<any>({ name:'', role:'', username:'', password:'', payType:'day', payValue:'', hoursPerDay:'8', overtimeRate:'50', cpf:'', admission:'', fgts:false })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [successMsg, setSuccessMsg] = useState('')
  const [discountTarget, setDiscountTarget] = useState<number|null>(null)
  const [discountForm, setDiscountForm] = useState({ value:'', reason:'' })
  const [discountError, setDiscountError] = useState('')
  const [expandedReport, setExpandedReport] = useState<number|null>(null)
  const [reportMonth, setReportMonth] = useState(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [isAddingGratif, setIsAddingGratif] = useState(false)
  const [gratifTarget, setGratifTarget] = useState<number|null>(null)
  const [gratifForm, setGratifForm] = useState({ value:'', reason:'' })
  const [gratifError, setGratifError] = useState('')
  const [mapTarget, setMapTarget] = useState<number|null>(null)
  const [mapMonth, setMapMonth] = useState(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [editingDay, setEditingDay] = useState<{ empId:number; date:string }|null>(null)
  const [editHours, setEditHours] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [geofence, setGeofence] = useState<{ lat:number; lng:number; radius:number; address:string }|null>(null)
  const [geoForm, setGeoForm] = useState({ address:'', radius:'100' })
  const [geoError, setGeoError] = useState('')
  const [geoSuccess, setGeoSuccess] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [punchBlocked, setPunchBlocked] = useState('')
  const [punchChecking, setPunchChecking] = useState(false)
  const [company, setCompany] = useState<Company|null>(null)
  const [companyForm, setCompanyForm] = useState({ name:'', cnpj:'', address:'', phone:'', email:'', logo:'' })
  const [companySaved, setCompanySaved] = useState(false)
  const [companySaveError, setCompanySaveError] = useState('')

  // Coleções isoladas por empresa: companies/{slug}/employees, companies/{slug}/records, etc.
  const empCol = `companies/${slug}/employees`
  const recCol = `companies/${slug}/records`
  const cfgDoc = (id: string) => doc(db, `companies/${slug}/config`, id)

  useEffect(() => { const t = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t) }, [])

  // Carregar meta da empresa
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'companies', slug), snap => {
      if (snap.exists()) setCompanyMeta(snap.data() as CompanyMeta)
    }); return ()=>unsub()
  }, [slug])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, empCol), snap => {
      setEmployees(snap.docs.map(d=>({...(d.data() as Employee)})))
      setLoading(false)
    }); return ()=>unsub()
  }, [slug])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, recCol), snap => {
      const recs: Record<number,EmpState> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        recs[Number(d.id)] = {
          ...data,
          log: (data.log||[]).map((e:{type:string;time:string})=>({type:e.type,time:new Date(e.time)})),
          workStart: data.workStart ? new Date(data.workStart) : null,
          breakStart: data.breakStart ? new Date(data.breakStart) : null,
          dailyWork: data.dailyWork||{},
          dailyOff: data.dailyOff||{},
          dailyNight: data.dailyNight||{},
          dailyOvertimeRate: data.dailyOvertimeRate||{},
        } as EmpState
      })
      setRecords(recs)
    }); return ()=>unsub()
  }, [slug])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `companies/${slug}/config`, 'geofence'), snap => {
      if (snap.exists()) setGeofence(snap.data() as {lat:number;lng:number;radius:number;address:string})
      else setGeofence(null)
    }); return ()=>unsub()
  }, [slug])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `companies/${slug}/config`, 'company'), snap => {
      if (snap.exists()) {
        const d = snap.data() as Company
        setCompany(d)
        setCompanyForm({ name:d.name||'', cnpj:d.cnpj||'', address:d.address||'', phone:d.phone||'', email:d.email||'', logo:d.logo||'' })
      }
    }); return ()=>unsub()
  }, [slug])

  const getState = (id:number): EmpState =>
    records[id] || { status:STATUS.OUT, log:[], workStart:null, breakStart:null, totalWork:0, totalBreak:0, days:[], dailyWork:{}, dailyOff:{}, dailyNight:{}, dailyOvertimeRate:{} }

  const geocodeAddress = async (address:string) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`)
      const data = await res.json()
      if (!data.length) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch { return null }
  }

  const calcDistance = (lat1:number,lng1:number,lat2:number,lng2:number) => {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
  }

  const saveGeofence = async () => {
    setGeoError(''); setGeoSuccess(''); setGeoLoading(true)
    if (!geoForm.address.trim()) { setGeoError('Digite um endereço.'); setGeoLoading(false); return }
    const radius = Number(geoForm.radius)
    if (!radius||radius<10||radius>5000) { setGeoError('Raio entre 10 e 5000m.'); setGeoLoading(false); return }
    const coords = await geocodeAddress(geoForm.address)
    if (!coords) { setGeoError('Endereço não encontrado.'); setGeoLoading(false); return }
    await setDoc(cfgDoc('geofence'), {...coords, radius, address:geoForm.address})
    setGeoSuccess(`Cerca ativa! Raio de ${radius}m.`); setGeoLoading(false)
    setTimeout(()=>setGeoSuccess(''),4000)
  }

  const punch = (type:string) => {
    if (!loggedIn||loggedIn.role!=='employee') return
    setPunchBlocked(''); setPunchChecking(true)
    const doRegister = async () => {
      const id = loggedIn.id, state = getState(id), ts = new Date(), todayStr = TODAY()
      const newLog = [...state.log, {type, time:ts}]
      let s: EmpState = {...state, log:newLog}
      if (type==='entrada') {
        s.status=STATUS.IN; s.workStart=ts
      } else if (type==='saida') {
        const workedNow = state.workStart ? ts.getTime()-state.workStart.getTime() : 0
        const nightNow = state.workStart ? calcNightMs(state.workStart.getTime(), ts.getTime()) : 0
        s.totalWork=(state.totalWork||0)+workedNow
        s.dailyWork={...(state.dailyWork||{})}; s.dailyWork[todayStr]=(s.dailyWork[todayStr]||0)+workedNow
        s.dailyNight={...(state.dailyNight||{})}; s.dailyNight[todayStr]=(s.dailyNight[todayStr]||0)+nightNow
        s.status=STATUS.OUT; s.workStart=null
        if (!s.days.includes(todayStr)) s.days=[...s.days, todayStr]
      } else if (type==='inicio_pausa') {
        const workedNow = state.workStart ? ts.getTime()-state.workStart.getTime() : 0
        const nightNow = state.workStart ? calcNightMs(state.workStart.getTime(), ts.getTime()) : 0
        s.totalWork=(state.totalWork||0)+workedNow
        s.dailyWork={...(state.dailyWork||{})}; s.dailyWork[todayStr]=(s.dailyWork[todayStr]||0)+workedNow
        s.dailyNight={...(state.dailyNight||{})}; s.dailyNight[todayStr]=(s.dailyNight[todayStr]||0)+nightNow
        s.status=STATUS.BREAK; s.workStart=null; s.breakStart=ts
      } else if (type==='fim_pausa') {
        s.totalBreak=(state.totalBreak||0)+(state.breakStart?ts.getTime()-state.breakStart.getTime():0)
        s.status=STATUS.IN; s.breakStart=null; s.workStart=ts
      }
      await setDoc(doc(db, recCol, String(id)), {
        ...s, log:s.log.map(e=>({type:e.type,time:e.time.toISOString()})),
        workStart:s.workStart?s.workStart.toISOString():null,
        breakStart:s.breakStart?s.breakStart.toISOString():null,
      })
      setPunchChecking(false)
    }
    if (!geofence) { doRegister(); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = calcDistance(pos.coords.latitude,pos.coords.longitude,geofence.lat,geofence.lng)
        if (dist<=geofence.radius) { doRegister() }
        else { setPunchChecking(false); setPunchBlocked(`📍 Você está a ${Math.round(dist)}m. Máximo: ${geofence.radius}m.`); setTimeout(()=>setPunchBlocked(''),6000) }
      },
      () => { setPunchChecking(false); setPunchBlocked('⚠️ Não foi possível obter sua localização.'); setTimeout(()=>setPunchBlocked(''),6000) },
      { enableHighAccuracy:true, timeout:8000 }
    )
  }

  // monthFilter: 'YYYY-MM' para filtrar por mês específico, ou undefined para mês atual ao vivo
  const calcPayment = (emp:Employee, state:EmpState, liveWork:number, monthFilter?: string) => {
    const hourValue = emp.payType==='hour' ? emp.payValue : emp.payValue/emp.hoursPerDay
    const journeyMs = emp.hoursPerDay * 3600000

    const allDays = { ...(state.dailyWork||{}) }
    if (!monthFilter && state.status!==STATUS.OUT) {
      const todayStr = TODAY()
      allDays[todayStr] = (allDays[todayStr]||0) + (state.workStart ? now.getTime()-state.workStart.getTime() : 0)
    }
    const filteredDays = monthFilter
      ? Object.fromEntries(Object.entries(allDays).filter(([d]) => d.startsWith(monthFilter)))
      : allDays
    const filteredOff = monthFilter
      ? Object.fromEntries(Object.entries(state.dailyOff||{}).filter(([d]) => d.startsWith(monthFilter)))
      : (state.dailyOff||{})
    const filteredNight = monthFilter
      ? Object.fromEntries(Object.entries(state.dailyNight||{}).filter(([d]) => d.startsWith(monthFilter)))
      : (state.dailyNight||{})

    let regularMs = 0, overtimeByRate: Record<number,number> = {}
    Object.entries(filteredDays).forEach(([date, ms]) => {
      const reg = Math.min(ms as number, journeyMs)
      const ot = Math.max(0, (ms as number)-journeyMs)
      regularMs += reg
      if (ot > 0) {
        const rate = (state.dailyOvertimeRate||{})[date] ?? (emp.overtimeRate||50)
        overtimeByRate[rate] = (overtimeByRate[rate]||0) + ot
      }
    })
    const totalMs = monthFilter
      ? Object.values(filteredDays).reduce((a,b) => a+(b as number), 0)
      : liveWork
    const totalBreakMs = monthFilter ? 0 : (state.totalBreak||0)+(state.breakStart?now.getTime()-state.breakStart.getTime():0)
    const daysWorked = Object.keys(filteredDays).filter(d=>(filteredDays[d]||0)>0).length + (!monthFilter && state.status!==STATUS.OUT ? 1 : 0)
    const paidOffDays = Object.values(filteredOff).filter(v=>v==='paid').length
    const totalPaidDays = daysWorked + paidOffDays
    const overtimeMs = Object.values(overtimeByRate).reduce((a,b)=>a+b,0)

    let regularValue = 0, overtimeValue = 0
    if (emp.payType==='hour') {
      regularValue = (regularMs/3600000)*hourValue
    } else {
      regularValue = totalPaidDays * emp.payValue
    }
    Object.entries(overtimeByRate).forEach(([rate, ms]) => {
      overtimeValue += (ms as number)/3600000 * hourValue * (1+Number(rate)/100)
    })
    const nightMs = Object.values(filteredNight).reduce((a:number,b)=>a+(b as number),0)
    const nightBonus = (nightMs/3600000)*hourValue*0.20
    const grossValue = regularValue + overtimeValue + nightBonus
    const manualDiscountTotal = (emp.discounts||[]).reduce((s,d)=>s+d.value,0)
    const totalDeductions = manualDiscountTotal
    const gratificationsTotal = (emp.gratifications||[]).reduce((s,g)=>s+g.value,0)
    const net = Math.max(0, grossValue-totalDeductions) + gratificationsTotal
    return { totalMs, daysWorked, grossValue, autoDeductions:0, manualDiscountTotal, totalDeductions, net, breakMs:totalBreakMs, overtimeMs, overtimeByRate, nightMs, nightBonus, gratificationsTotal, regularValue, overtimeValue }
  }

  const validateForm = () => {
    const e: Record<string,string> = {}
    if (!form.name.trim()) e.name='Nome obrigatório'
    if (!form.role.trim()) e.role='Cargo obrigatório'
    if (!form.username.trim()) e.username='Usuário obrigatório'
    else if (employees.find(emp=>emp.username===form.username&&emp.id!==editingEmp?.id)) e.username='Usuário já cadastrado'
    if (!editingEmp&&!form.password.trim()) e.password='Senha obrigatória'
    if (!form.payValue||isNaN(Number(form.payValue))||Number(form.payValue)<=0) e.payValue='Valor obrigatório'
    return e
  }

  const saveEmployee = async () => {
    const e = validateForm(); if (Object.keys(e).length) { setFormErrors(e); return }
    const av = form.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
    const data = {
      name:form.name, role:form.role, username:form.username, avatar:av,
      payType:form.payType as 'day'|'hour', payValue:Number(form.payValue),
      hoursPerDay:Number(form.hoursPerDay)||8, overtimeRate:Number(form.overtimeRate) as 50|70|100,
      cpf:form.cpf||'', admission:form.admission||'', fgts:form.fgts||false,
      companySlug: slug,
      ...(form.password?{password:form.password}:{})
    }
    if (editingEmp) {
      await setDoc(doc(db, empCol, String(editingEmp.id)), {...editingEmp,...data})
      setSuccessMsg('Funcionário atualizado!')
    } else {
      const id = Date.now()
      await setDoc(doc(db, empCol, String(id)), {id, password:form.password, discounts:[], gratifications:[], ...data})
      setSuccessMsg('Funcionário cadastrado!')
    }
    setTimeout(()=>setSuccessMsg(''),3000)
    setForm({ name:'', role:'', username:'', password:'', payType:'day', payValue:'', hoursPerDay:'8', overtimeRate:'50', cpf:'', admission:'', fgts:false })
    setFormErrors({}); setEditingEmp(null); setAdminView('list')
  }

  const deleteEmployee = async (id:number) => {
    await deleteDoc(doc(db, empCol, String(id)))
    await deleteDoc(doc(db, recCol, String(id)))
  }

  const startEdit = (emp:Employee) => {
    setEditingEmp(emp)
    setForm({ name:emp.name, role:emp.role, username:emp.username, password:'', payType:emp.payType, payValue:String(emp.payValue), hoursPerDay:String(emp.hoursPerDay), overtimeRate:String(emp.overtimeRate||50), cpf:emp.cpf||'', admission:emp.admission||'', fgts:emp.fgts||false })
    setFormErrors({}); setAdminView('edit')
  }

  const addDiscount = async (empId:number) => {
    setDiscountError('')
    if (!discountForm.value||isNaN(Number(discountForm.value))||Number(discountForm.value)<=0) { setDiscountError('Valor inválido'); return }
    if (!discountForm.reason.trim()) { setDiscountError('Informe o motivo'); return }
    const emp = employees.find(e=>e.id===empId); if (!emp) return
    const d: Discount = { id:Date.now(), value:Number(discountForm.value), reason:discountForm.reason.trim(), date:formatDateShort(new Date()) }
    await setDoc(doc(db, empCol, String(empId)), {...emp, discounts:[...(emp.discounts||[]),d]})
    setDiscountForm({ value:'', reason:'' }); setDiscountTarget(null)
  }

  const removeDiscount = async (empId:number, discountId:number) => {
    const emp = employees.find(e=>e.id===empId); if (!emp) return
    await setDoc(doc(db, empCol, String(empId)), {...emp, discounts:emp.discounts.filter(d=>d.id!==discountId)})
  }

  const addGratification = async (empId:number) => {
    setGratifError('')
    if (!gratifForm.value||isNaN(Number(gratifForm.value))||Number(gratifForm.value)<=0) { setGratifError('Valor inválido'); return }
    if (!gratifForm.reason.trim()) { setGratifError('Informe o motivo'); return }
    const emp = employees.find(e=>e.id===empId); if (!emp) return
    const g: Discount = { id:Date.now(), value:Number(gratifForm.value), reason:gratifForm.reason.trim(), date:formatDateShort(new Date()) }
    await setDoc(doc(db, empCol, String(empId)), {...emp, gratifications:[...(emp.gratifications||[]),g]})
    setGratifForm({ value:'', reason:'' }); setGratifTarget(null); setIsAddingGratif(false)
  }

  const removeGratification = async (empId:number, gratifId:number) => {
    const emp = employees.find(e=>e.id===empId); if (!emp) return
    await setDoc(doc(db, empCol, String(empId)), {...emp, gratifications:(emp.gratifications||[]).filter(g=>g.id!==gratifId)})
  }

  const markDayOff = async (empId:number, date:string, type:'paid'|'unpaid'|null) => {
    const state = getState(empId)
    const dailyOff = {...(state.dailyOff||{})}
    if (type===null) delete dailyOff[date]; else dailyOff[date]=type
    await setDoc(doc(db, recCol, String(empId)), {
      ...state, dailyOff,
      log:state.log.map(e=>({type:e.type,time:e.time.toISOString()})),
      workStart:state.workStart?state.workStart.toISOString():null,
      breakStart:state.breakStart?state.breakStart.toISOString():null,
    })
  }

  const saveEditedHours = async (empId:number, date:string, h:number, m:number, otRate?:number) => {
    const ms = (h*60+m)*60000
    const state = getState(empId)
    const oldMs = (state.dailyWork||{})[date]||0
    const diff = ms-oldMs
    const newDailyWork = {...(state.dailyWork||{}), [date]:ms}
    const newTotalWork = Math.max(0,(state.totalWork||0)+diff)
    let newDays = [...(state.days||[])]
    if (ms>0&&!newDays.includes(date)) newDays=[...newDays,date]
    if (ms===0) newDays=newDays.filter(d=>d!==date)
    const newOvertimeRate = {...(state.dailyOvertimeRate||{})}
    if (otRate!==undefined) newOvertimeRate[date]=otRate
    await setDoc(doc(db, recCol, String(empId)), {
      ...state, dailyWork:newDailyWork, totalWork:newTotalWork, days:newDays, dailyOvertimeRate:newOvertimeRate,
      log:state.log.map(e=>({type:e.type,time:e.time.toISOString()})),
      workStart:state.workStart?state.workStart.toISOString():null,
      breakStart:state.breakStart?state.breakStart.toISOString():null,
    })
    setEditingDay(null); setEditHours(''); setEditMinutes('')
  }

  const generateHolerite = async (emp:Employee, _state:EmpState, payment:ReturnType<typeof calcPayment>, holeriteMonth: string) => {
    if (!(window as any).jspdf) {
      await new Promise<void>((resolve,reject) => {
        const s = document.createElement('script')
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        s.onload=()=>resolve(); s.onerror=()=>reject()
        document.head.appendChild(s)
      })
    }
    const { jsPDF } = (window as any).jspdf
    const jdoc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    const W=210, margin=16
    let y=0
    const col2 = W/2+2, rowH=7
    const rect = (x:number,yy:number,w:number,h:number,fill?:string) => {
      if (fill) { jdoc.setFillColor(fill); jdoc.rect(x,yy,w,h,'F') }
    }
    const txt = (t:string,x:number,yy:number,opts?:{size?:number;bold?:boolean;color?:string;align?:'left'|'right'|'center'}) => {
      jdoc.setFontSize(opts?.size||9)
      jdoc.setFont('helvetica',opts?.bold?'bold':'normal')
      if (opts?.color) { const [r,g,b]=opts.color.match(/\w\w/g)!.map(h=>parseInt(h,16)); jdoc.setTextColor(r,g,b) } else jdoc.setTextColor(30,30,30)
      jdoc.text(t,x,yy,{align:opts?.align||'left'})
    }
    const ln = (x1:number,yy:number,x2:number,color='#e2e8f0') => {
      const [r,g,b]=color.match(/\w\w/g)!.map(h=>parseInt(h,16))
      jdoc.setDrawColor(r,g,b); jdoc.setLineWidth(0.3); jdoc.line(x1,yy,x2,yy)
    }
    rect(0,0,W,36,'#1e293b'); y=10
    if (company?.logo) {
      try { jdoc.addImage(company.logo,'AUTO',margin,4,28,28,'','FAST') } catch(_) {}
      const tx=margin+32
      txt(company?.name||'PontoApp',tx,y+2,{size:14,bold:true,color:'#f1f5f9'})
      if (company?.cnpj) txt(`CNPJ: ${company.cnpj}`,tx,y+8,{size:8,color:'#94a3b8'})
      if (company?.address) txt(company.address,tx,y+14,{size:7,color:'#94a3b8'})
      if (company?.phone||company?.email) txt([company.phone,company.email].filter(Boolean).join('  |  '),tx,y+20,{size:7,color:'#94a3b8'})
    } else {
      txt(company?.name||'PontoApp',margin,y+4,{size:16,bold:true,color:'#f1f5f9'})
      if (company?.cnpj) txt(`CNPJ: ${company.cnpj}`,margin,y+11,{size:8,color:'#94a3b8'})
      if (company?.address) txt(company.address,margin,y+17,{size:7,color:'#94a3b8'})
    }
    txt('HOLERITE',W-margin,y+2,{size:13,bold:true,color:'#6366f1',align:'right'})
    const [hYear,hMon]=holeriteMonth.split('-').map(Number)
    const holeriteDate = new Date(hYear,hMon-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
    txt(holeriteDate,W-margin,y+9,{size:8,color:'#94a3b8',align:'right'})
    txt(`Gerado: ${new Date().toLocaleString('pt-BR')}`,W-margin,y+15,{size:7,color:'#64748b',align:'right'})
    y=42
    rect(margin,y,W-margin*2,6,'#f8fafc')
    txt('DADOS DO FUNCIONÁRIO',margin+2,y+4.5,{size:8,bold:true,color:'#475569'})
    y+=8
    const empRows=[
      ['Nome',emp.name,'Cargo',emp.role],
      ['CPF',emp.cpf||'—','Admissão',emp.admission?new Date(emp.admission+'T12:00:00').toLocaleDateString('pt-BR'):'—'],
      ['Pagamento',emp.payType==='hour'?'Por Hora':'Por Dia','Salário Base',fmt(emp.payValue)+(emp.payType==='hour'?'/h':'/dia')],
    ]
    empRows.forEach((row,i)=>{
      if(i%2===0) rect(margin,y,W-margin*2,rowH,'#f8fafc')
      txt(row[0],margin+2,y+5,{size:7.5,color:'#64748b'}); txt(row[1],margin+30,y+5,{size:8,bold:true})
      txt(row[2],col2+2,y+5,{size:7.5,color:'#64748b'}); txt(row[3],col2+30,y+5,{size:8,bold:true})
      ln(margin,y+rowH,W-margin); y+=rowH
    })
    y+=6
    rect(margin,y,W-margin*2,6,'#f0fdf4')
    txt('PROVENTOS',margin+2,y+4.5,{size:8,bold:true,color:'#16a34a'})
    y+=8
    const earnings: [string,string,string][] = [
      ['Horas/Dias Trabalhados',`${formatHours(payment.totalMs)} | ${payment.daysWorked} dia(s)`,fmt(payment.regularValue)],
    ]
    Object.entries(payment.overtimeByRate).sort(([a],[b])=>Number(a)-Number(b)).forEach(([rate,ms])=>{
      const hv=emp.payType==='hour'?emp.payValue:emp.payValue/emp.hoursPerDay
      earnings.push([`Hora Extra +${rate}%`,formatHours(ms as number),fmt((ms as number)/3600000*hv*(1+Number(rate)/100))])
    })
    if (payment.nightMs>0) earnings.push(['Adicional Noturno (20%)',formatHours(payment.nightMs),fmt(payment.nightBonus)])
    ;(emp.gratifications||[]).forEach(g=>earnings.push([`Gratificação: ${g.reason}`,g.date,fmt(g.value)]))
    earnings.forEach((row,i)=>{
      if(i%2===0) rect(margin,y,W-margin*2,rowH,'#f8fafc')
      txt(row[0],margin+2,y+5,{size:8}); txt(row[1],W/2,y+5,{size:8,color:'#475569',align:'center'})
      txt(row[2],W-margin-2,y+5,{size:8,bold:true,color:'#16a34a',align:'right'})
      ln(margin,y+rowH,W-margin); y+=rowH
    })
    rect(margin,y,W-margin*2,7,'#dcfce7')
    txt('TOTAL PROVENTOS',margin+2,y+5,{size:8.5,bold:true,color:'#15803d'})
    txt(fmt(payment.grossValue),W-margin-2,y+5,{size:9,bold:true,color:'#15803d',align:'right'})
    y+=10
    rect(margin,y,W-margin*2,6,'#fef2f2')
    txt('DESCONTOS',margin+2,y+4.5,{size:8,bold:true,color:'#dc2626'})
    y+=8
    const deductions: [string,string,string][] = []
    ;(emp.discounts||[]).forEach(d=>deductions.push([d.reason,d.date,fmt(d.value)]))
    const fgtsVal = emp.fgts ? payment.grossValue*0.08 : 0
    if (emp.fgts) deductions.push(['FGTS (8%)','—',fmt(fgtsVal)])
    if (deductions.length===0) { txt('Nenhum desconto.',margin+2,y+5,{size:8,color:'#94a3b8'}); y+=rowH }
    else {
      deductions.forEach((row,i)=>{
        if(i%2===0) rect(margin,y,W-margin*2,rowH,'#fff5f5')
        txt(row[0],margin+2,y+5,{size:8}); txt(row[1],W/2,y+5,{size:8,color:'#475569',align:'center'})
        txt(`- ${row[2]}`,W-margin-2,y+5,{size:8,bold:true,color:'#dc2626',align:'right'})
        ln(margin,y+rowH,W-margin); y+=rowH
      })
    }
    rect(margin,y,W-margin*2,7,'#fee2e2')
    txt('TOTAL DESCONTOS',margin+2,y+5,{size:8.5,bold:true,color:'#dc2626'})
    txt(`- ${fmt(payment.totalDeductions+fgtsVal)}`,W-margin-2,y+5,{size:9,bold:true,color:'#dc2626',align:'right'})
    y+=12
    rect(margin,y,W-margin*2,12,'#1e293b')
    txt('VALOR LÍQUIDO A RECEBER',margin+4,y+8,{size:10,bold:true,color:'#f1f5f9'})
    txt(fmt(payment.net-fgtsVal),W-margin-4,y+8,{size:13,bold:true,color:'#4ade80',align:'right'})
    y+=16
    ln(margin,y+14,margin+70); ln(W-margin-70,y+14,W-margin)
    txt('Assinatura do Empregador',margin+35,y+18,{size:7,color:'#94a3b8',align:'center'})
    txt('Assinatura do Funcionário',W-margin-35,y+18,{size:7,color:'#94a3b8',align:'center'})
    y+=24; ln(margin,y,W-margin)
    txt('Documento gerado automaticamente pelo PontoApp.',W/2,y+4,{size:6.5,color:'#94a3b8',align:'center'})
    jdoc.save(`Holerite_${emp.name.replace(/\s+/g,'_')}_${holeriteMonth}.pdf`)
  }

  // Live values
  const empState = loggedIn?.role==='employee' ? getState(loggedIn.id) : null
  const liveWork = empState ? (empState.totalWork||0)+(empState.workStart?now.getTime()-empState.workStart.getTime():0) : 0
  const liveBreak = empState ? (empState.totalBreak||0)+(empState.breakStart?now.getTime()-empState.breakStart.getTime():0) : 0
  const myEmpData = loggedIn?.role==='employee' ? employees.find(e=>e.id===loggedIn.id) : null
  const empPayment = myEmpData&&empState ? calcPayment(myEmpData,empState,liveWork) : null
  const todayStr = TODAY()
  const todayLiveWork = empState ? ((empState.dailyWork||{})[todayStr]||0)+(empState.workStart?now.getTime()-empState.workStart.getTime():0) : 0

  const handleLogin = () => {
    setLoginError('')
    // Admin da empresa (credenciais vindas do Firestore)
    if (companyMeta && loginUser===companyMeta.adminUsername && loginPass===companyMeta.adminPassword) {
      setLoggedIn({id:0,name:'Administrador',username:companyMeta.adminUsername,avatar:'AD',role:'admin',payType:'day',payValue:0,hoursPerDay:8,discounts:[],companySlug:slug})
      setView('list'); return
    }
    const emp = employees.find(e=>e.username===loginUser&&e.password===loginPass)
    if (emp) { setLoggedIn({...emp,role:'employee'}); setView('clock'); return }
    setLoginError('Usuário ou senha incorretos.')
  }

  const handleLogout = () => { setLoggedIn(null); setLoginUser(''); setLoginPass(''); setLoginError('') }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Courier New',monospace" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⏱</div>
        <div style={{ fontSize:14, color:'#475569', letterSpacing:2 }}>CARREGANDO...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', justifyContent:'center', fontFamily:"'Courier New',monospace" }}>
      <div style={{ width:'100%', maxWidth:420, minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column' }}>
        <div style={{ height:3, background:'linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)' }} />

        {/* Header */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            {/* Botão voltar para trocar de empresa */}
            {!loggedIn && (
              <button onClick={onLogout} style={{ background:'none', border:'none', cursor:'pointer', fontSize:10, color:'#475569', fontFamily:'inherit', marginBottom:2, padding:0 }}>← trocar empresa</button>
            )}
            <div style={{ fontSize:9, letterSpacing:4, color:'#475569', textTransform:'uppercase' }}>
              {companyMeta?.name || slug}
            </div>
            <div style={{ fontSize:20, fontWeight:900, color:'#f1f5f9' }}>⏱ PontoApp</div>
          </div>
          <div style={{ textAlign:'right', background:'#1e293b', borderRadius:12, padding:'8px 14px', border:'1px solid #334155' }}>
            <div style={{ fontSize:17, fontWeight:700, color:'#06b6d4' }}>{formatTime(now)}</div>
            <div style={{ fontSize:9, color:'#64748b', textTransform:'capitalize' }}>{formatDate(now).split(',')[0]}</div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px 24px' }}>

          {/* LOGIN */}
          {!loggedIn && (
            <div style={{ display:'flex', flexDirection:'column', minHeight:'calc(100vh - 140px)', justifyContent:'center' }}>
              <div style={{ textAlign:'center', marginBottom:36 }}>
                {company?.logo ? (
                  <img src={company.logo} alt="Logo" style={{ maxHeight:72, maxWidth:200, borderRadius:12, objectFit:'contain', marginBottom:16 }} />
                ) : (
                  <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,#6366f1,#06b6d4)', boxShadow:'0 0 40px #6366f140', marginBottom:20, fontSize:32 }}>⏱</div>
                )}
                <div style={{ fontSize:26, fontWeight:900, color:'#f1f5f9' }}>{company?.name || companyMeta?.name || 'PontoApp'}</div>
                <div style={{ fontSize:12, color:'#475569', marginTop:6, letterSpacing:2, textTransform:'uppercase' }}>Controle de Ponto Digital</div>
              </div>
              <div style={{ background:'linear-gradient(160deg,#1e293b,#162032)', borderRadius:20, padding:'28px 24px', border:'1px solid #334155', marginBottom:16 }}>
                <Input label="Usuário" value={loginUser} onChange={setLoginUser} placeholder="Digite seu usuário" />
                <Input label="Senha" type="password" value={loginPass} onChange={setLoginPass} placeholder="••••••••" error={loginError} />
                <button onClick={handleLogin} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'#fff', fontSize:14, fontWeight:800, fontFamily:'inherit', marginTop:8 }}>
                  ENTRAR NO SISTEMA →
                </button>
              </div>
            </div>
          )}

          {/* FUNCIONÁRIO */}
          {loggedIn?.role==='employee' && empState && (
            <>
              <div style={{ display:'flex', gap:6, marginBottom:16 }}>
                {[['clock','🕐 Ponto'],['payment','💰 Pagamento'],['history','📋 Histórico']].map(([k,l])=>(
                  <button key={k} onClick={()=>setView(k)} style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'inherit', background:view===k?'#6366f1':'#1e293b', color:view===k?'#fff':'#64748b' }}>{l}</button>
                ))}
              </div>

              {view==='clock' && (
                <>
                  <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius:16, padding:18, marginBottom:14, border:`1px solid ${statusColor[empState.status]}40` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', background:'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>{loggedIn.avatar}</div>
                        <div>
                          <div style={{ fontSize:15, fontWeight:800, color:'#f1f5f9' }}>{loggedIn.name}</div>
                          <div style={{ fontSize:11, color:'#64748b' }}>{loggedIn.role}</div>
                        </div>
                      </div>
                      <div style={{ padding:'5px 12px', borderRadius:20, background:`${statusColor[empState.status]}20`, border:`1px solid ${statusColor[empState.status]}60`, fontSize:11, fontWeight:700, color:statusColor[empState.status] }}>
                        {statusLabel[empState.status]}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[
                        {label:'Hoje',val:msToHHMM(todayLiveWork),sub:formatDuration(todayLiveWork),color:'#22c55e'},
                        {label:'Pausas',val:formatDuration(liveBreak),sub:formatHours(liveBreak),color:'#f59e0b'},
                        {label:'A receber',val:empPayment?fmt(empPayment.net):fmt(0),sub:loggedIn.payType==='hour'?'por hora':'por dia',color:'#6366f1'},
                      ].map(({label,val,sub,color})=>(
                        <div key={label} style={{ flex:1, background:'#0f172a', borderRadius:10, padding:'10px 8px' }}>
                          <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase' }}>{label}</div>
                          <div style={{ fontSize:13, fontWeight:800, color, marginTop:3 }}>{val}</div>
                          <div style={{ fontSize:9, color:'#475569', marginTop:1 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {geofence && (
                    <div style={{ background:'#06b6d415', border:'1px solid #06b6d430', borderRadius:10, padding:'8px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
                      <span>📍</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'#06b6d4' }}>Ponto com restrição de local</div>
                        <div style={{ fontSize:10, color:'#475569' }}>Raio: {geofence.radius}m · {geofence.address}</div>
                      </div>
                    </div>
                  )}
                  {punchChecking && <div style={{ background:'#6366f115', border:'1px solid #6366f140', borderRadius:10, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#a5b4fc', fontWeight:600, textAlign:'center' }}>🔍 Verificando localização...</div>}
                  {punchBlocked && <div style={{ background:'#ef444415', border:'1px solid #ef444440', borderRadius:10, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#ef4444', fontWeight:600 }}>{punchBlocked}</div>}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                    {[
                      {type:'entrada',label:'Entrada',icon:'▶',color:'#22c55e',disabled:empState.status!==STATUS.OUT},
                      {type:'inicio_pausa',label:'Pausar',icon:'⏸',color:'#f59e0b',disabled:empState.status!==STATUS.IN},
                      {type:'fim_pausa',label:'Retornar',icon:'↩',color:'#3b82f6',disabled:empState.status!==STATUS.BREAK},
                      {type:'saida',label:'Saída',icon:'■',color:'#ef4444',disabled:empState.status===STATUS.OUT},
                    ].map(({type,label,icon,color,disabled})=>(
                      <button key={type} onClick={()=>!disabled&&punch(type)} style={{ padding:'16px 0', borderRadius:12, border:`1px solid ${disabled?'#334155':color+'60'}`, cursor:disabled?'not-allowed':'pointer', background:disabled?'#1e293b':`${color}20`, color:disabled?'#334155':color, fontSize:13, fontWeight:800, fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:20 }}>{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                  {empState.dailyWork&&Object.keys(empState.dailyWork).length>0 && (
                    <div style={{ background:'#1e293b', borderRadius:12, padding:14, marginBottom:14, border:'1px solid #334155' }}>
                      <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:10 }}>📅 Horas por Dia</div>
                      {Object.entries(empState.dailyWork).sort(([a],[b])=>b.localeCompare(a)).slice(0,7).map(([date,ms])=>{
                        const [y,mo,d]=date.split('-')
                        return (
                          <div key={date} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'#0f172a', borderRadius:8, marginBottom:4 }}>
                            <span style={{ fontSize:12, color:'#cbd5e1' }}>{d}/{mo}/{y}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>{msToHHMM(ms as number)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {view==='payment' && empPayment && myEmpData && (
                <div>
                  <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius:16, padding:18, marginBottom:14, border:'1px solid #22c55e30', textAlign:'center' }}>
                    <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:8 }}>Meu Pagamento</div>
                    <div style={{ fontSize:36, fontWeight:900, color:'#22c55e' }}>{fmt(empPayment.net)}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>Valor líquido a receber</div>
                  </div>
                  {[
                    {label:'⏱ Horas Trabalhadas',val:formatHours(empPayment.totalMs),sub:formatDuration(empPayment.totalMs),color:'#22c55e'},
                    {label:'☕ Em Pausas',val:formatHours(empPayment.breakMs),sub:formatDuration(empPayment.breakMs),color:'#f59e0b'},
                    {label:'📅 Dias Trabalhados',val:empPayment.daysWorked+' dia(s)',sub:'',color:'#06b6d4'},
                    {label:'💵 Valor Bruto',val:fmt(empPayment.grossValue),sub:'',color:'#6366f1'},
                  ].map(({label,val,sub,color})=>(
                    <div key={label} style={{ background:'#1e293b', borderRadius:12, padding:'12px 14px', border:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:12, color:'#94a3b8', fontWeight:600 }}>{label}</div>
                        {sub&&<div style={{ fontSize:10, color:'#475569', marginTop:2 }}>{sub}</div>}
                      </div>
                      <div style={{ fontSize:14, fontWeight:800, color }}>{val}</div>
                    </div>
                  ))}
                  {empPayment.nightMs>0 && (
                    <div style={{ background:'#1e293b', borderRadius:12, padding:'12px 14px', border:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ fontSize:12, color:'#94a3b8', fontWeight:600 }}>🌙 Adicional Noturno (+20%)</div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#818cf8' }}>{fmt(empPayment.nightBonus)}</div>
                    </div>
                  )}
                  {(myEmpData.gratifications||[]).length>0 && (
                    <div style={{ background:'#1e293b', borderRadius:12, padding:'12px 14px', border:'1px solid #22c55e30', marginBottom:8 }}>
                      <div style={{ fontSize:10, color:'#22c55e', textTransform:'uppercase', letterSpacing:2, marginBottom:8 }}>⭐ Gratificações</div>
                      {myEmpData.gratifications.map(g=>(
                        <div key={g.id} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:12, color:'#86efac' }}>{g.reason}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'#22c55e' }}>+ {fmt(g.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ background:'#22c55e20', border:'1px solid #22c55e60', borderRadius:14, padding:16, textAlign:'center', marginTop:8 }}>
                    <div style={{ fontSize:10, color:'#4ade80', textTransform:'uppercase', letterSpacing:2, marginBottom:6 }}>Total a Receber</div>
                    <div style={{ fontSize:30, fontWeight:900, color:'#22c55e' }}>{fmt(empPayment.net)}</div>
                  </div>
                </div>
              )}

              {view==='history' && (
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:12 }}>Meu Histórico</div>
                  {empState.log.length===0 ? (
                    <div style={{ textAlign:'center', padding:'50px 0', color:'#475569' }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                      <div style={{ fontSize:13 }}>Nenhum registro ainda</div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {[...empState.log].reverse().map((entry,i)=>(
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:'#1e293b', borderRadius:10, borderLeft:`3px solid ${typeColor[entry.type]}` }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{typeLabel[entry.type]}</div>
                            <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{formatDateShort(entry.time)}</div>
                          </div>
                          <div style={{ fontSize:14, fontWeight:700, color:typeColor[entry.type] }}>{formatTime(entry.time)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ADMIN */}
          {loggedIn?.role==='admin' && (
            <>
              <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
                {[['list','👥 Equipe'],['reports','💰 Pagamentos'],['monthly','📅 Mapa'],['geofence','📍 Local'],['empresa','🏢 Empresa']].map(([k,l])=>(
                  <button key={k} onClick={()=>{setView(k);if(k==='list')setAdminView('list')}} style={{ flex:1, minWidth:60, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', fontSize:9, fontWeight:700, fontFamily:'inherit', background:view===k?'#6366f1':'#1e293b', color:view===k?'#fff':'#64748b' }}>{l}</button>
                ))}
              </div>

              {/* EQUIPE */}
              {view==='list' && (
                <>
                  {successMsg && <div style={{ background:'#16a34a20', border:'1px solid #22c55e60', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#22c55e', fontWeight:600 }}>✅ {successMsg}</div>}
                  {adminView==='list' && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase' }}>Funcionários</div>
                          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{employees.length} cadastrado(s)</div>
                        </div>
                        <Btn small onClick={()=>{setForm({name:'',role:'',username:'',password:'',payType:'day',payValue:'',hoursPerDay:'8',overtimeRate:'50',cpf:'',admission:'',fgts:false});setFormErrors({});setEditingEmp(null);setAdminView('new')}}>+ Novo</Btn>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {employees.map(emp=>{
                          const st=getState(emp.id)
                          const tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0)
                          const pay=calcPayment(emp,st,tw)
                          return (
                            <div key={emp.id} style={{ background:'#1e293b', borderRadius:14, padding:14, border:'1px solid #334155' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                  <div style={{ width:40, height:40, borderRadius:'50%', background:'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', position:'relative' }}>
                                    {emp.avatar}
                                    <div style={{ position:'absolute', bottom:0, right:0, width:9, height:9, borderRadius:'50%', background:statusColor[st.status], border:'1.5px solid #1e293b' }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{emp.name}</div>
                                    <div style={{ fontSize:10, color:'#64748b' }}>{emp.role} · {emp.payType==='hour'?fmt(emp.payValue)+'/h':fmt(emp.payValue)+'/dia'}</div>
                                  </div>
                                </div>
                                <div style={{ display:'flex', gap:6 }}>
                                  <Btn small outline color="#6366f1" onClick={()=>startEdit(emp)}>✏️</Btn>
                                  <Btn small outline color="#ef4444" onClick={()=>deleteEmployee(emp.id)}>🗑</Btn>
                                </div>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                                {[
                                  {label:'Horas',val:formatHours(tw),color:'#22c55e'},
                                  {label:'Descontos',val:(emp.discounts||[]).length>0?'- '+fmt((emp.discounts||[]).reduce((s,d)=>s+d.value,0)):'Nenhum',color:(emp.discounts||[]).length>0?'#ef4444':'#475569'},
                                  {label:'A receber',val:fmt(pay.net),color:'#6366f1'},
                                ].map(({label,val,color})=>(
                                  <div key={label} style={{ background:'#0f172a', borderRadius:8, padding:'7px 8px' }}>
                                    <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase' }}>{label}</div>
                                    <div style={{ fontSize:11, fontWeight:700, color, marginTop:2 }}>{val}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {(adminView==='new'||adminView==='edit') && (
                    <div style={{ background:'#1e293b', borderRadius:16, padding:18, border:'1px solid #334155' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                        <div style={{ fontSize:15, fontWeight:800, color:'#f1f5f9' }}>{adminView==='new'?'➕ Novo Funcionário':'✏️ Editar'}</div>
                        <Btn small outline color="#64748b" onClick={()=>{setAdminView('list');setFormErrors({})}}>← Voltar</Btn>
                      </div>
                      <Input label="Nome Completo" value={form.name} onChange={v=>setForm((f:any)=>({...f,name:v}))} placeholder="Ex: João da Silva" error={formErrors.name} />
                      <Input label="Cargo" value={form.role} onChange={v=>setForm((f:any)=>({...f,role:v}))} placeholder="Ex: Operador" error={formErrors.role} />
                      <Input label="Usuário (login)" value={form.username} onChange={v=>setForm((f:any)=>({...f,username:v}))} placeholder="Ex: joao.silva" error={formErrors.username} />
                      <Input label={adminView==='edit'?'Nova Senha (em branco = manter)':'Senha'} type="password" value={form.password} onChange={v=>setForm((f:any)=>({...f,password:v}))} placeholder="Digite a senha" error={formErrors.password} />
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:8 }}>Tipo de Pagamento</div>
                        <div style={{ display:'flex', background:'#0f172a', borderRadius:10, padding:4 }}>
                          <button onClick={()=>setForm((f:any)=>({...f,payType:'day'}))} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', background:form.payType==='day'?'#6366f1':'transparent', color:form.payType==='day'?'#fff':'#64748b' }}>📅 Por Dia</button>
                          <button onClick={()=>setForm((f:any)=>({...f,payType:'hour'}))} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', background:form.payType==='hour'?'#6366f1':'transparent', color:form.payType==='hour'?'#fff':'#64748b' }}>⏱ Por Hora</button>
                        </div>
                      </div>
                      <Input label={form.payType==='day'?'Valor por Dia (R$)':'Valor por Hora (R$)'} type="number" value={form.payValue} onChange={v=>setForm((f:any)=>({...f,payValue:v}))} placeholder={form.payType==='day'?'Ex: 120.00':'Ex: 15.00'} error={formErrors.payValue} />
                      <Input label="Horas por Dia (jornada)" type="number" value={form.hoursPerDay} onChange={v=>setForm((f:any)=>({...f,hoursPerDay:v}))} placeholder="Ex: 8" />
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:8 }}>⚡ % Hora Extra padrão</div>
                        <div style={{ display:'flex', background:'#0f172a', borderRadius:10, padding:4, gap:2 }}>
                          {(['50','70','100'] as const).map(rate=>(
                            <button key={rate} onClick={()=>setForm((f:any)=>({...f,overtimeRate:rate}))} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', background:form.overtimeRate===rate?'#f59e0b':'transparent', color:form.overtimeRate===rate?'#000':'#64748b' }}>+{rate}%</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ paddingTop:14, borderTop:'1px solid #1e293b', marginBottom:14 }}>
                        <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:10 }}>📋 Dados para Holerite</div>
                        <Input label="CPF" value={form.cpf||''} onChange={v=>setForm((f:any)=>({...f,cpf:v}))} placeholder="000.000.000-00" />
                        <Input label="Data de Admissão" type="date" value={form.admission||''} onChange={v=>setForm((f:any)=>({...f,admission:v}))} placeholder="" />
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#0f172a', borderRadius:10, marginBottom:14 }}>
                          <input type="checkbox" id="fgts" checked={form.fgts||false} onChange={e=>setForm((f:any)=>({...f,fgts:e.target.checked}))} style={{ width:18, height:18, accentColor:'#6366f1', cursor:'pointer' }} />
                          <label htmlFor="fgts" style={{ fontSize:12, color:'#94a3b8', cursor:'pointer', fontWeight:600 }}>Funcionário com FGTS (CLT)</label>
                        </div>
                      </div>
                      <Btn full onClick={saveEmployee} color="#6366f1">{adminView==='new'?'✅ Cadastrar':'💾 Salvar'}</Btn>
                    </div>
                  )}
                </>
              )}

              {/* PAGAMENTOS */}
              {view==='reports' && (
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:14 }}>Relatório de Pagamentos</div>

                  {/* Seletor de mês */}
                  <div style={{ background:'#1e293b', borderRadius:12, padding:'12px 14px', marginBottom:14, border:'1px solid #334155', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13 }}>📅</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:4 }}>Competência</div>
                      <input type="month" value={reportMonth} onChange={e=>{setReportMonth(e.target.value);setExpandedReport(null)}}
                        style={{ background:'transparent', border:'none', color:'#f1f5f9', fontSize:14, fontWeight:800, fontFamily:"'Courier New',monospace", outline:'none', cursor:'pointer', width:'100%' }} />
                    </div>
                    <button onClick={()=>{const d=new Date();setReportMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setExpandedReport(null)}}
                      style={{ background:'#6366f120', border:'1px solid #6366f140', borderRadius:8, padding:'5px 10px', cursor:'pointer', fontSize:10, color:'#a5b4fc', fontFamily:'inherit', fontWeight:700, whiteSpace:'nowrap' }}>
                      Mês atual
                    </button>
                  </div>

                  <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius:16, padding:16, marginBottom:14, border:'1px solid #22c55e30' }}>
                    <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:2, marginBottom:6 }}>💰 Total a Pagar · {new Date(reportMonth+'-02').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</div>
                    <div style={{ fontSize:30, fontWeight:900, color:'#22c55e' }}>
                      {fmt(employees.reduce((sum,emp)=>{
                        const st=getState(emp.id); const tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0)
                        return sum+calcPayment(emp,st,tw,reportMonth).net
                      },0))}
                    </div>
                    <div style={{ fontSize:11, color:'#16a34a', marginTop:4 }}>{employees.length} funcionário(s)</div>
                  </div>
                  {employees.map(emp=>{
                    const st=getState(emp.id)
                    const tw=(st.totalWork||0)+(st.workStart?now.getTime()-st.workStart.getTime():0)
                    const pay=calcPayment(emp,st,tw,reportMonth)
                    const isOpen=expandedReport===emp.id
                    const isAddingDiscount=discountTarget===emp.id
                    const isAddingGratifHere=gratifTarget===emp.id&&isAddingGratif
                    return (
                      <div key={emp.id} style={{ background:'#1e293b', borderRadius:14, padding:16, marginBottom:12, border:'1px solid #334155' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:isOpen?14:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:38, height:38, borderRadius:'50%', background:'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff' }}>{emp.avatar}</div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{emp.name}</div>
                              <div style={{ fontSize:10, color:'#64748b' }}>{emp.payType==='hour'?fmt(emp.payValue)+'/h':fmt(emp.payValue)+'/dia'}</div>
                            </div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:16, fontWeight:800, color:'#22c55e' }}>{fmt(pay.net)}</div>
                            <button onClick={()=>setExpandedReport(isOpen?null:emp.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:10, color:'#6366f1', fontFamily:'inherit', fontWeight:700, marginTop:2 }}>
                              {isOpen?'fechar ▲':'detalhes ▼'}
                            </button>
                          </div>
                        </div>
                        {isOpen && (
                          <div>
                            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                              {[
                                {label:'⏱ Horas',val:formatHours(pay.totalMs)+' ('+formatDuration(pay.totalMs)+')',color:'#22c55e'},
                                {label:'📅 Dias',val:pay.daysWorked+' dia(s)',color:'#06b6d4'},
                                {label:'💵 Bruto',val:fmt(pay.grossValue),color:'#6366f1'},
                                ...(pay.overtimeMs>0?[{label:`⚡ Hora Extra`,val:formatHours(pay.overtimeMs),color:'#f59e0b'}]:[]),
                                ...(pay.nightMs>0?[{label:'🌙 Adicional Noturno',val:fmt(pay.nightBonus),color:'#818cf8'}]:[]),
                              ].map(({label,val,color})=>(
                                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', background:'#0f172a', borderRadius:8 }}>
                                  <span style={{ fontSize:11, color:'#94a3b8' }}>{label}</span>
                                  <span style={{ fontSize:12, fontWeight:700, color }}>{val}</span>
                                </div>
                              ))}
                            </div>
                            {/* Descontos */}
                            <div style={{ background:'#0f172a', borderRadius:12, padding:12, marginBottom:12, border:'1px solid #ef444425' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <div style={{ fontSize:10, letterSpacing:2, color:'#ef4444', textTransform:'uppercase' }}>⬇ Descontos</div>
                                <button onClick={()=>{setDiscountTarget(isAddingDiscount?null:emp.id);setDiscountForm({value:'',reason:''});setDiscountError('')}}
                                  style={{ background:'#ef444420', border:'1px solid #ef444440', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:700, color:'#ef4444', fontFamily:'inherit' }}>
                                  {isAddingDiscount?'✕ Cancelar':'+ Desconto'}
                                </button>
                              </div>
                              {isAddingDiscount && (
                                <div style={{ background:'#1e293b', borderRadius:10, padding:12, marginBottom:10, border:'1px solid #334155' }}>
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Valor (R$)</div>
                                    <input type="number" value={discountForm.value} onChange={e=>setDiscountForm(f=>({...f,value:e.target.value}))} placeholder="Ex: 50.00"
                                      style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                                  </div>
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Motivo</div>
                                    <textarea value={discountForm.reason} onChange={e=>setDiscountForm(f=>({...f,reason:e.target.value}))} placeholder="Ex: Falta não justificada..."
                                      rows={2} style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:12, fontFamily:'inherit', outline:'none', resize:'none' }} />
                                  </div>
                                  {discountError && <div style={{ fontSize:11, color:'#ef4444', marginBottom:8 }}>⚠️ {discountError}</div>}
                                  <Btn full onClick={()=>addDiscount(emp.id)} color="#ef4444">✅ Confirmar</Btn>
                                </div>
                              )}
                              {(emp.discounts||[]).length===0&&!isAddingDiscount&&<div style={{ fontSize:12, color:'#475569', textAlign:'center', padding:'8px 0' }}>Nenhum desconto ainda</div>}
                              {(emp.discounts||[]).map(d=>(
                                <div key={d.id} style={{ background:'#1e293b', borderRadius:8, padding:'10px 12px', marginBottom:6, borderLeft:'3px solid #ef4444' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:'#fca5a5' }}>{d.reason}</div>
                                      <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>Lançado em {d.date}</div>
                                    </div>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                      <div style={{ fontSize:13, fontWeight:800, color:'#ef4444' }}>- {fmt(d.value)}</div>
                                      <button onClick={()=>removeDiscount(emp.id,d.id)} style={{ background:'#ef444420', border:'1px solid #ef444440', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:10, color:'#ef4444', fontFamily:'inherit' }}>🗑</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Gratificações */}
                            <div style={{ background:'#0f172a', borderRadius:12, padding:12, marginBottom:12, border:'1px solid #22c55e25' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <div style={{ fontSize:10, letterSpacing:2, color:'#22c55e', textTransform:'uppercase' }}>⭐ Gratificações</div>
                                <button onClick={()=>{setGratifTarget(isAddingGratifHere?null:emp.id);setIsAddingGratif(!isAddingGratifHere);setGratifForm({value:'',reason:''});setGratifError('')}}
                                  style={{ background:'#22c55e20', border:'1px solid #22c55e40', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:700, color:'#22c55e', fontFamily:'inherit' }}>
                                  {isAddingGratifHere?'✕ Cancelar':'+ Gratificação'}
                                </button>
                              </div>
                              {isAddingGratifHere && (
                                <div style={{ background:'#1e293b', borderRadius:10, padding:12, marginBottom:10, border:'1px solid #334155' }}>
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Valor (R$)</div>
                                    <input type="number" value={gratifForm.value} onChange={e=>setGratifForm(f=>({...f,value:e.target.value}))} placeholder="Ex: 100.00"
                                      style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                                  </div>
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Motivo</div>
                                    <textarea value={gratifForm.reason} onChange={e=>setGratifForm(f=>({...f,reason:e.target.value}))} placeholder="Ex: Bom desempenho..."
                                      rows={2} style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:12, fontFamily:'inherit', outline:'none', resize:'none' }} />
                                  </div>
                                  {gratifError && <div style={{ fontSize:11, color:'#ef4444', marginBottom:8 }}>⚠️ {gratifError}</div>}
                                  <Btn full onClick={()=>addGratification(emp.id)} color="#22c55e">✅ Confirmar</Btn>
                                </div>
                              )}
                              {(emp.gratifications||[]).length===0&&!isAddingGratifHere&&<div style={{ fontSize:12, color:'#475569', textAlign:'center', padding:'8px 0' }}>Nenhuma gratificação</div>}
                              {(emp.gratifications||[]).map(g=>(
                                <div key={g.id} style={{ background:'#1e293b', borderRadius:8, padding:'10px 12px', marginBottom:6, borderLeft:'3px solid #22c55e' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:'#86efac' }}>{g.reason}</div>
                                      <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>Lançado em {g.date}</div>
                                    </div>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                      <div style={{ fontSize:13, fontWeight:800, color:'#22c55e' }}>+ {fmt(g.value)}</div>
                                      <button onClick={()=>removeGratification(emp.id,g.id)} style={{ background:'#22c55e20', border:'1px solid #22c55e40', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:10, color:'#22c55e', fontFamily:'inherit' }}>🗑</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display:'flex', gap:8 }}>
                              <Btn full color="#6366f1" onClick={()=>generateHolerite(emp,getState(emp.id),pay,reportMonth)}>📄 Holerite PDF · {new Date(reportMonth+'-02').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}</Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* MAPA MENSAL */}
              {view==='monthly' && (
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:14 }}>📅 Mapa de Horas</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16 }}>
                    <input type="month" value={mapMonth} onChange={e=>setMapMonth(e.target.value)}
                      style={{ flex:1, background:'#1e293b', border:'1px solid #334155', borderRadius:10, padding:'10px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                    <select value={mapTarget??''} onChange={e=>setMapTarget(e.target.value?Number(e.target.value):null)}
                      style={{ flex:1, background:'#1e293b', border:'1px solid #334155', borderRadius:10, padding:'10px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }}>
                      <option value="">Todos</option>
                      {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  {(mapTarget?employees.filter(e=>e.id===mapTarget):employees).map(emp=>{
                    const state=getState(emp.id)
                    const [year,month]=mapMonth.split('-').map(Number)
                    const days=getDaysInMonth(year,month-1)
                    const monthTotal=days.reduce((s,d)=>s+(state.dailyWork[d]||0),0)
                    return (
                      <div key={emp.id} style={{ background:'#1e293b', borderRadius:14, padding:14, marginBottom:14, border:'1px solid #334155' }}>
                        <div style={{ fontSize:13, fontWeight:800, color:'#f1f5f9', marginBottom:12 }}>{emp.name}</div>
                        {days.map(date=>{
                          const ms=state.dailyWork[date]||0
                          const off=state.dailyOff?.[date]
                          const isToday=date===TODAY()
                          const [_y,mo,d]=date.split('-')
                          const dow=new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'})
                          const isEditing=editingDay?.empId===emp.id&&editingDay?.date===date
                          return (
                            <div key={date} style={{ display:'flex', flexDirection:'column', gap:0 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:isToday?'#6366f115':'#0f172a', borderRadius:8, marginBottom:4, border:isToday?'1px solid #6366f140':'1px solid transparent' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ fontSize:11, color:'#64748b', width:24 }}>{dow}</span>
                                  <span style={{ fontSize:12, color:'#94a3b8' }}>{d}/{mo}</span>
                                  {off && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:off==='paid'?'#22c55e20':'#f59e0b20', color:off==='paid'?'#22c55e':'#f59e0b', fontWeight:700 }}>{off==='paid'?'Folga Paga':'Folga'}</span>}
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <span style={{ fontSize:12, fontWeight:700, color:ms>0?'#22c55e':'#334155' }}>{ms>0?msToHHMM(ms):off?'—':'0h00'}</span>
                                  <button onClick={()=>{setEditingDay(isEditing?null:{empId:emp.id,date});if(!isEditing){const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);setEditHours(String(h));setEditMinutes(String(m))}}}
                                    style={{ background:'#334155', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:10, color:'#94a3b8', fontFamily:'inherit' }}>
                                    {isEditing?'✕':'✏️'}
                                  </button>
                                  <select value={off||''} onChange={e=>markDayOff(emp.id,date,(e.target.value as 'paid'|'unpaid'|null)||null)}
                                    style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:6, padding:'3px 6px', color:'#94a3b8', fontSize:10, fontFamily:'inherit', cursor:'pointer' }}>
                                    <option value="">—</option>
                                    <option value="paid">Folga Paga</option>
                                    <option value="unpaid">Folga</option>
                                  </select>
                                </div>
                              </div>
                              {isEditing && (
                                <div style={{ background:'#0f172a', borderRadius:10, padding:12, marginBottom:8, border:'1px solid #6366f140' }}>
                                  <div style={{ fontSize:10, color:'#6366f1', textTransform:'uppercase', letterSpacing:2, marginBottom:10 }}>✏️ Editar {d}/{mo}</div>
                                  <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Horas</div>
                                      <input type="number" min="0" max="23" value={editHours} onChange={e=>setEditHours(e.target.value)}
                                        style={{ width:'100%', boxSizing:'border-box', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:14, fontFamily:'inherit', outline:'none', textAlign:'center' }} />
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Minutos</div>
                                      <input type="number" min="0" max="59" value={editMinutes} onChange={e=>setEditMinutes(e.target.value)}
                                        style={{ width:'100%', boxSizing:'border-box', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'10px 12px', color:'#f1f5f9', fontSize:14, fontFamily:'inherit', outline:'none', textAlign:'center' }} />
                                    </div>
                                  </div>
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>⚡ % Hora Extra</div>
                                    <div style={{ display:'flex', gap:4 }}>
                                      {[50,70,100].map(r=>(
                                        <button key={r} onClick={()=>{}} style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit', background:(state.dailyOvertimeRate?.[date]??emp.overtimeRate)===r?'#f59e0b':'#1e293b', color:(state.dailyOvertimeRate?.[date]??emp.overtimeRate)===r?'#000':'#64748b' }}>+{r}%</button>
                                      ))}
                                    </div>
                                  </div>
                                  <div style={{ display:'flex', gap:8 }}>
                                    <Btn full color="#6366f1" onClick={()=>saveEditedHours(emp.id,date,Number(editHours)||0,Number(editMinutes)||0,state.dailyOvertimeRate?.[date]??emp.overtimeRate)}>💾 Salvar</Btn>
                                    <Btn full outline color="#64748b" onClick={()=>setEditingDay(null)}>Cancelar</Btn>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #334155', display:'flex', justifyContent:'space-between' }}>
                          <span style={{ fontSize:12, color:'#64748b' }}>Total do mês</span>
                          <span style={{ fontSize:14, fontWeight:800, color:'#22c55e' }}>{msToHHMM(monthTotal)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* GEOFENCE */}
              {view==='geofence' && (
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:14 }}>📍 Controle de Localização</div>
                  <div style={{ background:geofence?'#22c55e15':'#1e293b', border:`1px solid ${geofence?'#22c55e40':'#334155'}`, borderRadius:14, padding:16, marginBottom:16 }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:geofence?'#4ade80':'#475569', textTransform:'uppercase', marginBottom:8 }}>
                      {geofence?'🟢 Cerca Ativa':'🔴 Sem Restrição de Local'}
                    </div>
                    {geofence ? (
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:4 }}>{geofence.address}</div>
                        <div style={{ fontSize:11, color:'#64748b' }}>Raio: <span style={{ color:'#06b6d4', fontWeight:700 }}>{geofence.radius}m</span></div>
                        <button onClick={async()=>{await deleteDoc(cfgDoc('geofence'));setGeoForm({address:'',radius:'100'})}}
                          style={{ marginTop:12, padding:'8px 14px', borderRadius:8, border:'1px solid #ef444440', background:'#ef444415', color:'#ef4444', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                          🗑 Remover Cerca
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'#64748b' }}>Funcionários podem bater ponto de qualquer lugar.</div>
                    )}
                  </div>
                  <div style={{ background:'#1e293b', borderRadius:14, padding:16, border:'1px solid #334155' }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'#f1f5f9', marginBottom:14 }}>{geofence?'✏️ Alterar':'➕ Definir'} Localização</div>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Endereço</div>
                      <input value={geoForm.address} onChange={e=>setGeoForm(f=>({...f,address:e.target.value}))} placeholder="Ex: Av. Paulista, 1000, São Paulo, SP"
                        style={{ width:'100%', boxSizing:'border-box', background:'#0f172a', border:'1px solid #334155', borderRadius:10, padding:'12px 14px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                    </div>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:6 }}>Raio: <span style={{ color:'#06b6d4' }}>{geoForm.radius}m</span></div>
                      <input type="range" min="10" max="1000" step="10" value={geoForm.radius} onChange={e=>setGeoForm(f=>({...f,radius:e.target.value}))} style={{ width:'100%', accentColor:'#6366f1' }} />
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#334155', marginTop:4 }}>
                        <span>10m</span><span>500m</span><span>1000m</span>
                      </div>
                    </div>
                    {geoError && <div style={{ background:'#ef444415', border:'1px solid #ef444440', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#ef4444', marginBottom:12 }}>⚠️ {geoError}</div>}
                    {geoSuccess && <div style={{ background:'#22c55e15', border:'1px solid #22c55e40', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#22c55e', marginBottom:12 }}>✅ {geoSuccess}</div>}
                    <button onClick={saveGeofence} disabled={geoLoading}
                      style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', cursor:geoLoading?'wait':'pointer', background:geoLoading?'#334155':'linear-gradient(135deg,#6366f1,#4f46e5)', color:geoLoading?'#64748b':'#fff', fontSize:13, fontWeight:800, fontFamily:'inherit' }}>
                      {geoLoading?'🔍 Buscando...':'📍 Salvar Localização'}
                    </button>
                  </div>
                </div>
              )}

              {/* EMPRESA */}
              {view==='empresa' && (
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:'#475569', textTransform:'uppercase', marginBottom:14 }}>🏢 Dados da Empresa</div>
                  <div style={{ background:'#1e293b', borderRadius:14, padding:16, marginBottom:14, border:'1px solid #334155', textAlign:'center' }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:'#475569', textTransform:'uppercase', marginBottom:12 }}>Logo da Empresa</div>
                    {companyForm.logo ? (
                      <div style={{ marginBottom:10 }}>
                        <img src={companyForm.logo} alt="Logo" style={{ maxHeight:80, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} />
                      </div>
                    ) : (
                      <div style={{ width:80, height:80, borderRadius:12, background:'#0f172a', border:'2px dashed #334155', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:28 }}>🏢</div>
                    )}
                    <label style={{ background:'#6366f120', border:'1px solid #6366f140', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:11, fontWeight:700, color:'#a5b4fc', display:'inline-block' }}>
                      📷 {companyForm.logo?'Trocar Logo':'Enviar Logo'}
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                        const file=e.target.files?.[0]; if (!file) return
                        const reader=new FileReader()
                        reader.onload=ev=>setCompanyForm(f=>({...f,logo:ev.target?.result as string}))
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                    {companyForm.logo && (
                      <button onClick={()=>setCompanyForm(f=>({...f,logo:''}))}
                        style={{ marginLeft:8, background:'#ef444420', border:'1px solid #ef444440', borderRadius:8, padding:'8px 12px', cursor:'pointer', fontSize:11, color:'#ef4444', fontFamily:'inherit' }}>
                        🗑 Remover
                      </button>
                    )}
                  </div>
                  <Input label="Nome da Empresa" value={companyForm.name} onChange={v=>setCompanyForm(f=>({...f,name:v}))} placeholder="Ex: Empresa LTDA" />
                  <Input label="CNPJ" value={companyForm.cnpj} onChange={v=>setCompanyForm(f=>({...f,cnpj:v}))} placeholder="00.000.000/0000-00" />
                  <Input label="Endereço Completo" value={companyForm.address} onChange={v=>setCompanyForm(f=>({...f,address:v}))} placeholder="Rua, Nº, Bairro, Cidade - UF" />
                  <Input label="Telefone" value={companyForm.phone} onChange={v=>setCompanyForm(f=>({...f,phone:v}))} placeholder="(00) 00000-0000" />
                  <Input label="E-mail" value={companyForm.email} onChange={v=>setCompanyForm(f=>({...f,email:v}))} placeholder="contato@empresa.com.br" />
                  {companySaved && <div style={{ background:'#22c55e15', border:'1px solid #22c55e40', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#22c55e', fontWeight:600 }}>✅ Dados salvos com sucesso!</div>}
                  {companySaveError && <div style={{ background:'#ef444415', border:'1px solid #ef444440', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#ef4444', fontWeight:600 }}>⚠️ {companySaveError}</div>}
                  <Btn full color="#6366f1" onClick={async()=>{
                    setCompanySaveError('')
                    try {
                      // Verifica tamanho do logo (Firestore tem limite de 1MB por documento)
                      const logoSize = companyForm.logo ? new Blob([companyForm.logo]).size : 0
                      if (logoSize > 900000) {
                        setCompanySaveError('Logo muito grande! Use uma imagem menor (máx ~700KB).')
                        return
                      }
                      await setDoc(doc(db, `companies/${slug}/config`, 'company'), {
                        name: companyForm.name,
                        cnpj: companyForm.cnpj,
                        address: companyForm.address,
                        phone: companyForm.phone,
                        email: companyForm.email,
                        logo: companyForm.logo,
                      })
                      setCompanySaved(true)
                      setTimeout(()=>setCompanySaved(false), 3000)
                    } catch(err: any) {
                      setCompanySaveError('Erro ao salvar: ' + (err?.message || 'tente novamente.'))
                    }
                  }}>💾 Salvar Dados da Empresa</Btn>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:9, color:'#334155', letterSpacing:2, textTransform:'uppercase' }}>
            {loggedIn?`👤 ${loggedIn.name}`:formatDate(now).split(',')[0]}
          </div>
          {loggedIn && (
            <button onClick={handleLogout} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#ef4444', fontFamily:'inherit', fontWeight:700 }}>Sair →</button>
          )}
        </div>
      </div>
    </div>
  )
}
