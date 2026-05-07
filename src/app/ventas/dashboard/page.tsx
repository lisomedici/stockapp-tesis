import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function VentasDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre, role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Volver al panel
          </Link>
        )}
        <h1 className="text-2xl font-bold mt-1">Pedidos</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenida, {profile?.nombre ?? 'usuaria'}
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-6">
        <p className="font-medium">Módulo en desarrollo — Etapa 6</p>
        <p className="mt-0.5">
          La gestión de pedidos y picking estará disponible en la próxima etapa
          del proyecto.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-5 shadow-sm opacity-50 cursor-not-allowed">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Stock disponible</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Etapa 5
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Buscar rollos por artículo y color
          </p>
        </div>
        <div className="rounded-lg border bg-white p-5 shadow-sm opacity-50 cursor-not-allowed">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Nuevo pedido</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Etapa 6
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Reservar rollos para un cliente
          </p>
        </div>
        <div className="rounded-lg border bg-white p-5 shadow-sm opacity-50 cursor-not-allowed">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Pedidos abiertos</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Etapa 6
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Estado de pedidos pendientes y en preparación
          </p>
        </div>
      </div>
    </div>
  )
}
