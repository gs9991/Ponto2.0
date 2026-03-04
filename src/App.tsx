import { useState, useEffect } from 'react';

const ADMIN = {
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  name: 'Administrador',
  id: 0,
  avatar: 'AD',
};

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
function formatDuration(ms: number) {
  if (!ms || ms < 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const STATUS = { OUT: 'out', IN: 'in', BREAK: 'break' };
const statusLabel: Record<string, string> = {
  out: 'Fora',
  in: 'Trabalhando',
  break: 'Pausa',
};
const statusColor: Record<string, string> = {
  out: '#94a3b8',
  in: '#22c55e',
  break: '#f59e0b',
};
const typeLabel: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  inicio_pausa: 'Início de Pausa',
  fim_pausa: 'Fim de Pausa',
};
const typeColor: Record<string, string> = {
  entrada: '#22c55e',
  saida: '#ef4444',
  inicio_pausa: '#f59e0b',
  fim_pausa: '#3b82f6',
};

interface Employee {
  id: number;
  name: string;
  role: string;
  username: string;
  password: string;
  avatar: string;
}

interface LogEntry {
  type: string;
  time: Date;
}

interface EmpState {
  status: string;
  log: LogEntry[];
  workStart: Date | null;
  breakStart: Date | null;
  totalWork: number;
  totalBreak: number;
}

interface User extends Employee {
  role: string;
}

interface InputProps {
  label?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}

function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
}: InputProps) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: '#475569',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={type === 'password' && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#0f172a',
            border: `1px solid ${error ? '#ef4444' : '#334155'}`,
            borderRadius: 10,
            padding: '12px 40px 12px 14px',
            color: '#f1f5f9',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {type === 'password' && (
          <button
            onClick={() => setShow((s) => !s)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: 14,
            }}
          >
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

interface BtnProps {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
  outline?: boolean;
}

function Btn({
  children,
  onClick,
  color = '#6366f1',
  disabled,
  full,
  small,
  outline,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? '100%' : 'auto',
        padding: small ? '8px 14px' : '13px 20px',
        borderRadius: 10,
        border: outline ? `1.5px solid ${color}` : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#1e293b' : outline ? 'transparent' : color,
        color: disabled ? '#334155' : outline ? color : '#fff',
        fontSize: small ? 11 : 13,
        fontWeight: 700,
        fontFamily: 'inherit',
        letterSpacing: 0.5,
        transition: 'all 0.2s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function PontoApp() {
  const [now, setNow] = useState(new Date());
  const [loggedIn, setLoggedIn] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([
    {
      id: 1,
      name: 'Ana Silva',
      role: 'Desenvolvedora',
      username: 'ana',
      password: '1234',
      avatar: 'AS',
    },
    {
      id: 2,
      name: 'Carlos Mendes',
      role: 'Designer',
      username: 'carlos',
      password: '1234',
      avatar: 'CM',
    },
  ]);
  const [records, setRecords] = useState<Record<number, EmpState>>({});
  const [view, setView] = useState('clock');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminView, setAdminView] = useState('list');
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    name: '',
    role: '',
    username: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogin = () => {
    setLoginError('');
    if (loginUser === ADMIN.username && loginPass === ADMIN.password) {
      setLoggedIn({ ...ADMIN, role: 'admin' });
      setView('list');
      return;
    }
    const emp = employees.find(
      (e) => e.username === loginUser && e.password === loginPass
    );
    if (emp) {
      setLoggedIn({ ...emp, role: 'employee' });
      setView('clock');
      return;
    }
    setLoginError('Usuário ou senha incorretos.');
  };

  const handleLogout = () => {
    setLoggedIn(null);
    setLoginUser('');
    setLoginPass('');
    setLoginError('');
    setAdminView('list');
  };

  const getState = (id: number): EmpState =>
    records[id] || {
      status: STATUS.OUT,
      log: [],
      workStart: null,
      breakStart: null,
      totalWork: 0,
      totalBreak: 0,
    };

  const punch = (type: string) => {
    if (!loggedIn || loggedIn.role !== 'employee') return;
    const id = loggedIn.id;
    const state = getState(id);
    const timestamp = new Date();
    const newLog = [...state.log, { type, time: timestamp }];
    let s: EmpState = { ...state, log: newLog };
    if (type === 'entrada') {
      s.status = STATUS.IN;
      s.workStart = timestamp;
    } else if (type === 'saida') {
      s.totalWork =
        (state.totalWork || 0) +
        (state.workStart ? timestamp.getTime() - state.workStart.getTime() : 0);
      s.status = STATUS.OUT;
      s.workStart = null;
    } else if (type === 'inicio_pausa') {
      s.totalWork =
        (state.totalWork || 0) +
        (state.workStart ? timestamp.getTime() - state.workStart.getTime() : 0);
      s.status = STATUS.BREAK;
      s.workStart = null;
      s.breakStart = timestamp;
    } else if (type === 'fim_pausa') {
      s.totalBreak =
        (state.totalBreak || 0) +
        (state.breakStart
          ? timestamp.getTime() - state.breakStart.getTime()
          : 0);
      s.status = STATUS.IN;
      s.breakStart = null;
      s.workStart = timestamp;
    }
    setRecords((prev) => ({ ...prev, [id]: s }));
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Nome obrigatório';
    if (!form.role.trim()) e.role = 'Cargo obrigatório';
    if (!form.username.trim()) e.username = 'Usuário obrigatório';
    else if (
      employees.find(
        (emp) => emp.username === form.username && emp.id !== editingEmp?.id
      )
    )
      e.username = 'Usuário já cadastrado';
    if (!editingEmp && !form.password.trim()) e.password = 'Senha obrigatória';
    return e;
  };

  const saveEmployee = () => {
    const e = validateForm();
    if (Object.keys(e).length) {
      setFormErrors(e);
      return;
    }
    const avatarStr = form.name
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    if (editingEmp) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmp.id
            ? {
                ...emp,
                name: form.name,
                role: form.role,
                username: form.username,
                avatar: avatarStr,
                ...(form.password ? { password: form.password } : {}),
              }
            : emp
        )
      );
      setSuccessMsg('Funcionário atualizado!');
    } else {
      setEmployees((prev) => [
        ...prev,
        {
          id: Date.now(),
          name: form.name,
          role: form.role,
          username: form.username,
          password: form.password,
          avatar: avatarStr,
        },
      ]);
      setSuccessMsg('Funcionário cadastrado!');
    }
    setTimeout(() => setSuccessMsg(''), 3000);
    setForm({ name: '', role: '', username: '', password: '' });
    setFormErrors({});
    setEditingEmp(null);
    setAdminView('list');
  };

  const deleteEmployee = (id: number) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setRecords((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const startEdit = (emp: Employee) => {
    setEditingEmp(emp);
    setForm({
      name: emp.name,
      role: emp.role,
      username: emp.username,
      password: '',
    });
    setFormErrors({});
    setAdminView('edit');
  };

  const empState = loggedIn?.role === 'employee' ? getState(loggedIn.id) : null;
  const liveWork = empState
    ? (empState.totalWork || 0) +
      (empState.workStart ? now.getTime() - empState.workStart.getTime() : 0)
    : 0;
  const liveBreak = empState
    ? (empState.totalBreak || 0) +
      (empState.breakStart ? now.getTime() - empState.breakStart.getTime() : 0)
    : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        justifyContent: 'center',
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          minHeight: '100vh',
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)',
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: 4,
                color: '#475569',
                textTransform: 'uppercase',
              }}
            >
              Sistema de Ponto
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}>
              ⏱ PontoApp
            </div>
          </div>
          <div
            style={{
              textAlign: 'right',
              background: '#1e293b',
              borderRadius: 12,
              padding: '8px 14px',
              border: '1px solid #334155',
            }}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#06b6d4',
                letterSpacing: 1,
              }}
            >
              {formatTime(now)}
            </div>
            <div
              style={{
                fontSize: 9,
                color: '#64748b',
                textTransform: 'capitalize',
              }}
            >
              {formatDate(now).split(',')[0]}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          {/* LOGIN */}
          {!loggedIn && (
            <div>
              <div style={{ textAlign: 'center', margin: '20px 0 28px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
                <div
                  style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}
                >
                  Bem-vindo
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  Entre com suas credenciais
                </div>
              </div>
              <div
                style={{
                  background: '#1e293b',
                  borderRadius: 16,
                  padding: 20,
                  border: '1px solid #334155',
                  marginBottom: 14,
                }}
              >
                <Input
                  label="Usuário"
                  value={loginUser}
                  onChange={setLoginUser}
                  placeholder="Digite seu usuário"
                />
                <Input
                  label="Senha"
                  type="password"
                  value={loginPass}
                  onChange={setLoginPass}
                  placeholder="Digite sua senha"
                  error={loginError}
                />
                <Btn full onClick={handleLogin}>
                  Entrar no Sistema
                </Btn>
              </div>
              <div
                style={{
                  background: '#1e293b40',
                  borderRadius: 12,
                  padding: 14,
                  border: '1px solid #1e293b',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 2,
                    color: '#475569',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  🔑 Credenciais de Teste
                </div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 2 }}>
                  Admin: <span style={{ color: '#a5b4fc' }}>admin</span> /{' '}
                  <span style={{ color: '#a5b4fc' }}>admin123</span>
                  <br />
                  Funcionários: <span style={{ color: '#a5b4fc' }}>
                    ana
                  </span> ou <span style={{ color: '#a5b4fc' }}>carlos</span> /{' '}
                  <span style={{ color: '#a5b4fc' }}>1234</span>
                </div>
              </div>
            </div>
          )}

          {/* FUNCIONÁRIO */}
          {loggedIn?.role === 'employee' && empState && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  ['clock', '🕐 Ponto'],
                  ['history', '📋 Histórico'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      background: view === key ? '#6366f1' : '#1e293b',
                      color: view === key ? '#fff' : '#64748b',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === 'clock' && (
                <>
                  <div
                    style={{
                      background: 'linear-gradient(135deg,#1e293b,#0f172a)',
                      borderRadius: 16,
                      padding: 18,
                      marginBottom: 14,
                      border: `1px solid ${statusColor[empState.status]}40`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: '#6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            fontWeight: 800,
                            color: '#fff',
                          }}
                        >
                          {loggedIn.avatar}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: '#f1f5f9',
                            }}
                          >
                            {loggedIn.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {loggedIn.role}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '5px 12px',
                          borderRadius: 20,
                          background: `${statusColor[empState.status]}20`,
                          border: `1px solid ${statusColor[empState.status]}60`,
                          fontSize: 11,
                          fontWeight: 700,
                          color: statusColor[empState.status],
                        }}
                      >
                        {statusLabel[empState.status]}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div
                        style={{
                          flex: 1,
                          background: '#0f172a',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: 2,
                            color: '#475569',
                            textTransform: 'uppercase',
                          }}
                        >
                          Trabalhado
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#22c55e',
                            marginTop: 4,
                          }}
                        >
                          {formatDuration(liveWork)}
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          background: '#0f172a',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: 2,
                            color: '#475569',
                            textTransform: 'uppercase',
                          }}
                        >
                          Pausas
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#f59e0b',
                            marginTop: 4,
                          }}
                        >
                          {formatDuration(liveBreak)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    {[
                      {
                        type: 'entrada',
                        label: 'Entrada',
                        icon: '▶',
                        color: '#22c55e',
                        disabled: empState.status !== STATUS.OUT,
                      },
                      {
                        type: 'inicio_pausa',
                        label: 'Pausar',
                        icon: '⏸',
                        color: '#f59e0b',
                        disabled: empState.status !== STATUS.IN,
                      },
                      {
                        type: 'fim_pausa',
                        label: 'Retornar',
                        icon: '↩',
                        color: '#3b82f6',
                        disabled: empState.status !== STATUS.BREAK,
                      },
                      {
                        type: 'saida',
                        label: 'Saída',
                        icon: '■',
                        color: '#ef4444',
                        disabled: empState.status === STATUS.OUT,
                      },
                    ].map(({ type, label, icon, color, disabled }) => (
                      <button
                        key={type}
                        onClick={() => !disabled && punch(type)}
                        style={{
                          padding: '16px 0',
                          borderRadius: 12,
                          border: `1px solid ${
                            disabled ? '#334155' : color + '60'
                          }`,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: disabled ? '#1e293b' : `${color}20`,
                          color: disabled ? '#334155' : color,
                          fontSize: 13,
                          fontWeight: 800,
                          fontFamily: 'inherit',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>

                  {empState.log.length > 0 && (
                    <div
                      style={{
                        background: '#1e293b',
                        borderRadius: 12,
                        padding: 14,
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: 3,
                          color: '#475569',
                          textTransform: 'uppercase',
                          marginBottom: 10,
                        }}
                      >
                        Registros de Hoje
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        {[...empState.log]
                          .reverse()
                          .slice(0, 5)
                          .map((entry, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '8px 10px',
                                background: '#0f172a',
                                borderRadius: 8,
                                borderLeft: `3px solid ${
                                  typeColor[entry.type]
                                }`,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  color: '#cbd5e1',
                                  fontWeight: 600,
                                }}
                              >
                                {typeLabel[entry.type]}
                              </span>
                              <span style={{ fontSize: 12, color: '#64748b' }}>
                                {formatTime(entry.time)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {view === 'history' && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 3,
                      color: '#475569',
                      textTransform: 'uppercase',
                      marginBottom: 12,
                    }}
                  >
                    Meu Histórico
                  </div>
                  {empState.log.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '50px 0',
                        color: '#475569',
                      }}
                    >
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                      <div style={{ fontSize: 13 }}>Nenhum registro ainda</div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {[...empState.log].reverse().map((entry, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            background: '#1e293b',
                            borderRadius: 10,
                            borderLeft: `3px solid ${typeColor[entry.type]}`,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#f1f5f9',
                              }}
                            >
                              {typeLabel[entry.type]}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: '#64748b',
                                marginTop: 2,
                              }}
                            >
                              {formatDate(entry.time)}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: typeColor[entry.type],
                            }}
                          >
                            {formatTime(entry.time)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ADMIN */}
          {loggedIn?.role === 'admin' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  ['list', '👥 Funcionários'],
                  ['reports', '📊 Relatórios'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setView(key);
                      if (key === 'list') setAdminView('list');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      background: view === key ? '#6366f1' : '#1e293b',
                      color: view === key ? '#fff' : '#64748b',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === 'list' && (
                <>
                  {successMsg && (
                    <div
                      style={{
                        background: '#16a34a20',
                        border: '1px solid #22c55e60',
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: 14,
                        fontSize: 12,
                        color: '#22c55e',
                        fontWeight: 600,
                      }}
                    >
                      ✅ {successMsg}
                    </div>
                  )}

                  {adminView === 'list' && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              letterSpacing: 3,
                              color: '#475569',
                              textTransform: 'uppercase',
                            }}
                          >
                            Funcionários
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#64748b',
                              marginTop: 2,
                            }}
                          >
                            {employees.length} cadastrado(s)
                          </div>
                        </div>
                        <Btn
                          small
                          onClick={() => {
                            setForm({
                              name: '',
                              role: '',
                              username: '',
                              password: '',
                            });
                            setFormErrors({});
                            setEditingEmp(null);
                            setAdminView('new');
                          }}
                        >
                          + Novo
                        </Btn>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        {employees.map((emp) => {
                          const st = getState(emp.id);
                          const tw =
                            (st.totalWork || 0) +
                            (st.workStart
                              ? now.getTime() - st.workStart.getTime()
                              : 0);
                          return (
                            <div
                              key={emp.id}
                              style={{
                                background: '#1e293b',
                                borderRadius: 14,
                                padding: 14,
                                border: '1px solid #334155',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 10,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 40,
                                      height: 40,
                                      borderRadius: '50%',
                                      background: '#6366f1',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 13,
                                      fontWeight: 800,
                                      color: '#fff',
                                      position: 'relative',
                                    }}
                                  >
                                    {emp.avatar}
                                    <div
                                      style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        width: 9,
                                        height: 9,
                                        borderRadius: '50%',
                                        background: statusColor[st.status],
                                        border: '1.5px solid #1e293b',
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: '#f1f5f9',
                                      }}
                                    >
                                      {emp.name}
                                    </div>
                                    <div
                                      style={{ fontSize: 10, color: '#64748b' }}
                                    >
                                      {emp.role} · @{emp.username}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <Btn
                                    small
                                    outline
                                    color="#6366f1"
                                    onClick={() => startEdit(emp)}
                                  >
                                    ✏️
                                  </Btn>
                                  <Btn
                                    small
                                    outline
                                    color="#ef4444"
                                    onClick={() => deleteEmployee(emp.id)}
                                  >
                                    🗑
                                  </Btn>
                                </div>
                              </div>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr 1fr',
                                  gap: 6,
                                }}
                              >
                                <div
                                  style={{
                                    background: '#0f172a',
                                    borderRadius: 8,
                                    padding: '7px 8px',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    Trabalhado
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: '#22c55e',
                                      marginTop: 2,
                                    }}
                                  >
                                    {formatDuration(tw)}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    background: '#0f172a',
                                    borderRadius: 8,
                                    padding: '7px 8px',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    Status
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: statusColor[st.status],
                                      marginTop: 2,
                                    }}
                                  >
                                    {statusLabel[st.status]}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    background: '#0f172a',
                                    borderRadius: 8,
                                    padding: '7px 8px',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 9,
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    Registros
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: '#06b6d4',
                                      marginTop: 2,
                                    }}
                                  >
                                    {st.log.length}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {(adminView === 'new' || adminView === 'edit') && (
                    <div
                      style={{
                        background: '#1e293b',
                        borderRadius: 16,
                        padding: 18,
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 18,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: '#f1f5f9',
                          }}
                        >
                          {adminView === 'new'
                            ? '➕ Novo Funcionário'
                            : '✏️ Editar'}
                        </div>
                        <Btn
                          small
                          outline
                          color="#64748b"
                          onClick={() => {
                            setAdminView('list');
                            setFormErrors({});
                          }}
                        >
                          ← Voltar
                        </Btn>
                      </div>
                      <Input
                        label="Nome Completo"
                        value={form.name}
                        onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                        placeholder="Ex: João da Silva"
                        error={formErrors.name}
                      />
                      <Input
                        label="Cargo"
                        value={form.role}
                        onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                        placeholder="Ex: Operador"
                        error={formErrors.role}
                      />
                      <Input
                        label="Usuário (login)"
                        value={form.username}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, username: v }))
                        }
                        placeholder="Ex: joao.silva"
                        error={formErrors.username}
                      />
                      <Input
                        label={
                          adminView === 'edit'
                            ? 'Nova Senha (em branco = manter)'
                            : 'Senha'
                        }
                        type="password"
                        value={form.password}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, password: v }))
                        }
                        placeholder="Digite a senha"
                        error={formErrors.password}
                      />
                      <Btn full onClick={saveEmployee} color="#6366f1">
                        {adminView === 'new' ? '✅ Cadastrar' : '💾 Salvar'}
                      </Btn>
                    </div>
                  )}
                </>
              )}

              {view === 'reports' && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 3,
                      color: '#475569',
                      textTransform: 'uppercase',
                      marginBottom: 14,
                    }}
                  >
                    Relatório Geral
                  </div>
                  {employees.map((emp) => {
                    const st = getState(emp.id);
                    const totalW =
                      (st.totalWork || 0) +
                      (st.workStart
                        ? now.getTime() - st.workStart.getTime()
                        : 0);
                    const totalB =
                      (st.totalBreak || 0) +
                      (st.breakStart
                        ? now.getTime() - st.breakStart.getTime()
                        : 0);
                    return (
                      <div
                        key={emp.id}
                        style={{
                          background: '#1e293b',
                          borderRadius: 14,
                          padding: 16,
                          marginBottom: 12,
                          border: '1px solid #334155',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: '50%',
                              background: '#6366f1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800,
                              color: '#fff',
                            }}
                          >
                            {emp.avatar}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#f1f5f9',
                              }}
                            >
                              {emp.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: statusColor[st.status],
                                fontWeight: 700,
                              }}
                            >
                              {statusLabel[st.status]}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: 8,
                          }}
                        >
                          {[
                            {
                              label: 'Trabalhado',
                              val: formatDuration(totalW),
                              color: '#22c55e',
                            },
                            {
                              label: 'Pausas',
                              val: formatDuration(totalB),
                              color: '#f59e0b',
                            },
                            {
                              label: 'Registros',
                              val: String(st.log.length),
                              color: '#06b6d4',
                            },
                          ].map(({ label, val, color }) => (
                            <div
                              key={label}
                              style={{
                                background: '#0f172a',
                                borderRadius: 8,
                                padding: '8px 6px',
                                textAlign: 'center',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 9,
                                  color: '#475569',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {label}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color,
                                  marginTop: 4,
                                }}
                              >
                                {val}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: '#334155',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {loggedIn ? `👤 ${loggedIn.name}` : formatDate(now).split(',')[0]}
          </div>
          {loggedIn && (
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                color: '#ef4444',
                fontFamily: 'inherit',
                fontWeight: 700,
              }}
            >
              Sair →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
