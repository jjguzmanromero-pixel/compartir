import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../lib/supabase-server'
import DashboardClient from '../../components/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verificar si es admin
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Mostrar en la terminal exactamente qué está leyendo Next.js
  console.log('\n--- 🚨 DIAGNÓSTICO DE ROL ---')
  console.log('ID del Usuario Logueado:', user.id)
  console.log('Datos leídos de la tabla profiles:', profile)
  console.log('Errores de Supabase:', error)
  console.log('-----------------------------\n')

  const isAdmin = profile?.role === 'admin'

  return <DashboardClient user={user} isAdmin={isAdmin} />
}
