import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import Scanner from './Scanner'

export default async function ConfirmarIngresoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: ingreso } = await supabase
    .from('ingresos')
    .select(`
      id, fecha_despacho, numero_remito, estado, total_rollos_declarado,
      tintorerias ( nombre ),
      articulos ( nombre )
    `)
    .eq('id', id)
    .single()

  if (!ingreso) notFound()

  if (ingreso.estado === 'confirmado') {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <BackButton href="/operario/confirmar" label="Volver a confirmaciones" />
        <div className="rounded-lg border bg-success/10 border-success/30 p-5 text-center space-y-2">
          <p className="text-2xl">✓</p>
          <p className="font-semibold text-success">Ingreso ya confirmado</p>
          <p className="text-sm text-muted-foreground">
            Todos los rollos de este ingreso fueron confirmados.
          </p>
        </div>
      </div>
    )
  }

  const { data: rollos } = await supabase
    .from('rollos')
    .select('id, numero_pieza, estado')
    .eq('ingreso_id', id)
    .order('numero_pieza')

  const tintoreria = (
    ingreso.tintorerias as unknown as { nombre: string } | null
  )?.nombre
  const articulo = (
    ingreso.articulos as unknown as { nombre: string } | null
  )?.nombre

  const pendientes = rollos?.filter((r) => r.estado === 'pendiente').length ?? 0
  const totalRollos = rollos?.length ?? 0

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <BackButton href="/operario/confirmar" label="Volver a confirmaciones" />
        <h1 className="text-xl font-bold mt-2">Confirmar llegadas</h1>
        <p className="text-sm text-muted-foreground">
          {tintoreria ?? '—'} · {ingreso.fecha_despacho}
          {ingreso.numero_remito ? ` · Rem. ${ingreso.numero_remito}` : ''}
        </p>
        {articulo && (
          <p className="text-xs text-muted-foreground mt-0.5">{articulo}</p>
        )}
      </div>

      {pendientes === 0 ? (
        <div className="rounded-lg border bg-success/10 border-success/30 px-4 py-3 text-sm text-success font-medium">
          ¡Todos los rollos fueron confirmados! Guardando ingreso como confirmado...
        </div>
      ) : (
        <Scanner
          ingresoId={id}
          rollos={rollos ?? []}
          totalDeclarado={ingreso.total_rollos_declarado}
        />
      )}
    </div>
  )
}
