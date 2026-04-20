import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../lib/supabase-server'
import DashboardClient from '../../components/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verificar si es admin (puedes gestionar esto con una tabla 'profiles' en Supabase)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return <DashboardClient user={user} isAdmin={isAdmin} />
}
