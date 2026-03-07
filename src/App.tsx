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

interface Employee {
  id: number; name: string; role: string; username: string; password: string; avatar: string
  payType: 'day' | 'hour'; payValue: number; hoursPerDay: number
  discounts: Discount[]
}

interface LogEntry { type: string; time: Date }
interface EmpState {
  status: string; log: LogEntry[]; workStart: Date | null; breakStart: Date | null
  totalWork: number; totalBreak: number; days: string[]
  dailyWork: Record<string, number> // date string -> ms worked that day
  dailyOff: Record<string, 'paid' | 'unpaid'> // date string -> folga remunerada ou nao
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
  const [form, setForm] = useState({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8' })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [successMsg, setSuccessMsg] = useState('')

  // Discount form
  const [discountTarget, setDiscountTarget] = useState<number | null>(null)
  const [discountForm, setDiscountForm] = useState({ value: '', reason: '' })
  const [discountError, setDiscountError] = useState('')
  const [expandedReport, setExpandedReport] = useState<number | null>(null)
  const [extractContent, setExtractContent] = useState<string | null>(null)
  const [extractCopied, setExtractCopied] = useState(false)

  // Monthly map
  const [mapTarget, setMapTarget] = useState<number | null>(null)
  const [mapMonth, setMapMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [editingDay, setEditingDay] = useState<{ empId: number; date: string } | null>(null)
  const [editTimes, setEditTimes] = useState({ entrada: '', almoco_ini: '', almoco_fim: '', saida: '' })

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
        } as EmpState
      })
      setRecords(recs)
    })
    return () => unsub()
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
    records[id] || { status: STATUS.OUT, log: [], workStart: null, breakStart: null, totalWork: 0, totalBreak: 0, days: [], dailyWork: {}, dailyOff: {} }

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
        s.totalWork = (state.totalWork || 0) + workedNow
        // Add to daily work
        const dailyWork = { ...(state.dailyWork || {}) }
        dailyWork[todayStr] = (dailyWork[todayStr] || 0) + workedNow
        s.dailyWork = dailyWork
        s.status = STATUS.OUT; s.workStart = null
        if (!s.days.includes(todayStr)) s.days = [...s.days, todayStr]
      } else if (type === 'inicio_pausa') {
        const workedNow = state.workStart ? ts.getTime() - state.workStart.getTime() : 0
        s.totalWork = (state.totalWork || 0) + workedNow
        // Add partial work to daily
        const dailyWork = { ...(state.dailyWork || {}) }
        dailyWork[todayStr] = (dailyWork[todayStr] || 0) + workedNow
        s.dailyWork = dailyWork
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

  // ── Payment calc ──────────────────────────────────────────────────────────
  const calcPayment = (emp: Employee, state: EmpState, liveWork: number) => {
    const totalMs = liveWork
    const totalHours = totalMs / 3600000
    const totalBreakMs = (state.totalBreak || 0) + (state.breakStart ? now.getTime() - state.breakStart.getTime() : 0)
    const breakHours = totalBreakMs / 3600000
    const daysWorked = state.days.length + (state.status !== STATUS.OUT ? 1 : 0)
    const paidOffDays = Object.values(state.dailyOff || {}).filter(v => v === 'paid').length
    const totalPaidDays = daysWorked + paidOffDays

    let grossValue = 0, autoDeductions = 0
    if (emp.payType === 'hour') {
      const paidOffMs = paidOffDays * emp.hoursPerDay * 3600000
      grossValue = (totalMs + paidOffMs) / 3600000 * emp.payValue
      autoDeductions = Math.max(0, breakHours - daysWorked) * emp.payValue
    } else {
      grossValue = totalPaidDays * emp.payValue
    }

    const manualDiscountTotal = emp.discounts.reduce((s, d) => s + d.value, 0)
    const totalDeductions = autoDeductions + manualDiscountTotal
    const net = Math.max(0, grossValue - totalDeductions)

    return { totalHours, totalMs, daysWorked, paidOffDays, totalPaidDays, grossValue, autoDeductions, manualDiscountTotal, totalDeductions, net, breakHours, breakMs: totalBreakMs }
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
    const data = { name: form.name, role: form.role, username: form.username, avatar: av, payType: form.payType as 'day' | 'hour', payValue: Number(form.payValue), hoursPerDay: Number(form.hoursPerDay) || 8, ...(form.password ? { password: form.password } : {}) }
    if (editingEmp) {
      const updated = { ...editingEmp, ...data }
      await setDoc(doc(db, 'employees', String(editingEmp.id)), updated)
      setSuccessMsg('Funcionário atualizado!')
    } else {
      const id = Date.now()
      const newEmp = { id, password: form.password, discounts: [], ...data }
      await setDoc(doc(db, 'employees', String(id)), newEmp)
      setSuccessMsg('Funcionário cadastrado!')
    }
    setTimeout(() => setSuccessMsg(''), 3000)
    setForm({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8' })
    setFormErrors({}); setEditingEmp(null); setAdminView('list')
  }

  const deleteEmployee = async (id: number) => {
    await deleteDoc(doc(db, 'employees', String(id)))
    await deleteDoc(doc(db, 'records', String(id)))
  }

  const startEdit = (emp: Employee) => {
    setEditingEmp(emp)
    setForm({ name: emp.name, role: emp.role, username: emp.username, password: '', payType: emp.payType, payValue: String(emp.payValue), hoursPerDay: String(emp.hoursPerDay) })
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

    const oldMs = (state.dailyWork || {})[date] || 0
    const diff = workedMs - oldMs
    const newDailyWork = { ...(state.dailyWork || {}), [date]: workedMs }
    const newTotalWork = Math.max(0, (state.totalWork || 0) + diff)

    let newDays = [...(state.days || [])]
    if (workedMs > 0 && !newDays.includes(date)) newDays = [...newDays, date]
    if (workedMs === 0) newDays = newDays.filter(d => d !== date)

    const updated = {
      ...state,
      dailyWork: newDailyWork,
      totalWork: newTotalWork,
      days: newDays,
      log: allLogs.map(e => ({ type: e.type, time: e.time.toISOString() })),
      workStart: state.workStart ? state.workStart.toISOString() : null,
      breakStart: state.breakStart ? state.breakStart.toISOString() : null,
    }
    await setDoc(doc(db, 'records', String(empId)), updated)
    setEditingDay(null)
    setEditTimes({ entrada: '', almoco_ini: '', almoco_fim: '', saida: '' })
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
  const generateExtract = (emp: Employee, state: EmpState, payment: ReturnType<typeof calcPayment>) => {
    const geradoEm = new Date().toLocaleString('pt-BR')
    const lines: string[] = []
    lines.push('EXTRATO DE HORAS TRABALHADAS')
    lines.push('PontoApp - Sistema de Controle de Ponto')
    lines.push('━'.repeat(48))
    lines.push('')
    lines.push(`Funcionario : ${emp.name}`)
    lines.push(`Cargo       : ${emp.role}`)
    lines.push(`Gerado em   : ${geradoEm}`)
    lines.push('')
    lines.push('━'.repeat(48))
    lines.push('RESUMO')
    lines.push('━'.repeat(48))
    lines.push(`Horas Trabalhadas : ${formatHours(payment.totalMs)} (${formatDuration(payment.totalMs)})`)
    lines.push(`Total em Pausas   : ${formatHours(payment.breakMs)} (${formatDuration(payment.breakMs)})`)
    lines.push(`Dias Trabalhados  : ${payment.daysWorked} dia(s)`)
    lines.push(`Valor por ${emp.payType === 'hour' ? 'Hora' : 'Dia '}  : ${fmt(emp.payValue)}`)
    lines.push(`Valor Bruto       : ${fmt(payment.grossValue)}`)
    lines.push('')
    // Daily breakdown
    if (state.dailyWork && Object.keys(state.dailyWork).length > 0) {
      lines.push('━'.repeat(48))
      lines.push('HORAS POR DIA')
      lines.push('━'.repeat(48))
      Object.entries(state.dailyWork).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, ms]) => {
        const [y, mo, d] = date.split('-')
        lines.push(`${d}/${mo}/${y}  :  ${msToHHMM(ms)} (${formatDuration(ms)})`)
      })
      lines.push('')
    }
    lines.push('━'.repeat(48))
    lines.push('DESCONTOS')
    lines.push('━'.repeat(48))
    if (payment.autoDeductions > 0) lines.push(`Pausas Excessivas (auto) : - ${fmt(payment.autoDeductions)}`)
    if (emp.discounts.length === 0 && payment.autoDeductions === 0) {
      lines.push('Nenhum desconto aplicado.')
    } else {
      emp.discounts.forEach(d => lines.push(`${d.reason} (${d.date}) : - ${fmt(d.value)}`))
    }
    lines.push(`Total Descontos   : - ${fmt(payment.totalDeductions)}`)
    lines.push('')
    lines.push('━'.repeat(48))
    lines.push(`TOTAL LIQUIDO A RECEBER: ${fmt(payment.net)}`)
    lines.push('━'.repeat(48))
    lines.push('')
    if (state.log.length > 0) {
      lines.push('HISTORICO DE REGISTROS')
      lines.push('━'.repeat(48))
      ;[...state.log].reverse().forEach(entry => {
        lines.push(`${typeLabel[entry.type].padEnd(18)} ${formatDateShort(entry.time)}  ${formatTime(entry.time)}`)
      })
      lines.push('')
    }
    lines.push('━'.repeat(48))
    lines.push('Documento gerado automaticamente pelo PontoApp.')
    setExtractContent(lines.join('\n'))
    setExtractCopied(false)
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
                {[['list', '👥 Equipe'], ['reports', '💰 Pagamentos'], ['monthly', '📅 Mapa Mensal'], ['geofence', '📍 Local']].map(([key, label]) => (
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
                        <Btn small onClick={() => { setForm({ name: '', role: '', username: '', password: '', payType: 'day', payValue: '', hoursPerDay: '8' }); setFormErrors({}); setEditingEmp(null); setAdminView('new') }}>+ Novo</Btn>
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

                            <div style={{ background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>✅ Total Líquido</span>
                              <span style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>{fmt(pay.net)}</span>
                            </div>

                            <button
                              onClick={() => { generateExtract(emp, st, pay); setExtractCopied(false) }}
                              style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #6366f160', cursor: 'pointer', background: 'linear-gradient(135deg,#6366f115,#06b6d415)', color: '#a5b4fc', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            >
                              <span>📄</span> Ver Extrato de Horas
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Modal Extrato */}
                  {extractContent && (
                    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ width: '100%', maxWidth: 420, background: '#0f172a', borderRadius: '20px 20px 0 0', border: '1px solid #334155', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>📄 Extrato de Horas</div>
                          <button onClick={() => setExtractContent(null)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 12, fontFamily: 'inherit' }}>✕ Fechar</button>
                        </div>
                        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
                          <pre style={{ margin: 0, fontFamily: "'Courier New', monospace", fontSize: 11, color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{extractContent}</pre>
                        </div>
                        <div style={{ padding: '14px 20px', borderTop: '1px solid #1e293b', flexShrink: 0, display: 'flex', gap: 10 }}>
                          <button onClick={() => { navigator.clipboard.writeText(extractContent); setExtractCopied(true); setTimeout(() => setExtractCopied(false), 2500) }}
                            style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', background: extractCopied ? '#16a34a' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                            {extractCopied ? '✅ Copiado!' : '📋 Copiar'}
                          </button>
                          <button onClick={() => {
                            const win = window.open('', '_blank')
                            if (win) {
                              win.document.write(`<html><head><title>Extrato</title><style>body{font-family:'Courier New',monospace;font-size:13px;line-height:1.8;padding:32px;}pre{white-space:pre-wrap;}</style></head><body><pre>${extractContent}</pre><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`)
                              win.document.close()
                            }
                          }} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #334155', cursor: 'pointer', background: '#1e293b', color: '#94a3b8', fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                            🖨️ Imprimir
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ MAPA MENSAL ══════════════════════════════════════════════ */}
              {view === 'monthly' && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', textTransform: 'uppercase', marginBottom: 14 }}>📅 Mapa Mensal de Horas</div>

                  {/* Month selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: '#1e293b', borderRadius: 12, padding: '10px 14px', border: '1px solid #334155' }}>
                    <button onClick={() => {
                      const [y, m] = mapMonth.split('-').map(Number)
                      const d = new Date(y, m - 2, 1)
                      setMapMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
                    }} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontFamily: 'inherit' }}>◀</button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
                        {new Date(mapMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                      </div>
                    </div>
                    <button onClick={() => {
                      const [y, m] = mapMonth.split('-').map(Number)
                      const d = new Date(y, m, 1)
                      setMapMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
                    }} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontFamily: 'inherit' }}>▶</button>
                  </div>

                  {/* Employee selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {employees.map(emp => (
                      <button key={emp.id} onClick={() => setMapTarget(mapTarget === emp.id ? null : emp.id)}
                        style={{ background: mapTarget === emp.id ? '#6366f120' : '#1e293b', border: `1px solid ${mapTarget === emp.id ? '#6366f160' : '#334155'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{emp.avatar}</div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{emp.name}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{emp.role}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>{mapTarget === emp.id ? 'fechar ▲' : 'ver mapa ▼'}</div>
                      </button>
                    ))}
                  </div>

                  {/* Monthly calendar for selected employee */}
                  {mapTarget !== null && (() => {
                    const emp = employees.find(e => e.id === mapTarget)
                    if (!emp) return null
                    const st = getState(emp.id)
                    const [y, m] = mapMonth.split('-').map(Number)
                    const days = getDaysInMonth(y, m - 1)
                    const dailyWork = st.dailyWork || {}
                    const monthTotal = days.reduce((sum, d) => sum + (dailyWork[d] || 0), 0)

                    return (
                      <div style={{ background: '#1e293b', borderRadius: 14, padding: 16, border: '1px solid #334155', marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>{emp.name}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Total: {msToHHMM(monthTotal)}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {days.map(date => {
                            const ms = dailyWork[date] || 0
                            const [, , d] = date.split('-')
                            const weekday = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })
                            const isToday = date === todayStr
                            const isEditing = editingDay?.empId === emp.id && editingDay?.date === date
                            const isWeekend = new Date(date + 'T12:00:00').getDay() === 0 || new Date(date + 'T12:00:00').getDay() === 6
                            const offType = (st.dailyOff || {})[date]
                            const isPaidOff = offType === 'paid'
                            const isUnpaidOff = offType === 'unpaid'

                            const rowBg = isPaidOff ? '#7c3aed15' : isUnpaidOff ? '#33415515' : isToday ? '#6366f115' : '#0f172a'
                            const rowBorder = isPaidOff ? '1px solid #7c3aed40' : isUnpaidOff ? '1px solid #47556940' : isToday ? '1px solid #6366f140' : '1px solid transparent'

                            return (
                              <div key={date}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: rowBg, borderRadius: 8, border: rowBorder }}>
                                  <div style={{ width: 28, textAlign: 'center' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#a5b4fc' : isPaidOff ? '#c4b5fd' : isUnpaidOff ? '#64748b' : isWeekend ? '#475569' : '#94a3b8' }}>{d}</div>
                                    <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase' }}>{weekday}</div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    {isPaidOff ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 14 }}>🌴</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd' }}>Folga Remunerada</span>
                                      </div>
                                    ) : isUnpaidOff ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 14 }}>⚫</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Folga Não Remunerada</span>
                                      </div>
                                    ) : ms > 0 ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                                          <div style={{ height: '100%', background: '#22c55e', borderRadius: 3, width: `${Math.min(100, (ms / (emp.hoursPerDay * 3600000)) * 100)}%` }} />
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', minWidth: 42 }}>{msToHHMM(ms)}</span>
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: isWeekend ? '#334155' : '#475569' }}>{isWeekend ? '—' : 'Sem registro'}</div>
                                    )}
                                  </div>
                                  <button onClick={() => {
                                    if (isEditing) { setEditingDay(null); return }
                                    setEditingDay({ empId: emp.id, date })
                                    const dayLogs = st.log.filter(e => new Date(e.time).toISOString().split('T')[0] === date)
                                    const getTime = (type: string) => {
                                      const entry = dayLogs.find(e => e.type === type)
                                      if (!entry) return ''
                                      const t = new Date(entry.time)
                                      return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
                                    }
                                    setEditTimes({
                                      entrada: getTime('entrada'),
                                      almoco_ini: getTime('inicio_pausa'),
                                      almoco_fim: getTime('fim_pausa'),
                                      saida: getTime('saida'),
                                    })
                                  }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#64748b', fontSize: 10, fontFamily: 'inherit' }}>
                                    {isEditing ? '✕' : '✏️'}
                                  </button>
                                </div>

                                {/* Edit / Folga panel */}
                                {isEditing && (
                                  <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, margin: '4px 0', border: '1px solid #6366f140' }}>
                                    <div style={{ fontSize: 10, color: '#6366f1', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>✏️ Editar dia {d}/{String(m).padStart(2,'0')}</div>

                                    {/* Folga buttons */}
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                      <button onClick={() => markDayOff(emp.id, date, isPaidOff ? null : 'paid')}
                                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${isPaidOff ? '#7c3aed' : '#7c3aed40'}`, background: isPaidOff ? '#7c3aed30' : 'transparent', color: isPaidOff ? '#c4b5fd' : '#7c3aed', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        🌴 {isPaidOff ? 'Remover Folga' : 'Folga Remunerada'}
                                      </button>
                                      <button onClick={() => markDayOff(emp.id, date, isUnpaidOff ? null : 'unpaid')}
                                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${isUnpaidOff ? '#475569' : '#33415540'}`, background: isUnpaidOff ? '#33415530' : 'transparent', color: isUnpaidOff ? '#94a3b8' : '#475569', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        ⚫ {isUnpaidOff ? 'Remover Folga' : 'Folga Não Rem.'}
                                      </button>
                                    </div>

                                    {/* Separator */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                      <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
                                      <span style={{ fontSize: 9, color: '#334155', letterSpacing: 2 }}>OU EDITAR HORÁRIOS</span>
                                      <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                                      {[
                                        { key: 'entrada', label: '▶ Entrada', color: '#22c55e' },
                                        { key: 'almoco_ini', label: '🍽️ Início Almoço', color: '#f59e0b' },
                                        { key: 'almoco_fim', label: '🔙 Volta Almoço', color: '#3b82f6' },
                                        { key: 'saida', label: '■ Saída', color: '#ef4444' },
                                      ].map(({ key, label, color }) => (
                                        <div key={key}>
                                          <div style={{ fontSize: 9, color, marginBottom: 4, fontWeight: 700 }}>{label}</div>
                                          <input
                                            type="time"
                                            value={editTimes[key as keyof typeof editTimes]}
                                            onChange={e => setEditTimes(t => ({ ...t, [key]: e.target.value }))}
                                            style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 10px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    {editTimes.entrada && editTimes.saida && (() => {
                                      const tsE = timeToMs(editTimes.entrada, date)
                                      const tsS = timeToMs(editTimes.saida, date)
                                      const tsAI = timeToMs(editTimes.almoco_ini, date)
                                      const tsAF = timeToMs(editTimes.almoco_fim, date)
                                      if (!tsE || !tsS || tsS <= tsE) return null
                                      let brk = 0
                                      if (tsAI && tsAF && tsAF > tsAI) brk = tsAF - tsAI
                                      const worked = Math.max(0, tsS - tsE - brk)
                                      return (
                                        <div style={{ background: '#22c55e15', border: '1px solid #22c55e30', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ fontSize: 11, color: '#64748b' }}>Total calculado</span>
                                          <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>{msToHHMM(worked)}</span>
                                        </div>
                                      )
                                    })()}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <Btn full onClick={saveEditedHours} color="#22c55e">💾 Salvar Horários</Btn>
                                      <Btn full outline color="#64748b" onClick={() => setEditingDay(null)}>Fechar</Btn>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #334155' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>Total trabalhado</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>{msToHHMM(monthTotal)}</span>
                          </div>
                          {(() => {
                            const paidOff = days.filter(d => (st.dailyOff || {})[d] === 'paid').length
                            const unpaidOff = days.filter(d => (st.dailyOff || {})[d] === 'unpaid').length
                            return (<>
                              {paidOff > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11, color: '#c4b5fd' }}>🌴 Folgas remuneradas</span><span style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd' }}>{paidOff} dia(s)</span></div>}
                              {unpaidOff > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#64748b' }}>⚫ Folgas não remuneradas</span><span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{unpaidOff} dia(s)</span></div>}
                            </>)
                          })()}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

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
