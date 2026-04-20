'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const router = useRouter()
  const supabase = createClient()
  const [mostrarPassword, setMostrarPassword] = useState(false)


  async function handleResetPassword() {
    // Supabase enviará un correo con un link mágico
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/actualizar-password`,
    })
    
    if (error) alert("Error: " + error.message)
    else alert("Te enviamos un enlace para recuperar tu contraseña a tu correo.")
  }
  



  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'register') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      setError('✓ Revisa tu correo para confirmar tu cuenta')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1a1a1a] mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-[#1a1a1a]">FileShare</h1>
          <p className="text-sm text-[#888] mt-1">Tu espacio de archivos privado</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-8 shadow-sm">
          <div className="flex gap-1 p-1 bg-[#f7f6f3] rounded-xl mb-6">
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-white shadow-sm text-[#1a1a1a]'
                    : 'text-[#888] hover:text-[#1a1a1a]'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Registrarse'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#555] mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e6e0] text-sm bg-[#fafaf8] focus:outline-none focus:border-[#1a1a1a] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#555] mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="········"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e6e0] text-sm bg-[#fafaf8] focus:outline-none focus:border-[#1a1a1a] transition-colors"
              />
            </div>

            {error && (
              <p className={`text-xs px-3 py-2 rounded-lg ${
                error.startsWith('✓')
                  ? 'bg-green-50 text-green-700 border border-green-100'
                  : 'bg-red-50 text-red-600 border border-red-100'
              }`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
        // 2. Modifica tu input de contraseña para que se vea así:
        <div className="relative">
          <input
            type={mostrarPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            className="w-full px-3 py-2 border rounded-xl"
          />
          <button
            type="button"
            onClick={() => setMostrarPassword(!mostrarPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
          >
            {mostrarPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p className="text-center text-xs text-[#aaa] mt-6">
          Los archivos de cada usuario son privados
        </p>
      </div>
    </div>
  )
}
