'use client'
import { useState } from 'react'
import { createClient } from '../lib/supabase' // ajusta la ruta a tu cliente
import { useRouter } from 'next/navigation'

export default function ActualizarPassword() {
  const [newPassword, setNewPassword] = useState('')
  const supabase = createClient()
  const router = useRouter()

  async function updatePassword(e) {
    e.preventDefault()
    // Esta función de Supabase actualiza la contraseña del usuario que acaba de entrar por el link
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (!error) {
      alert("Contraseña actualizada exitosamente")
      router.push('/dashboard')
    }
  }

  return (
    <form onSubmit={updatePassword}>
      <h1>Escribe tu nueva contraseña</h1>
      <input 
        type="password" 
        value={newPassword} 
        onChange={e => setNewPassword(e.target.value)} 
      />
      <button type="submit">Actualizar</button>
    </form>
  )
}
