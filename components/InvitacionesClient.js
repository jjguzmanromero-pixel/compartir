'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase'

export default function InvitacionesClient({ user, invitations: initialInvitations }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }
  const [invitations, setInvitations] = useState(initialInvitations)
  const router = useRouter()
  const supabase = createClient()

  async function sendInvite(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })

    const data = await res.json()

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error || 'Error al enviar invitación' })
    } else {
      setMessage({ type: 'success', text: `Invitación enviada a ${email}` })
      setEmail('')
      setRole('user')
      // Recargar invitaciones
      router.refresh()
    }
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = user.email.split('@')[0]
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-[#f7f6f3]">

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-56 bg-white border-r border-[#e8e6e0] flex flex-col z-10">
        <div className="p-5 border-b border-[#e8e6e0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <span className="font-semibold text-[15px] text-[#1a1a1a]">FileShare</span>
          </div>
        </div>

        <nav className="p-3 flex-1">
          <a href="/dashboard" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Mis archivos
          </a>

          <div className="px-3 pt-4 pb-1">
            <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-widest">Admin</span>
          </div>

          <a href="/dashboard" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Todos los archivos
          </a>

          <a href="/dashboard" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 text-[#555] hover:bg-[#f7f6f3] transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Usuarios
          </a>

          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-1 bg-[#1a1a1a] text-white font-medium transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 4.9 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17.5z"/></svg>
            Invitaciones
          </button>
        </nav>

        <div className="p-3 border-t border-[#e8e6e0]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#e8e6e0] flex items-center justify-center text-xs font-medium text-[#555]">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1a1a1a] truncate">{displayName}</p>
              <p className="text-[10px] text-[#aaa]">Administrador</p>
            </div>
            <button onClick={logout} className="text-[#bbb] hover:text-[#555] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="ml-56 p-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Invitar usuarios</h1>
          <p className="text-sm text-[#888] mt-0.5">El usuario recibirá un correo con un enlace para crear su cuenta</p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 mb-6">
          <form onSubmit={sendInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#555] mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e6e0] text-sm bg-[#fafaf8] focus:outline-none focus:border-[#1a1a1a] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#555] mb-1.5">
                Rol
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'user', label: 'Usuario', desc: 'Solo ve sus propios archivos' },
                  { value: 'admin', label: 'Admin', desc: 'Ve todos los archivos y usuarios' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                      role === opt.value
                        ? 'border-[#1a1a1a] bg-[#f7f6f3]'
                        : 'border-[#e8e6e0] hover:border-[#ccc]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        role === opt.value ? 'border-[#1a1a1a]' : 'border-[#ccc]'
                      }`}>
                        {role === opt.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-[#1a1a1a]">{opt.label}</span>
                    </div>
                    <p className="text-xs text-[#888] ml-5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {message && (
              <div className={`text-xs px-3 py-2.5 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-red-50 text-red-600 border-red-100'
              }`}>
                {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar invitación'}
            </button>
          </form>
        </div>

        {/* Historial de invitaciones */}
        <div>
          <h2 className="text-sm font-medium text-[#555] mb-3">
            Invitaciones enviadas ({invitations.length})
          </h2>
          {invitations.length === 0 ? (
            <p className="text-sm text-[#aaa] text-center py-8">No hay invitaciones enviadas aún</p>
          ) : (
            <div className="space-y-1.5">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-[#e8e6e0]">
                  <div className="w-8 h-8 rounded-full bg-[#e8e6e0] flex items-center justify-center text-xs font-medium text-[#555]">
                    {inv.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1a1a1a] truncate">{inv.email}</p>
                    <p className="text-xs text-[#aaa]">
                      {new Date(inv.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                    inv.role === 'admin'
                      ? 'bg-[#EEEDFE] text-[#3C3489]'
                      : 'bg-[#E1F5EE] text-[#085041]'
                  }`}>
                    {inv.role === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-lg ${
                    inv.accepted
                      ? 'bg-[#f7f6f3] text-[#888]'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {inv.accepted ? 'Aceptada' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
