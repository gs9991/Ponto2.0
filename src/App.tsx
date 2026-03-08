import { useState, useEffect } from 'react'
import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
// ─── Firebase ────────────────────────────────────────────────────────────────
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

const ADMIN_CRED = { username: 'admin', password: 'admin123' }

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function formatDateShort(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDuration(ms: number) {
  if (!ms || ms < 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}
function formatHours(ms: number) {
  if (!ms || ms < 0) return '0.00h'
  return (ms / 3600000).toFixed(2) + 'h'
}
function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function msToHHMM(ms: number) {
  if (!ms || ms < 0) return '0h00'
  const total = Math.floor(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

const STATUS = { OUT: 'out', IN: 'in', BREAK: 'break' }
const statusLabel: Record<string, string> = { out: 'Fora', in: 'Trabalhando', break: 'Pausa' }
const statusColor: Record<string, string> = { out: '#94a3b8', in: '#22c55e', break: '#f59e0b' }
const typeLabel: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', inicio_pausa: 'Início de Pausa', fim_pausa: 'Fim de Pausa' }
const typeColor: Record<string, string> = { entrada: '#22c55e', saida: '#ef4444', inicio_pausa: '#f59e0b', fim_pausa: '#3b82f6' }

interface Discount {
  id: number
  value: number
  reason: string
  date: string
}

interface Company {
  name: string; cnpj: string; address: string; phone: string; email: string; logo: string
}

interface Employee {
  id: number; name: string; role: string; username: string; password: string; avatar: string
  payType: 'day' | 'hour'; payValue: number; hoursPerDay: number
  overtimeRate: 50 | 70 | 100
  discounts: Discount[]
  gratifications: Discount[]
  cpf?: string; admission?: string; fgts?: boolean
}

interface LogEntry { type: string; time: Date }
interface EmpState {
  status: string; log: LogEntry[]; workStart: Date | null; breakStart: Date | null
  totalWork: number; totalBreak: number; days: string[]
  dailyWork: Record<string, number> // date string -> ms worked that day
  dailyOff: Record<string, 'paid' | 'unpaid'> // date string -> folga remunerada ou nao
  dailyNight: Record<string, number> // date string -> ms noturnos naquele dia
  dailyOvertimeRate: Record<string, number> // date string -> % hora extra daquele dia
}

interface User {
  id: number; name: string; username: string; avatar: string; role: string
  payType: 'day' | 'hour'; payValue: number; hoursPerDay: number; discounts: Discount[]
}

// ─── Reusable components ─────────────────────────────────────────────────────

function Input({ label, type = 'text', value, onChange, placeholder, error }: {
  label?: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>}
      <div style={{ position: 'relative' }}>
        <input type={type === 'password' && show ? 'text' : type} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: `1px solid ${error ? '#ef4444' : '#334155'}`, borderRadius: 10, padding: '12px 40px 12px 14px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        {type === 'password' && (
          <button onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

function Btn({ children, onClick, color = '#6366f1', disabled, full, small, outline }: {
  children: React.ReactNode; onClick: () => void; color?: string
  disabled?: boolean; full?: boolean; small?: boolean; outline?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: full ? '100%' : 'auto', padding: small ? '8px 14px' : '13px 20px',
      borderRadius: 10, border: outline ? `1.5px solid ${color}` : 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? '#1e293b' : outline ? 'transparent' : color,
      color: disabled ? '#334155' : outline ? color : '#fff',
      fontSize: small ? 11 : 13, fontWeight: 700, fontFamily: 'inherit', opacity: disabled ? 0.6 : 1
    }}>{children}</button>
  )
}

const TODAY = () => new Date().toISOString().split('T')[0]

// Get all days in a month
function getDaysInMonth(year: number, month: number) {
  const days: string[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return days
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PontoApp() {
  const [now, setNow] = useState(new Date())
  const [loggedIn, setLoggedIn] = useState<User | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<Record<number, EmpState>>({})
  const [loading, setLoading] = useState(true)

  // Nav
  const [view, setView] = useState('clock')

  // Login
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')

  // Admin employee form
  const [adminView, setAdminView] = useState('list')
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null)
  const [form, setForm] = useState({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8', overtimeRate: '50', cpf: '', admission: '', fgts: false })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [successMsg, setSuccessMsg] = useState('')

  // Discount form
  const [discountTarget, setDiscountTarget] = useState<number | null>(null)
  const [discountForm, setDiscountForm] = useState({ value: '', reason: '' })
  const [gratifTarget, setGratifTarget] = useState<number | null>(null)
  const [gratifForm, setGratifForm] = useState({ value: '', reason: '' })
  const [gratifError, setGratifError] = useState('')
  const [discountError, setDiscountError] = useState('')
  const [expandedReport, setExpandedReport] = useState<number | null>(null)

  // Monthly map
  const [mapTarget, setMapTarget] = useState<number | null>(null)
  const [mapMonth, setMapMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [editingDay, setEditingDay] = useState<{ empId: number; date: string } | null>(null)
  const [editTimes, setEditTimes] = useState({ entrada: '', almoco_ini: '', almoco_fim: '', saida: '' })
  const [editOvertimeRate, setEditOvertimeRate] = useState<number | null>(null)

  // Company
  const [company, setCompany] = useState<Company | null>(null)
  const [companyForm, setCompanyForm] = useState({ name: '', cnpj: '', address: '', phone: '', email: '', logo: '' })
  const [companySaved, setCompanySaved] = useState(false)

  // Geofence
  const [geofence, setGeofence] = useState<{ lat: number; lng: number; radius: number; address: string } | null>(null)
  const [geoForm, setGeoForm] = useState({ address: '', radius: '100' })
  const [geoError, setGeoError] = useState('')
  const [geoSuccess, setGeoSuccess] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [punchBlocked, setPunchBlocked] = useState('')
  const [punchChecking, setPunchChecking] = useState(false)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  // ── Firebase sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
      const emps: Employee[] = snap.docs.map(d => ({ ...(d.data() as Employee) }))
      setEmployees(emps)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'records'), (snap) => {
      const recs: Record<number, EmpState> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        recs[Number(d.id)] = {
          ...data,
          log: (data.log || []).map((e: { type: string; time: string }) => ({ type: e.type, time: new Date(e.time) })),
          workStart: data.workStart ? new Date(data.workStart) : null,
          breakStart: data.breakStart ? new Date(data.breakStart) : null,
          dailyWork: data.dailyWork || {},
          dailyOff: data.dailyOff || {},
          dailyNight: data.dailyNight || {},
          dailyOvertimeRate: data.dailyOvertimeRate || {},
        } as EmpState
      })
      setRecords(recs)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub2 = onSnapshot(doc(db, 'config', 'company'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Company
        setCompany(d)
        setCompanyForm({ name: d.name || '', cnpj: d.cnpj || '', address: d.address || '', phone: d.phone || '', email: d.email || '', logo: d.logo || '' })
      }
    })
    return () => unsub2()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'geofence'), (snap) => {
      if (snap.exists()) setGeofence(snap.data() as { lat: number; lng: number; radius: number; address: string })
      else setGeofence(null)
    })
    return () => unsub()
  }, [])

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    setLoginError('')
    if (loginUser === ADMIN_CRED.username && loginPass === ADMIN_CRED.password) {
      setLoggedIn({ id: 0, name: 'Administrador', username: 'admin', avatar: 'AD', role: 'admin', payType: 'day', payValue: 0, hoursPerDay: 8, discounts: [] })
      setView('list'); return
    }
    const emp = employees.find(e => e.username === loginUser && e.password === loginPass)
    if (emp) { setLoggedIn({ ...emp, role: 'employee' }); setView('clock'); return }
    setLoginError('Usuário ou senha incorretos.')
  }
  const handleLogout = () => { setLoggedIn(null); setLoginUser(''); setLoginPass(''); setLoginError('') }

  // ── Punch ─────────────────────────────────────────────────────────────────
  const getState = (id: number): EmpState =>
    records[id] || { status: STATUS.OUT, log: [], workStart: null, breakStart: null, totalWork: 0, totalBreak: 0, days: [], dailyWork: {}, dailyOff: {}, dailyNight: {}, dailyOvertimeRate: {} }

  // ── Geofence helpers ──────────────────────────────────────────────────────
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`)
      const data = await res.json()
      if (data.length === 0) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch { return null }
  }

  const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const saveGeofence = async () => {
    setGeoError(''); setGeoSuccess(''); setGeoLoading(true)
    if (!geoForm.address.trim()) { setGeoError('Digite um endereço.'); setGeoLoading(false); return }
    const radius = Number(geoForm.radius)
    if (!radius || radius < 10 || radius > 5000) { setGeoError('Raio deve ser entre 10 e 5000 metros.'); setGeoLoading(false); return }
    const coords = await geocodeAddress(geoForm.address)
    if (!coords) { setGeoError('Endereço não encontrado. Tente ser mais específico.'); setGeoLoading(false); return }
    await setDoc(doc(db, 'config', 'geofence'), { ...coords, radius, address: geoForm.address })
    setGeoSuccess(`Cerca ativa! Raio de ${radius}m em torno do endereço.`)
    setGeoLoading(false)
    setTimeout(() => setGeoSuccess(''), 4000)
  }

  const punch = (type: string) => {
    if (!loggedIn || loggedIn.role !== 'employee') return
    setPunchBlocked(''); setPunchChecking(true)

    const doRegister = async () => {
      const id = loggedIn.id
      const state = getState(id)
      const ts = new Date()
      const todayStr = TODAY()
      const newLog = [...state.log, { type, time: ts }]
      let s: EmpState = { ...state, log: newLog }
      
      if (type === 'entrada') {
        s.status = STATUS.IN; s.workStart = ts
      } else if (type === 'saida') {
        const workedNow = state.workStart ? ts.getTime() - state.workStart.getTime() : 0
        const nightNow = state.workStart ? calcNightMs(state.workStart.getTime(), ts.getTime()) : 0
        s.totalWork = (state.totalWork || 0) + workedNow
        const dailyWork = { ...(state.dailyWork || {}) }
        dailyWork[todayStr] = (dailyWork[todayStr] || 0) + workedNow
        s.dailyWork = dailyWork
        const dailyNight = { ...(state.dailyNight || {}) }
        dailyNight[todayStr] = (dailyNight[todayStr] || 0) + nightNow
        s.dailyNight = dailyNight
        s.status = STATUS.OUT; s.workStart = null
        if (!s.days.includes(todayStr)) s.days = [...s.days, todayStr]
      } else if (type === 'inicio_pausa') {
        const workedNow = state.workStart ? ts.getTime() - state.workStart.getTime() : 0
        const nightNow = state.workStart ? calcNightMs(state.workStart.getTime(), ts.getTime()) : 0
        s.totalWork = (state.totalWork || 0) + workedNow
        const dailyWork = { ...(state.dailyWork || {}) }
        dailyWork[todayStr] = (dailyWork[todayStr] || 0) + workedNow
        s.dailyWork = dailyWork
        const dailyNight = { ...(state.dailyNight || {}) }
        dailyNight[todayStr] = (dailyNight[todayStr] || 0) + nightNow
        s.dailyNight = dailyNight
        s.status = STATUS.BREAK; s.workStart = null; s.breakStart = ts
      } else if (type === 'fim_pausa') {
        s.totalBreak = (state.totalBreak || 0) + (state.breakStart ? ts.getTime() - state.breakStart.getTime() : 0)
        s.status = STATUS.IN; s.breakStart = null; s.workStart = ts
      }

      // Serialize dates for Firestore
      const serialized = {
        ...s,
        log: s.log.map(e => ({ type: e.type, time: e.time.toISOString() })),
        workStart: s.workStart ? s.workStart.toISOString() : null,
        breakStart: s.breakStart ? s.breakStart.toISOString() : null,
      }
      await setDoc(doc(db, 'records', String(id)), serialized)
      setPunchChecking(false)
    }

    if (!geofence) { doRegister(); return }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = calcDistance(pos.coords.latitude, pos.coords.longitude, geofence.lat, geofence.lng)
        if (dist <= geofence.radius) {
          doRegister()
        } else {
          setPunchChecking(false)
          setPunchBlocked(`📍 Você está a ${Math.round(dist)}m do local permitido. Máximo: ${geofence.radius}m.`)
          setTimeout(() => setPunchBlocked(''), 6000)
        }
      },
      () => {
        setPunchChecking(false)
        setPunchBlocked('⚠️ Não foi possível obter sua localização. Permita o acesso ao GPS.')
        setTimeout(() => setPunchBlocked(''), 6000)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // ── Night hours helper (22h-5h) ──────────────────────────────────────────
  const calcNightMs = (startMs: number, endMs: number): number => {
    // Returns ms of night work (22:00-05:00) within a given interval
    let nightTotal = 0
    const HOUR = 3600000
    // Walk through each hour slot in the interval
    let cursor = startMs
    while (cursor < endMs) {
      const next = Math.min(cursor + HOUR, endMs)
      const hourOfDay = (new Date(cursor).getHours())
      const isNight = hourOfDay >= 22 || hourOfDay < 5
      if (isNight) nightTotal += next - cursor
      cursor = next
    }
    return nightTotal
  }

    // ── Payment calc ──────────────────────────────────────────────────────────
  const calcPayment = (emp: Employee, state: EmpState, liveWork: number) => {
    const totalMs = liveWork
    const totalHours = totalMs / 3600000
    const totalBreakMs = (state.totalBreak || 0) + (state.breakStart ? now.getTime() - state.breakStart.getTime() : 0)
    const breakHours = totalBreakMs / 3600000
    const daysWorked = state.days.length + (state.status !== STATUS.OUT ? 1 : 0)
    const paidOffDays = Object.values(state.dailyOff || {}).filter(v => v === 'paid').length
    const totalPaidDays = daysWorked + paidOffDays

    // Overtime: ms worked beyond hoursPerDay each day, per-day rate
    const journeyMs = emp.hoursPerDay * 3600000
    const defaultRate = emp.overtimeRate || 50
    const hourValue = emp.payType === 'hour' ? emp.payValue : emp.payValue / emp.hoursPerDay

    let overtimeMs = 0
    let overtimeValue = 0
    const overtimeByRate: Record<number, number> = {} // rate -> ms
    Object.entries(state.dailyWork || {}).forEach(([date, ms]) => {
      const extra = Math.max(0, ms - journeyMs)
      if (extra > 0) {
        const rate = (state.dailyOvertimeRate || {})[date] ?? defaultRate
        overtimeMs += extra
        overtimeValue += (extra / 3600000) * hourValue * (1 + rate / 100)
        overtimeByRate[rate] = (overtimeByRate[rate] || 0) + extra
      }
    })
    const regularMs = Math.max(0, totalMs - overtimeMs)
    const overtimeRate = defaultRate // for display fallback

    // Night hours: 20% bonus (22h-5h)
    const nightMs = Object.values(state.dailyNight || {}).reduce((a, v) => a + v, 0)
    const nightBonus = (nightMs / 3600000) * hourValue * 0.20

    let grossValue = 0, autoDeductions = 0
    if (emp.payType === 'hour') {
      const paidOffMs = paidOffDays * emp.hoursPerDay * 3600000
      const regularValue = (regularMs + paidOffMs) / 3600000 * emp.payValue
      grossValue = regularValue + overtimeValue + nightBonus
      autoDeductions = Math.max(0, breakHours - daysWorked) * emp.payValue
    } else {
      grossValue = totalPaidDays * emp.payValue + overtimeValue + nightBonus
    }

    const manualDiscountTotal = emp.discounts.reduce((s, d) => s + d.value, 0)
    const gratificationsTotal = (emp.gratifications || []).reduce((s, d) => s + d.value, 0)
    const totalDeductions = autoDeductions + manualDiscountTotal
    const net = Math.max(0, grossValue - totalDeductions) + gratificationsTotal

    return { totalHours, totalMs, daysWorked, paidOffDays, totalPaidDays, grossValue, autoDeductions, manualDiscountTotal, gratificationsTotal, totalDeductions, net, breakHours, breakMs: totalBreakMs, overtimeMs, overtimeByRate, nightMs, nightBonus, overtimeRate }
  }

  // ── Employee CRUD ─────────────────────────────────────────────────────────
  const validateForm = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Nome obrigatório'
    if (!form.role.trim()) e.role = 'Cargo obrigatório'
    if (!form.username.trim()) e.username = 'Usuário obrigatório'
    else if (employees.find(emp => emp.username === form.username && emp.id !== editingEmp?.id)) e.username = 'Usuário já cadastrado'
    if (!editingEmp && !form.password.trim()) e.password = 'Senha obrigatória'
    if (!form.payValue || isNaN(Number(form.payValue)) || Number(form.payValue) <= 0) e.payValue = 'Valor obrigatório'
    return e
  }

  const saveEmployee = async () => {
    const e = validateForm(); if (Object.keys(e).length) { setFormErrors(e); return }
    const av = form.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    const data = { name: form.name, role: form.role, username: form.username, avatar: av, payType: form.payType as 'day' | 'hour', payValue: Number(form.payValue), hoursPerDay: Number(form.hoursPerDay) || 8, overtimeRate: Number(form.overtimeRate) as 50 | 70 | 100, cpf: (form as any).cpf || '', admission: (form as any).admission || '', fgts: (form as any).fgts || false, ...(form.password ? { password: form.password } : {}) }
    if (editingEmp) {
      const updated = { ...editingEmp, ...data }
      await setDoc(doc(db, 'employees', String(editingEmp.id)), updated)
      setSuccessMsg('Funcionário atualizado!')
    } else {
      const id = Date.now()
      const newEmp = { id, password: form.password, discounts: [], gratifications: [], ...data }
      await setDoc(doc(db, 'employees', String(id)), newEmp)
      setSuccessMsg('Funcionário cadastrado!')
    }
    setTimeout(() => setSuccessMsg(''), 3000)
    setForm({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8', overtimeRate: '50', cpf: '', admission: '', fgts: false })
    setFormErrors({}); setEditingEmp(null); setAdminView('list')
  }

  const deleteEmployee = async (id: number) => {
    await deleteDoc(doc(db, 'employees', String(id)))
    await deleteDoc(doc(db, 'records', String(id)))
  }

  const startEdit = (emp: Employee) => {
    setEditingEmp(emp)
    setForm({ name: emp.name, role: emp.role, username: emp.username, password: '', payType: emp.payType, payValue: String(emp.payValue), hoursPerDay: String(emp.hoursPerDay), overtimeRate: String(emp.overtimeRate || 50), cpf: emp.cpf || '', admission: emp.admission || '', fgts: emp.fgts || false })
    setFormErrors({}); setAdminView('edit')
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  const addDiscount = async (empId: number) => {
    setDiscountError('')
    if (!discountForm.value || isNaN(Number(discountForm.value)) || Number(discountForm.value) <= 0) {
      setDiscountError('Informe um valor válido'); return
    }
    if (!discountForm.reason.trim()) { setDiscountError('Informe o motivo do desconto'); return }
    const newDiscount: Discount = { id: Date.now(), value: Number(discountForm.value), reason: discountForm.reason.trim(), date: formatDateShort(new Date()) }
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    const updated = { ...emp, discounts: [...emp.discounts, newDiscount] }
    await setDoc(doc(db, 'employees', String(empId)), updated)
    setDiscountForm({ value: '', reason: '' })
    setDiscountTarget(null)
  }

  const removeDiscount = async (empId: number, discountId: number) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    const updated = { ...emp, discounts: emp.discounts.filter(d => d.id !== discountId) }
    await setDoc(doc(db, 'employees', String(empId)), updated)
  }

  const addGratification = async (empId: number) => {
    setGratifError('')
    if (!gratifForm.value || isNaN(Number(gratifForm.value)) || Number(gratifForm.value) <= 0) {
      setGratifError('Informe um valor válido'); return
    }
    if (!gratifForm.reason.trim()) { setGratifError('Informe o motivo'); return }
    const newGratif: Discount = { id: Date.now(), value: Number(gratifForm.value), reason: gratifForm.reason.trim(), date: formatDateShort(new Date()) }
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    const updated = { ...emp, gratifications: [...(emp.gratifications || []), newGratif] }
    await setDoc(doc(db, 'employees', String(empId)), updated)
    setGratifForm({ value: '', reason: '' })
    setGratifTarget(null)
  }

  const removeGratification = async (empId: number, gratifId: number) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    const updated = { ...emp, gratifications: (emp.gratifications || []).filter(g => g.id !== gratifId) }
    await setDoc(doc(db, 'employees', String(empId)), updated)
  }

  // ── Edit daily hours (admin) ───────────────────────────────────────────────
  const timeToMs = (timeStr: string, date: string): number | null => {
    if (!timeStr) return null
    const [h, m] = timeStr.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return null
    return new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).getTime()
  }

  const saveEditedHours = async () => {
    if (!editingDay) return
    const { empId, date } = editingDay
    const { entrada, almoco_ini, almoco_fim, saida } = editTimes

    const tsEntrada = timeToMs(entrada, date)
    const tsSaida = timeToMs(saida, date)
    const tsAlmocoIni = timeToMs(almoco_ini, date)
    const tsAlmocoFim = timeToMs(almoco_fim, date)

    if (!tsEntrada || !tsSaida || tsSaida <= tsEntrada) {
      alert('Preencha ao menos Entrada e Saída com horários válidos.')
      return
    }

    // Calculate worked ms: (saida - entrada) - break time
    let breakMs = 0
    if (tsAlmocoIni && tsAlmocoFim && tsAlmocoFim > tsAlmocoIni) {
      breakMs = tsAlmocoFim - tsAlmocoIni
    }
    const workedMs = Math.max(0, tsSaida - tsEntrada - breakMs)

    // Build new log entries for this day (replace existing entries for this date)
    const state = getState(empId)
    const otherDayLogs = state.log.filter(e => {
      const d = new Date(e.time).toISOString().split('T')[0]
      return d !== date
    })
    const newLogs: LogEntry[] = [
      { type: 'entrada', time: new Date(tsEntrada) },
      ...(tsAlmocoIni ? [{ type: 'inicio_pausa', time: new Date(tsAlmocoIni) }] : []),
      ...(tsAlmocoFim ? [{ type: 'fim_pausa', time: new Date(tsAlmocoFim) }] : []),
      { type: 'saida', time: new Date(tsSaida) },
    ]
    const allLogs = [...otherDayLogs, ...newLogs].sort((a, b) => a.time.getTime() - b.time.getTime())

    // Night hours for the edited period
    let nightWorkedMs = 0
    if (tsEntrada && tsSaida) {
      nightWorkedMs += calcNightMs(tsEntrada, tsAlmocoIni || tsSaida)
      if (tsAlmocoFim) nightWorkedMs += calcNightMs(tsAlmocoFim, tsSaida)
    }

    const oldMs = (state.dailyWork || {})[date] || 0
    const diff = workedMs - oldMs
    const newDailyWork = { ...(state.dailyWork || {}), [date]: workedMs }
    const newTotalWork = Math.max(0, (state.totalWork || 0) + diff)
    const newDailyNight = { ...(state.dailyNight || {}), [date]: nightWorkedMs }
    const newDailyOvertimeRate = { ...(state.dailyOvertimeRate || {}) }
    if (editOvertimeRate !== null) newDailyOvertimeRate[date] = editOvertimeRate
    else delete newDailyOvertimeRate[date]

    let newDays = [...(state.days || [])]
    if (workedMs > 0 && !newDays.includes(date)) newDays = [...newDays, date]
    if (workedMs === 0) newDays = newDays.filter(d => d !== date)

    const updated = {
      ...state,
      dailyWork: newDailyWork,
      dailyNight: newDailyNight,
      dailyOvertimeRate: newDailyOvertimeRate,
      totalWork: newTotalWork,
      days: newDays,
      log: allLogs.map(e => ({ type: e.type, time: e.time.toISOString() })),
      workStart: state.workStart ? state.workStart.toISOString() : null,
      breakStart: state.breakStart ? state.breakStart.toISOString() : null,
    }
    await setDoc(doc(db, 'records', String(empId)), updated)
    setEditingDay(null)
    setEditTimes({ entrada: '', almoco_ini: '', almoco_fim: '', saida: '' })
    setEditOvertimeRate(null)
  }

  // ── Mark day off ─────────────────────────────────────────────────────────
  const markDayOff = async (empId: number, date: string, type: 'paid' | 'unpaid' | null) => {
    const state = getState(empId)
    const newDailyOff = { ...(state.dailyOff || {}) }
    if (type === null) {
      delete newDailyOff[date]
    } else {
      newDailyOff[date] = type
    }
    const updated = {
      ...state,
      dailyOff: newDailyOff,
      log: state.log.map(e => ({ type: e.type, time: e.time.toISOString() })),
      workStart: state.workStart ? state.workStart.toISOString() : null,
      breakStart: state.breakStart ? state.breakStart.toISOString() : null,
    }
    await setDoc(doc(db, 'records', String(empId)), updated)
  }

  // ── Generate Extract ──────────────────────────────────────────────────────
  const generateExtract = async (emp: Employee, state: EmpState, payment: ReturnType<typeof calcPayment>) => {
    // Dynamically load jsPDF from CDN
    if (!(window as any).jspdf) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        s.onload = () => resolve()
        s.onerror = () => reject()
        document.head.appendChild(s)
      })
    }
    const { jsPDF } = (window as any).jspdf
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, margin = 16
    let y = 0

    const col1 = margin, col2 = W / 2 + 2
    const rowH = 7

    const rect = (x: number, yy: number, w: number, h: number, fill?: string, stroke?: string) => {
      if (fill) { doc.setFillColor(fill); doc.rect(x, yy, w, h, 'F') }
      if (stroke) { doc.setDrawColor(stroke); doc.rect(x, yy, w, h, 'S') }
    }
    const text = (t: string, x: number, yy: number, opts?: { size?: number; bold?: boolean; color?: string; align?: 'left'|'right'|'center' }) => {
      doc.setFontSize(opts?.size || 9)
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
      if (opts?.color) { const [r,g,b] = opts.color.match(/\w\w/g)!.map(h=>parseInt(h,16)); doc.setTextColor(r,g,b) } else doc.setTextColor(30,30,30)
      doc.text(t, x, yy, { align: opts?.align || 'left' })
    }
    const line = (x1: number, yy: number, x2: number, color = '#e2e8f0') => {
      const [r,g,b] = color.match(/\w\w/g)!.map(h=>parseInt(h,16))
      doc.setDrawColor(r,g,b); doc.setLineWidth(0.3); doc.line(x1, yy, x2, yy)
    }

    // ── HEADER ────────────────────────────────────────────────────────────────
    rect(0, 0, W, 36, '#1e293b')
    y = 10

    if (company?.logo) {
      try { doc.addImage(company.logo, 'AUTO', margin, 4, 28, 28, '', 'FAST') } catch(_) {}
      const tx = margin + 32
      text(company?.name || 'PontoApp', tx, y + 2, { size: 14, bold: true, color: '#f1f5f9' })
      if (company?.cnpj) text(`CNPJ: ${company.cnpj}`, tx, y + 8, { size: 8, color: '#94a3b8' })
      if (company?.address) text(company.address, tx, y + 14, { size: 7, color: '#94a3b8' })
      if (company?.phone || company?.email) text([company.phone, company.email].filter(Boolean).join('  |  '), tx, y + 20, { size: 7, color: '#94a3b8' })
    } else {
      text(company?.name || 'PontoApp', margin, y + 4, { size: 16, bold: true, color: '#f1f5f9' })
      if (company?.cnpj) text(`CNPJ: ${company.cnpj}`, margin, y + 11, { size: 8, color: '#94a3b8' })
      if (company?.address) text(company.address, margin, y + 17, { size: 7, color: '#94a3b8' })
      if (company?.phone || company?.email) text([company.phone, company.email].filter(Boolean).join('  |  '), margin, y + 23, { size: 7, color: '#94a3b8' })
    }

    text('HOLERITE', W - margin, y + 2, { size: 13, bold: true, color: '#6366f1', align: 'right' })
    text(new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), W - margin, y + 9, { size: 8, color: '#94a3b8', align: 'right' })
    text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, W - margin, y + 15, { size: 7, color: '#64748b', align: 'right' })

    y = 42

    // ── EMPLOYEE DATA ─────────────────────────────────────────────────────────
    rect(margin, y, W - margin * 2, 6, '#f8fafc')
    text('DADOS DO FUNCIONÁRIO', margin + 2, y + 4.5, { size: 8, bold: true, color: '#475569' })
    y += 8

    const empRows = [
      ['Nome', emp.name, 'Cargo', emp.role],
      ['CPF', emp.cpf || '—', 'Admissão', emp.admission ? new Date(emp.admission + 'T12:00:00').toLocaleDateString('pt-BR') : '—'],
      ['Tipo Pagto.', emp.payType === 'hour' ? 'Por Hora' : 'Por Dia', 'Salário Base', fmt(emp.payValue) + (emp.payType === 'hour' ? '/h' : '/dia')],
    ]
    empRows.forEach((row, i) => {
      if (i % 2 === 0) rect(margin, y, W - margin * 2, rowH, '#f8fafc')
      text(row[0], col1 + 2, y + 5, { size: 7.5, color: '#64748b' })
      text(row[1], col1 + 30, y + 5, { size: 8, bold: true })
      text(row[2], col2 + 2, y + 5, { size: 7.5, color: '#64748b' })
      text(row[3], col2 + 30, y + 5, { size: 8, bold: true })
      line(margin, y + rowH, W - margin, y + rowH)
      y += rowH
    })
    y += 6

    // ── EARNINGS ──────────────────────────────────────────────────────────────
    rect(margin, y, W - margin * 2, 6, '#f0fdf4')
    text('PROVENTOS', margin + 2, y + 4.5, { size: 8, bold: true, color: '#16a34a' })
    y += 8

    const earnings: [string, string, string][] = [
      ['Horas Trabalhadas', `${formatHours(payment.totalMs)} | ${payment.daysWorked} dia(s)`, fmt(payment.grossValue - (payment.overtimeMs > 0 ? Object.entries(payment.overtimeByRate).reduce((a,[r,m]) => a + (m as number)/3600000*(emp.payType==='hour'?emp.payValue:emp.payValue/emp.hoursPerDay)*(1+Number(r)/100), 0) : 0) - payment.nightBonus - payment.gratificationsTotal)],
    ]
    Object.entries(payment.overtimeByRate).sort(([a],[b])=>Number(a)-Number(b)).forEach(([rate, ms]) => {
      const hv = emp.payType === 'hour' ? emp.payValue : emp.payValue / emp.hoursPerDay
      const val = (ms as number) / 3600000 * hv * (1 + Number(rate) / 100)
      earnings.push([`Hora Extra +${rate}%`, formatHours(ms as number), fmt(val)])
    })
    if (payment.nightMs > 0) earnings.push(['Adicional Noturno (20%)', formatHours(payment.nightMs), fmt(payment.nightBonus)])
    ;(emp.gratifications || []).forEach(g => earnings.push([`Gratificação: ${g.reason}`, g.date, fmt(g.value)]))

    earnings.forEach((row, i) => {
      if (i % 2 === 0) rect(margin, y, W - margin * 2, rowH, '#f8fafc')
      text(row[0], col1 + 2, y + 5, { size: 8 })
      text(row[1], W / 2, y + 5, { size: 8, color: '#475569', align: 'center' })
      text(row[2], W - margin - 2, y + 5, { size: 8, bold: true, color: '#16a34a', align: 'right' })
      line(margin, y + rowH, W - margin, y + rowH)
      y += rowH
    })

    rect(margin, y, W - margin * 2, 7, '#dcfce7')
    text('TOTAL PROVENTOS', col1 + 2, y + 5, { size: 8.5, bold: true, color: '#15803d' })
    text(fmt(payment.grossValue + payment.gratificationsTotal), W - margin - 2, y + 5, { size: 9, bold: true, color: '#15803d', align: 'right' })
    y += 10

    // ── DEDUCTIONS ────────────────────────────────────────────────────────────
    rect(margin, y, W - margin * 2, 6, '#fef2f2')
    text('DESCONTOS', margin + 2, y + 4.5, { size: 8, bold: true, color: '#dc2626' })
    y += 8

    const deductions: [string, string, string][] = []
    if (payment.autoDeductions > 0) deductions.push(['Pausas Excessivas', '—', fmt(payment.autoDeductions)])
    emp.discounts.forEach(d => deductions.push([d.reason, d.date, fmt(d.value)]))

    // FGTS
    if (emp.fgts) {
      const fgtsVal = payment.grossValue * 0.08
      deductions.push(['FGTS (8%)', '—', fmt(fgtsVal)])
    }

    if (deductions.length === 0) {
      text('Nenhum desconto aplicado.', col1 + 2, y + 5, { size: 8, color: '#94a3b8' })
      y += rowH
    } else {
      deductions.forEach((row, i) => {
        if (i % 2 === 0) rect(margin, y, W - margin * 2, rowH, '#fff5f5')
        text(row[0], col1 + 2, y + 5, { size: 8 })
        text(row[1], W / 2, y + 5, { size: 8, color: '#475569', align: 'center' })
        text(`- ${row[2]}`, W - margin - 2, y + 5, { size: 8, bold: true, color: '#dc2626', align: 'right' })
        line(margin, y + rowH, W - margin, y + rowH)
        y += rowH
      })
    }

    const fgtsTotal = emp.fgts ? payment.grossValue * 0.08 : 0
    rect(margin, y, W - margin * 2, 7, '#fee2e2')
    text('TOTAL DESCONTOS', col1 + 2, y + 5, { size: 8.5, bold: true, color: '#dc2626' })
    text(`- ${fmt(payment.totalDeductions + fgtsTotal)}`, W - margin - 2, y + 5, { size: 9, bold: true, color: '#dc2626', align: 'right' })
    y += 12

    // ── NET ───────────────────────────────────────────────────────────────────
    rect(margin, y, W - margin * 2, 12, '#1e293b')
    text('VALOR LÍQUIDO A RECEBER', col1 + 4, y + 8, { size: 10, bold: true, color: '#f1f5f9' })
    text(fmt(payment.net - fgtsTotal), W - margin - 4, y + 8, { size: 13, bold: true, color: '#4ade80', align: 'right' })
    y += 16

    // ── SIGNATURE ─────────────────────────────────────────────────────────────
    line(margin, y + 14, margin + 70, y + 14)
    line(W - margin - 70, y + 14, W - margin, y + 14)
    text('Assinatura do Empregador', margin + 35, y + 18, { size: 7, color: '#94a3b8', align: 'center' })
    text('Assinatura do Funcionário', W - margin - 35, y + 18, { size: 7, color: '#94a3b8', align: 'center' })
    y += 24

    // ── FOOTER ────────────────────────────────────────────────────────────────
    line(margin, y, W - margin, y)
    y += 4
    text('Documento gerado automaticamente pelo PontoApp. Declaro que recebi a importância acima discriminada.', W / 2, y + 4, { size: 6.5, color: '#94a3b8', align: 'center' })

    doc.save(`Holerite_${emp.name.replace(/\s+/g,'_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.pdf`)
  }

  // ── Live values ───────────────────────────────────────────────────────────
  const empState = loggedIn?.role === 'employee' ? getState(loggedIn.id) : null
  const liveWork = empState ? (empState.totalWork || 0) + (empState.workStart ? now.getTime() - empState.workStart.getTime() : 0) : 0
  const liveBreak = empState ? (empState.totalBreak || 0) + (empState.breakStart ? now.getTime() - empState.breakStart.getTime() : 0) : 0
  const myEmpData = loggedIn?.role === 'employee' ? employees.find(e => e.id === loggedIn.id) : null
  const empPayment = myEmpData && empState ? calcPayment(myEmpData, empState, liveWork) : null

  // Today's live work for employee
  const todayStr = TODAY()
  const todayLiveWork = empState
    ? ((empState.dailyWork || {})[todayStr] || 0) + (empState.workStart ? now.getTime() - empState.workStart.getTime() : 0)
    : 0

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Courier New', monospace" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏱</div>
        <div style={{ fontSize: 14, color: '#475569', letterSpacing: 2 }}>CARREGANDO...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', justifyContent: 'center', fontFamily: "'Courier New', monospace" }}>
      <div style={{ width: '100%', maxWidth: 420, minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>

        <div style={{ height: 3, background: 'linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 4, color: '#475569', textTransform: 'uppercase' }}>Sistema de Ponto</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}>⏱ PontoApp</div>
          </div>
          <div style={{ textAlign: 'right', background: '#1e293b', borderRadius: 12, padding: '8px 14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#06b6d4' }}>{formatTime(now)}</div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'capitalize' }}>{formatDate(now).split(',')[0]}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>

          {/* ══ LOGIN ══════════════════════════════════════════════════════ */}
          {!loggedIn && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', boxShadow: '0 0 40px #6366f140, 0 8px 24px #00000060', marginBottom: 20, fontSize: 32 }}>⏱</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.5px' }}>PontoApp</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 6, letterSpacing: 2, textTransform: 'uppercase' }}>Controle de Ponto Digital</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
                <div style={{ fontSize: 10, color: '#334155', letterSpacing: 3, textTransform: 'uppercase' }}>Acesso Seguro</div>
                <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
              </div>
              <div style={{ background: 'linear-gradient(160deg, #1e293b 0%, #162032 100%)', borderRadius: 20, padding: '28px 24px', border: '1px solid #334155', boxShadow: '0 20px 60px #00000050', marginBottom: 16 }}>
                <Input label="Usuário" value={loginUser} onChange={setLoginUser} placeholder="Digite seu usuário" />
                <Input label="Senha" type="password" value={loginPass} onChange={setLoginPass} placeholder="••••••••" error={loginError} />
                <div style={{ marginTop: 8 }}>
                  <button onClick={handleLogin} style={{ width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', letterSpacing: 1, boxShadow: '0 4px 20px #6366f140' }}>
                    ENTRAR NO SISTEMA →
                  </button>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 10, color: '#1e293b', letterSpacing: 2, textTransform: 'uppercase' }}>🔒 Conexão protegida</div>
              </div>
            </div>
          )}

          {/* ══ FUNCIONÁRIO ════════════════════════════════════════════════ */}
          {loggedIn?.role === 'employee' && empState && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[['clock', '🕐 Ponto'], ['payment', '💰 Pagamento'], ['history', '📋 Histórico']].map(([key, label]) => (
                  <button key={key} onClick={() => setView(key)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', background: view === key ? '#6366f1' : '#1e293b', color: view === key ? '#fff' : '#64748b' }}>{label}</button>
                ))}
              </div>

              {/* PONTO */}
              {view === 'clock' && (
                <>
                  <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 16, padding: 18, marginBottom: 14, border: `1px solid ${statusColor[empState.status]}40` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>{loggedIn.avatar}</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{loggedIn.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{loggedIn.role}</div>
                        </div>
                      </div>
                      <div style={{ padding: '5px 12px', borderRadius: 20, background: `${statusColor[empState.status]}20`, border: `1px solid ${statusColor[empState.status]}60`, fontSize: 11, fontWeight: 700, color: statusColor[empState.status] }}>
                        {statusLabel[empState.status]}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { label: 'Hoje', val: msToHHMM(todayLiveWork), sub: formatDuration(todayLiveWork), color: '#22c55e' },
                        { label: 'Pausas', val: formatDuration(liveBreak), sub: formatHours(liveBreak), color: '#f59e0b' },
                        { label: 'A receber', val: empPayment ? fmt(empPayment.net) : fmt(0), sub: loggedIn.payType === 'hour' ? 'por hora' : 'por dia', color: '#6366f1' },
                      ].map(({ label, val, sub, color }) => (
                        <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 10, padding: '10px 8px' }}>
                          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color, marginTop: 3 }}>{val}</div>
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Geofence status */}
                  {geofence && (
                    <div style={{ background: '#06b6d415', border: '1px solid #06b6d430', borderRadius: 10, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4' }}>Ponto com restrição de local</div>
                        <div style={{ fontSize: 10, color: '#475569' }}>Raio: {geofence.radius}m · {geofence.address}</div>
                      </div>
                    </div>
                  )}

                  {punchChecking && (
                    <div style={{ background: '#6366f115', border: '1px solid #6366f140', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#a5b4fc', fontWeight: 600, textAlign: 'center' }}>
                      🔍 Verificando sua localização...
                    </div>
                  )}

                  {punchBlocked && (
                    <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                      {punchBlocked}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {[
                      { type: 'entrada', label: 'Entrada', icon: '▶', color: '#22c55e', disabled: empState.status !== STATUS.OUT },
                      { type: 'inicio_pausa', label: 'Pausar', icon: '⏸', color: '#f59e0b', disabled: empState.status !== STATUS.IN },
                      { type: 'fim_pausa', label: 'Retornar', icon: '↩', color: '#3b82f6', disabled: empState.status !== STATUS.BREAK },
                      { type: 'saida', label: 'Saída', icon: '■', color: '#ef4444', disabled: empState.status === STATUS.OUT },
                    ].map(({ type, label, icon, color, disabled }) => (
                      <button key={type} onClick={() => !disabled && punch(type)} style={{ padding: '16px 0', borderRadius: 12, border: `1px solid ${disabled ? '#334155' : color + '60'}`, cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#1e293b' : `${color}20`, color: disabled ? '#334155' : color, fontSize: 13, fontWeight: 800, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 20 }}>{icon}</span>{label}
                      </button>
                    ))}
                  </div>

                  {/* Daily breakdown */}
                  {empState.dailyWork && Object.keys(empState.dailyWork).length > 0 && (
                    <div style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid #334155' }}>
                      <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>📅 Horas por Dia</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Object.entries(empState.dailyWork).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).map(([date, ms]) => {
                          const [y, mo, d] = date.split('-')
                          return (
                            <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#0f172a', borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: '#cbd5e1' }}>{d}/{mo}/{y}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{msToHHMM(ms as number)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {empState.log.length > 0 && (
                    <div style={{ background: '#1e293b', borderRadius: 12, padding: 14, border: '1px solid #334155' }}>
                      <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>Registros de Hoje</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[...empState.log].reverse().slice(0, 5).map((entry, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#0f172a', borderRadius: 8, borderLeft: `3px solid ${typeColor[entry.type]}` }}>
                            <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{typeLabel[entry.type]}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{formatTime(entry.time)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* PAGAMENTO FUNCIONÁRIO */}
              {view === 'payment' && empPayment && myEmpData && (
                <div>
                  <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 16, padding: 18, marginBottom: 14, border: '1px solid #22c55e30', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Meu Pagamento</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#22c55e' }}>{fmt(empPayment.net)}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Valor líquido a receber</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: '⏱ Horas Trabalhadas', val: formatHours(empPayment.totalMs), sub: formatDuration(empPayment.totalMs), color: '#22c55e' },
                      { label: '☕ Total em Pausas', val: formatHours(empPayment.breakMs), sub: formatDuration(empPayment.breakMs), color: '#f59e0b' },
                      { label: '📅 Dias Trabalhados', val: empPayment.daysWorked + ' dia(s)', sub: '', color: '#06b6d4' },
                      { label: '💵 Valor Bruto', val: fmt(empPayment.grossValue), sub: myEmpData.payType === 'hour' ? `${formatHours(empPayment.totalMs)} × ${fmt(myEmpData.payValue)}/h` : `${empPayment.daysWorked} dias × ${fmt(myEmpData.payValue)}/dia`, color: '#6366f1' },
                    ].map(({ label, val, sub, color }) => (
                      <div key={label} style={{ background: '#1e293b', borderRadius: 12, padding: '12px 14px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                          {sub && <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{sub}</div>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color }}>{val}</div>
                      </div>
                    ))}
                    {empPayment.overtimeMs > 0 && Object.entries(empPayment.overtimeByRate).sort(([a],[b]) => Number(a)-Number(b)).map(([rate, ms]) => {
                        const hv = myEmpData.payType === 'hour' ? myEmpData.payValue : myEmpData.payValue / myEmpData.hoursPerDay
                        const bonus = ((ms as number) / 3600000) * hv * (Number(rate) / 100)
                        return (
                          <div key={rate} style={{ background: '#f59e0b10', borderRadius: 12, padding: '12px 14px', border: '1px solid #f59e0b30', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>⚡ Horas Extras (+{rate}%)</div>
                              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{formatHours(ms as number)}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>+{fmt(bonus)}</div>
                          </div>
                        )
                      })}
                    {empPayment.nightMs > 0 && (
                      <div style={{ background: '#6366f110', borderRadius: 12, padding: '12px 14px', border: '1px solid #6366f130', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>🌙 Adicional Noturno</div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>+20% · {formatHours(empPayment.nightMs)} entre 22h–5h</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#a5b4fc' }}>+{fmt(empPayment.nightBonus)}</div>
                      </div>
                    )}
                  </div>

                  {/* Descontos */}
                  <div style={{ background: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #ef444430' }}>
                    <div style={{ fontSize: 10, letterSpacing: 3, color: '#ef4444', textTransform: 'uppercase', marginBottom: 10 }}>⬇ Descontos Aplicados</div>
                    {myEmpData.discounts.length === 0 && empPayment.autoDeductions === 0 ? (
                      <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '8px 0' }}>Nenhum desconto aplicado ✅</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {empPayment.autoDeductions > 0 && (
                          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>Pausas Excessivas</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Desconto automático</div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', flexShrink: 0, marginLeft: 8 }}>- {fmt(empPayment.autoDeductions)}</div>
                            </div>
                          </div>
                        )}
                        {myEmpData.discounts.map(d => (
                          <div key={d.id} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #ef4444' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{d.reason}</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Lançado em {d.date}</div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', flexShrink: 0, marginLeft: 8 }}>- {fmt(d.value)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(myEmpData.discounts.length > 0 || empPayment.autoDeductions > 0) && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Total de Descontos</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>- {fmt(empPayment.totalDeductions)}</span>
                      </div>
                    )}
                  </div>

                  {(myEmpData.gratifications || []).length > 0 && (
                    <div style={{ background: '#22c55e10', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #22c55e30' }}>
                      <div style={{ fontSize: 10, letterSpacing: 3, color: '#22c55e', textTransform: 'uppercase', marginBottom: 10 }}>⭐ Gratificações</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(myEmpData.gratifications || []).map(g => (
                          <div key={g.id} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #22c55e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>{g.reason}</div>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{g.date}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', flexShrink: 0, marginLeft: 8 }}>+ {fmt(g.value)}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Total Gratificações</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>+ {fmt(empPayment.gratificationsTotal)}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ background: '#22c55e20', border: '1px solid #22c55e60', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Total a Receber</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: '#22c55e' }}>{fmt(empPayment.net)}</div>
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>
                      {myEmpData.payType === 'hour' ? `${fmt(myEmpData.payValue)} por hora` : `${fmt(myEmpData.payValue)} por dia`}
                    </div>
                  </div>
                </div>
              )}

              {/* HISTÓRICO */}
              {view === 'history' && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>Meu Histórico</div>
                  {empState.log.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                      <div style={{ fontSize: 13 }}>Nenhum registro ainda</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...empState.log].reverse().map((entry, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#1e293b', borderRadius: 10, borderLeft: `3px solid ${typeColor[entry.type]}` }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{typeLabel[entry.type]}</div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{formatDateShort(entry.time)}</div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: typeColor[entry.type] }}>{formatTime(entry.time)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══ ADMIN ══════════════════════════════════════════════════════ */}
          {loggedIn?.role === 'admin' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {[['list', '👥 Equipe'], ['reports', '💰 Pagamentos'], ['monthly', '📅 Mapa Mensal'], ['geofence', '📍 Local'], ['empresa', '🏢 Empresa']].map(([key, label]) => (
                  <button key={key} onClick={() => { setView(key); if (key === 'list') setAdminView('list') }} style={{ flex: 1, minWidth: 70, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', background: view === key ? '#6366f1' : '#1e293b', color: view === key ? '#fff' : '#64748b' }}>{label}</button>
                ))}
              </div>

              {/* EQUIPE */}
              {view === 'list' && (
                <>
                  {successMsg && <div style={{ background: '#16a34a20', border: '1px solid #22c55e60', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✅ {successMsg}</div>}

                  {adminView === 'list' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase' }}>Funcionários</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{employees.length} cadastrado(s)</div>
                        </div>
                        <Btn small onClick={() => { setForm({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8', overtimeRate: '50', cpf: '', admission: '', fgts: false }); setFormErrors({}); setEditingEmp(null); setAdminView('new') }}>+ Novo</Btn>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {employees.map(emp => {
                          const st = getState(emp.id)
                          const tw = (st.totalWork || 0) + (st.workStart ? now.getTime() - st.workStart.getTime() : 0)
                          const pay = calcPayment(emp, st, tw)
                          return (
                            <div key={emp.id} style={{ background: '#1e293b', borderRadius: 14, padding: 14, border: '1px solid #334155' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', position: 'relative' }}>
                                    {emp.avatar}
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: statusColor[st.status], border: '1.5px solid #1e293b' }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{emp.name}</div>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>{emp.role} · {emp.payType === 'hour' ? fmt(emp.payValue) + '/h' : fmt(emp.payValue) + '/dia'}</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <Btn small outline color="#6366f1" onClick={() => startEdit(emp)}>✏️</Btn>
                                  <Btn small outline color="#ef4444" onClick={() => deleteEmployee(emp.id)}>🗑</Btn>
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                <div style={{ background: '#0f172a', borderRadius: 8, padding: '7px 8px' }}>
                                  <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase' }}>Horas</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>{formatHours(tw)}</div>
                                </div>
                                <div style={{ background: '#0f172a', borderRadius: 8, padding: '7px 8px' }}>
                                  <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase' }}>Descontos</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: emp.discounts.length > 0 ? '#ef4444' : '#475569', marginTop: 2 }}>{emp.discounts.length > 0 ? '- ' + fmt(emp.discounts.reduce((s, d) => s + d.value, 0)) : 'Nenhum'}</div>
                                </div>
                                <div style={{ background: '#0f172a', borderRadius: 8, padding: '7px 8px' }}>
                                  <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase' }}>A receber</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginTop: 2 }}>{fmt(pay.net)}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {(adminView === 'new' || adminView === 'edit') && (
                    <div style={{ background: '#1e293b', borderRadius: 16, padding: 18, border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{adminView === 'new' ? '➕ Novo Funcionário' : '✏️ Editar'}</div>
                        <Btn small outline color="#64748b" onClick={() => { setAdminView('list'); setFormErrors({}) }}>← Voltar</Btn>
                      </div>
                      <Input label="Nome Completo" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: João da Silva" error={formErrors.name} />
                      <Input label="Cargo" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} placeholder="Ex: Operador" error={formErrors.role} />
                      <Input label="Usuário (login)" value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} placeholder="Ex: joao.silva" error={formErrors.username} />
                      <Input label={adminView === 'edit' ? 'Nova Senha (em branco = manter)' : 'Senha'} type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} placeholder="Digite a senha" error={formErrors.password} />
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Tipo de Pagamento</div>
                        <div style={{ display: 'flex', background: '#0f172a', borderRadius: 10, padding: 4 }}>
                          <button onClick={() => setForm(f => ({ ...f, payType: 'day' }))} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: form.payType === 'day' ? '#6366f1' : 'transparent', color: form.payType === 'day' ? '#fff' : '#64748b' }}>📅 Por Dia</button>
                          <button onClick={() => setForm(f => ({ ...f, payType: 'hour' }))} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: form.payType === 'hour' ? '#6366f1' : 'transparent', color: form.payType === 'hour' ? '#fff' : '#64748b' }}>⏱ Por Hora</button>
                        </div>
                      </div>
                      <Input label={form.payType === 'day' ? 'Valor por Dia (R$)' : 'Valor por Hora (R$)'} type="number" value={form.payValue} onChange={v => setForm(f => ({ ...f, payValue: v }))} placeholder={form.payType === 'day' ? 'Ex: 120.00' : 'Ex: 15.00'} error={formErrors.payValue} />
                      <Input label="Horas por Dia (jornada)" type="number" value={form.hoursPerDay} onChange={v => setForm(f => ({ ...f, hoursPerDay: v }))} placeholder="Ex: 8" />
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>⏰ Percentual Hora Extra</div>
                        <div style={{ display: 'flex', background: '#0f172a', borderRadius: 10, padding: 4, gap: 2 }}>
                          {(['50', '70', '100'] as const).map(rate => (
                            <button key={rate} onClick={() => setForm(f => ({ ...f, overtimeRate: rate }))}
                              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: form.overtimeRate === rate ? '#f59e0b' : 'transparent', color: form.overtimeRate === rate ? '#000' : '#64748b' }}>
                              +{rate}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid #1e293b' }}>
                        <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>📋 Dados para Holerite</div>
                        <Input label="CPF" value={(form as any).cpf || ''} onChange={v => setForm(f => ({ ...f, cpf: v } as any))} placeholder="000.000.000-00" />
                        <Input label="Data de Admissão" type="date" value={(form as any).admission || ''} onChange={v => setForm(f => ({ ...f, admission: v } as any))} placeholder="" />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0f172a', borderRadius: 10, marginBottom: 14 }}>
                          <input type="checkbox" id="fgts" checked={(form as any).fgts || false} onChange={e => setForm(f => ({ ...f, fgts: e.target.checked } as any))}
                            style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }} />
                          <label htmlFor="fgts" style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>Funcionário com FGTS (CLT)</label>
                        </div>
                      </div>
                      <Btn full onClick={saveEmployee} color="#6366f1">{adminView === 'new' ? '✅ Cadastrar' : '💾 Salvar'}</Btn>
                    </div>
                  )}
                </>
              )}

              {/* PAGAMENTOS ADMIN */}
              {view === 'reports' && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 14 }}>Relatório de Pagamentos</div>

                  <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 16, padding: 16, marginBottom: 14, border: '1px solid #22c55e30' }}>
                    <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>💰 Total a Pagar</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: '#22c55e' }}>
                      {fmt(employees.reduce((sum, emp) => {
                        const st = getState(emp.id)
                        const tw = (st.totalWork || 0) + (st.workStart ? now.getTime() - st.workStart.getTime() : 0)
                        return sum + calcPayment(emp, st, tw).net
                      }, 0))}
                    </div>
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>{employees.length} funcionário(s)</div>
                  </div>

                  {employees.map(emp => {
                    const st = getState(emp.id)
                    const tw = (st.totalWork || 0) + (st.workStart ? now.getTime() - st.workStart.getTime() : 0)
                    const pay = calcPayment(emp, st, tw)
                    const isOpen = expandedReport === emp.id
                    const isAddingDiscount = discountTarget === emp.id

                    return (
                      <div key={emp.id} style={{ background: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 12, border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isOpen ? 14 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>{emp.avatar}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{emp.name}</div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>{emp.payType === 'hour' ? fmt(emp.payValue) + '/h' : fmt(emp.payValue) + '/dia'}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{fmt(pay.net)}</div>
                            <button onClick={() => setExpandedReport(isOpen ? null : emp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6366f1', fontFamily: 'inherit', fontWeight: 700, marginTop: 2 }}>
                              {isOpen ? 'fechar ▲' : 'detalhes ▼'}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                              {[
                                { label: '⏱ Horas Trabalhadas', val: formatHours(pay.totalMs) + ' (' + formatDuration(pay.totalMs) + ')', color: '#22c55e' },
                                { label: '☕ Em Pausas', val: formatHours(pay.breakMs), color: '#f59e0b' },
                                { label: '📅 Dias Trabalhados', val: pay.daysWorked + ' dia(s)', color: '#06b6d4' },
                                { label: '💵 Valor Bruto', val: fmt(pay.grossValue), color: '#6366f1' },
                              ].map(({ label, val, color }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#0f172a', borderRadius: 8 }}>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color }}>{val}</span>
                                </div>
                              ))}
                              {pay.overtimeMs > 0 && Object.entries(pay.overtimeByRate).sort(([a],[b]) => Number(a)-Number(b)).map(([rate, ms]) => (
                                <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f59e0b10', borderRadius: 8, border: '1px solid #f59e0b30' }}>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>⚡ Horas Extras (+{rate}%)</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{formatHours(ms as number)}</span>
                                </div>
                              ))}
                              {pay.nightMs > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#6366f110', borderRadius: 8, border: '1px solid #6366f130' }}>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>🌙 Adicional Noturno (+20%)</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc' }}>+ {fmt(pay.nightBonus)}</span>
                                </div>
                              )}
                            </div>

                            {/* Descontos */}
                            <div style={{ background: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12, border: '1px solid #ef444425' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div style={{ fontSize: 10, letterSpacing: 2, color: '#ef4444', textTransform: 'uppercase' }}>⬇ Descontos</div>
                                <button onClick={() => { setDiscountTarget(isAddingDiscount ? null : emp.id); setDiscountForm({ value: '', reason: '' }); setDiscountError('') }}
                                  style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#ef4444', fontFamily: 'inherit' }}>
                                  {isAddingDiscount ? '✕ Cancelar' : '+ Desconto'}
                                </button>
                              </div>

                              {isAddingDiscount && (
                                <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #334155' }}>
                                  <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>Novo Desconto</div>
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Valor (R$)</div>
                                    <input type="number" value={discountForm.value} onChange={e => setDiscountForm(f => ({ ...f, value: e.target.value }))} placeholder="Ex: 50.00"
                                      style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                                  </div>
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Motivo / Observação</div>
                                    <textarea value={discountForm.reason} onChange={e => setDiscountForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex: Falta não justificada..."
                                      rows={3} style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                                  </div>
                                  {discountError && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>⚠️ {discountError}</div>}
                                  <Btn full onClick={() => addDiscount(emp.id)} color="#ef4444">✅ Confirmar Desconto</Btn>
                                </div>
                              )}

                              {pay.autoDeductions > 0 && (
                                <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 6, borderLeft: '3px solid #f59e0b' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>Pausas Excessivas</div>
                                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Automático</div>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>- {fmt(pay.autoDeductions)}</div>
                                  </div>
                                </div>
                              )}

                              {emp.discounts.length === 0 && pay.autoDeductions === 0 && (
                                <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '8px 0' }}>Nenhum desconto ainda</div>
                              )}

                              {emp.discounts.map(d => (
                                <div key={d.id} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 6, borderLeft: '3px solid #ef4444' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{d.reason}</div>
                                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Lançado em {d.date}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                      <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>- {fmt(d.value)}</div>
                                      <button onClick={() => removeDiscount(emp.id, d.id)} style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 10, color: '#ef4444', fontFamily: 'inherit' }}>🗑</button>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {(emp.discounts.length > 0 || pay.autoDeductions > 0) && (
                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Total Descontos</span>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>- {fmt(pay.totalDeductions)}</span>
                                </div>
                              )}
                            </div>

                            {/* Gratificações */}
                            {(() => {
                              const isAddingGratif = gratifTarget === emp.id
                              return (
                                <div style={{ background: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12, border: '1px solid #22c55e25' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#22c55e', textTransform: 'uppercase' }}>⭐ Gratificações</div>
                                    <button onClick={() => { setGratifTarget(isAddingGratif ? null : emp.id); setGratifForm({ value: '', reason: '' }); setGratifError('') }}
                                      style={{ background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#22c55e', fontFamily: 'inherit' }}>
                                      {isAddingGratif ? '✕ Cancelar' : '+ Gratificação'}
                                    </button>
                                  </div>
                                  {isAddingGratif && (
                                    <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #334155' }}>
                                      <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>Nova Gratificação</div>
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Valor (R$)</div>
                                        <input type="number" value={gratifForm.value} onChange={e => setGratifForm(f => ({ ...f, value: e.target.value }))} placeholder="Ex: 100.00"
                                          style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                                      </div>
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Motivo</div>
                                        <textarea value={gratifForm.reason} onChange={e => setGratifForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex: Bom desempenho..."
                                          rows={2} style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                                      </div>
                                      {gratifError && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>⚠️ {gratifError}</div>}
                                      <Btn full onClick={() => addGratification(emp.id)} color="#22c55e">✅ Confirmar Gratificação</Btn>
                                    </div>
                                  )}
                                  {(emp.gratifications || []).length === 0 && !isAddingGratif ? (
                                    <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '6px 0' }}>Nenhuma gratificação lançada</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {(emp.gratifications || []).map(g => (
                                        <div key={g.id} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #22c55e' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>{g.reason}</div>
                                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Lançado em {g.date}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                              <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>+ {fmt(g.value)}</span>
                                              <button onClick={() => removeGratification(emp.id, g.id)}
                                                style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: '#ef4444', fontSize: 10, fontFamily: 'inherit' }}>🗑</button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(emp.gratifications || []).length > 0 && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Total Gratificações</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>+ {fmt(pay.gratificationsTotal)}</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            <div style={{ background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>✅ Total Líquido</span>
                              <span style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>{fmt(pay.net)}</span>
                            </div>

                            <button
                              onClick={() => generateExtract(emp, st, pay)}
                              style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #6366f160', cursor: 'pointer', background: 'linear-gradient(135deg,#6366f115,#06b6d415)', color: '#a5b4fc', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            >
                              <span>📄</span> Baixar Holerite PDF
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}


              {/* GEOFENCE ADMIN */}
              {view === 'geofence' && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 14 }}>📍 Controle de Localização</div>

                  <div style={{ background: geofence ? '#22c55e15' : '#1e293b', border: `1px solid ${geofence ? '#22c55e40' : '#334155'}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: geofence ? '#4ade80' : '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                      {geofence ? '🟢 Cerca Ativa' : '🔴 Sem Restrição de Local'}
                    </div>
                    {geofence ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{geofence.address}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Raio permitido: <span style={{ color: '#06b6d4', fontWeight: 700 }}>{geofence.radius}m</span></div>
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>Coords: {geofence.lat.toFixed(5)}, {geofence.lng.toFixed(5)}</div>
                        <button onClick={async () => { await deleteDoc(doc(db, 'config', 'geofence')); setGeoForm({ address: '', radius: '100' }) }}
                          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #ef444440', background: '#ef444415', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🗑 Remover Cerca
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#64748b' }}>Funcionários podem bater ponto de qualquer lugar.</div>
                    )}
                  </div>

                  <div style={{ background: '#1e293b', borderRadius: 14, padding: 16, border: '1px solid #334155' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', marginBottom: 14 }}>{geofence ? '✏️ Alterar Localização' : '➕ Definir Localização'}</div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Endereço</div>
                      <input value={geoForm.address} onChange={e => setGeoForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Ex: Av. Paulista, 1000, São Paulo, SP"
                        style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                        Raio de Tolerância: <span style={{ color: '#06b6d4' }}>{geoForm.radius}m</span>
                      </div>
                      <input type="range" min="10" max="1000" step="10" value={geoForm.radius}
                        onChange={e => setGeoForm(f => ({ ...f, radius: e.target.value }))}
                        style={{ width: '100%', accentColor: '#6366f1' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#334155', marginTop: 4 }}>
                        <span>10m</span><span>500m</span><span>1000m</span>
                      </div>
                    </div>
                    {geoError && <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ef4444', marginBottom: 12 }}>⚠️ {geoError}</div>}
                    {geoSuccess && <div style={{ background: '#22c55e15', border: '1px solid #22c55e40', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#22c55e', marginBottom: 12 }}>✅ {geoSuccess}</div>}
                    <button onClick={saveGeofence} disabled={geoLoading}
                      style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: geoLoading ? 'wait' : 'pointer', background: geoLoading ? '#334155' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: geoLoading ? '#64748b' : '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                      {geoLoading ? '🔍 Buscando endereço...' : '📍 Salvar Localização'}
                    </button>
                  </div>
                </div>
              )}

              {/* EMPRESA */}
              {view === 'empresa' && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 14 }}>🏢 Dados da Empresa</div>

                  {/* Logo upload */}
                  <div style={{ background: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 14, border: '1px solid #334155', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>Logo da Empresa</div>
                    {companyForm.logo ? (
                      <div style={{ marginBottom: 10 }}>
                        <img src={companyForm.logo} alt="Logo" style={{ maxHeight: 80, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 12, background: '#0f172a', border: '2px dashed #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 28 }}>🏢</div>
                    )}
                    <label style={{ background: '#6366f120', border: '1px solid #6366f140', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#a5b4fc', display: 'inline-block' }}>
                      📷 {companyForm.logo ? 'Trocar Logo' : 'Enviar Logo'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setCompanyForm(f => ({ ...f, logo: ev.target?.result as string }))
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                    {companyForm.logo && (
                      <button onClick={() => setCompanyForm(f => ({ ...f, logo: '' }))}
                        style={{ marginLeft: 8, background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontFamily: 'inherit' }}>
                        🗑 Remover
                      </button>
                    )}
                  </div>

                  <Input label="Nome da Empresa" value={companyForm.name} onChange={v => setCompanyForm(f => ({ ...f, name: v }))} placeholder="Ex: Empresa LTDA" />
                  <Input label="CNPJ" value={companyForm.cnpj} onChange={v => setCompanyForm(f => ({ ...f, cnpj: v }))} placeholder="00.000.000/0000-00" />
                  <Input label="Endereço Completo" value={companyForm.address} onChange={v => setCompanyForm(f => ({ ...f, address: v }))} placeholder="Rua, Nº, Bairro, Cidade - UF" />
                  <Input label="Telefone" value={companyForm.phone} onChange={v => setCompanyForm(f => ({ ...f, phone: v }))} placeholder="(00) 00000-0000" />
                  <Input label="E-mail" value={companyForm.email} onChange={v => setCompanyForm(f => ({ ...f, email: v }))} placeholder="contato@empresa.com.br" />

                  {companySaved && <div style={{ background: '#22c55e15', border: '1px solid #22c55e40', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✅ Dados salvos com sucesso!</div>}
                  <Btn full color="#6366f1" onClick={async () => {
                    await setDoc(doc(db, 'config', 'company'), companyForm)
                    setCompanySaved(true)
                    setTimeout(() => setCompanySaved(false), 3000)
                  }}>💾 Salvar Dados da Empresa</Btn>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, textTransform: 'uppercase' }}>
            {loggedIn ? `👤 ${loggedIn.name}` : formatDate(now).split(',')[0]}
          </div>
          {loggedIn && (
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontFamily: 'inherit', fontWeight: 700 }}>Sair →</button>
          )}
        </div>
      </div>
    </div>
  )
}
