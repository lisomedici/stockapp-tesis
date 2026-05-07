import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function ConfirmarPage() {
  const supabase = await createClient()

  // Ingresos que tienen al menos un rollo pendiente
  const { data: rollosPendientes } = await supabase
    .from('rollos')
    .select('ingreso_id')
    .eq('estado', 'pendiente')

  const ingresoIds = [
    ...new Set((rollosPendientes ?? []).map((r) => r.ingreso_id as string)),
  ]

  const ingresos =
    ingresoIds.length > 0
      ? await supabase
          .from('ingresos')
          .select(`
            id, fecha_despacho, numero_remito, total_rollos_declarado,
            tintorerias ( nombre ),
            articulos ( nombre ),
            rollos ( id, estado )
          `)
          .in('id', ingresoIds)
          .order('fecha_despacho', { ascending: false })
          .then((r) => r.data)
      : []

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Confirmar llegadas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escaneá los códigos de los rollos para confirmar que están en el depósito
        </p>
      </div>

      {!ingresos || ingresos.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center space-y-2 shadow-sm">
          <p className="text-2xl">✓</p>
          <p className="font-medium">Todo al día</p>
          <p className="text-sm text-muted-foreground">
            No hay ingresos con rollos pendientes de confirmación.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ingresos.map((ingreso) => {
            const tintoreria = (
              ingreso.tintorerias as unknown as { nombre: string } | null
            )?.nombre
            const articulo = (
              ingreso.articulos as unknown as { nombre: string } | null
            )?.nombre
            const rollosArr =
              (ingreso.rollos as unknown as { id: string; estado: string }[] | null) ?? []
            const pendientes = rollosArr.filter((r) => r.estado === 'pendiente').length
            const total = rollosArr.length

            return (
              <Link
                key={ingreso.id}
                href={`/operario/confirmar/${ingreso.id}`}
                className="block rounded-lg border bg-white p-4 shadow-sm hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{tintoreria ?? '—'}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {ingreso.fecha_despacho}
                      {ingreso.numero_remito ? ` · Rem. ${ingreso.numero_remito}` : ''}
                    </p>
                    {articulo && (
                      <p className="text-xs text-muted-foreground mt-0.5">{articulo}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-semibold text-warning">
                      {pendientes}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      /{total} pendientes
                    </span>
                  </div>
                </div>

                {/* Mini barra de progreso */}
                <div className="mt-3 w-full bg-zinc-100 rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{
                      width: total > 0 ? `${Math.round(((total - pendientes) / total) * 100)}%` : '0%',
                    }}
                  />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
