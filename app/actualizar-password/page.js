'use client'
import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function ActualizarPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function updatePassword(e) {
    e.preventDefault()
    setLoading(true)
    // Esta función de Supabase actualiza la contraseña del usuario que acaba de entrar por el link
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (!error) {
      alert("Contraseña actualizada exitosamente")
      router.push('/dashboard')
    } else {
      alert("Error: " + error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e6e0] p-8 shadow-sm">
        <h1 className="text-xl font-medium tracking-tight text-[#1a1a1a] mb-2">Recuperar acceso</h1>
        <p className="text-sm text-[#888] mb-6">Escribe tu nueva contraseña para continuar.</p>
        
        <form onSubmit={updatePassword} className="space-y-4">
          <div className="relative">
            <input 
              type={mostrarPassword ? "text" : "password"}
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              placeholder="Nueva contraseña"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#e8e6e0] text-sm bg-[#fafaf8] focus:outline-none focus:border-[#1a1a1a] transition-colors pr-16"
            />
            <button type="button" onClick={() => setMostrarPassword(!mostrarPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#888] hover:text-[#1a1a1a] transition-colors">
              {mostrarPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] transition-all disabled:opacity-50">
            {loading ? 'Actualizando...' : 'Actualizar y Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
