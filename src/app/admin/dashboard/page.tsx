import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre')
    .eq('id', user!.id)
    .single()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Panel de Administración</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenida, {profile?.nombre ?? 'usuaria'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Ingresos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Registrar despachos de tintorerías
          </p>
        </div>
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Stock</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ver rollos disponibles
          </p>
        </div>
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Órdenes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestionar pedidos de clientes
          </p>
        </div>
      </div>
    </div>
  )
}
