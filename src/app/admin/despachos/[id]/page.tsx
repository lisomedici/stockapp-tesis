import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const ESTADO_DESPACHO: Record<string, { text: string; className: string }> = {
  borrador: { text: 'Borrador', className: 'bg-zinc-100 text-zinc-700' },
  auditado: { text: 'Auditado', className: 'bg-warning/15 text-warning' },
  confirmado: { text: 'Confirmado', className: 'bg-success/15 text-success' },
}

const ESTADO_ROLLO: Record<string, { text: string; className: string }> = {
  pendiente: { text: 'Pendiente', className: 'bg-warning/15 text-warning' },
  en_stock: { text: 'En stock', className: 'bg-success/15 text-success' },
  reservado: { text: 'Reservado', className: 'bg-primary/15 text-primary' },
  entregado: { text: 'Entregado', className: 'bg-zinc-100 text-zinc-700' },
  baja: { text: 'Baja', className: 'bg-destructive/15 text-destructive' },
}

export default async function DespachoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: despacho } = await supabase
    .from('despachos')
    .select(`
      *,
      tintorerias ( nombre ),
      articulos ( nombre )
    `)
    .eq('id', id)
    .single()

  if (!despacho) notFound()

  const { data: rollos } = await supabase
    .from('rollos')
    .select('*')
    .eq('despacho_id', id)
    .order('numero_pieza', { ascending: true })

  const tintoreria = (
    despacho.tintorerias as unknown as { nombre: string } | null
  )?.nombre
  const articulo = (
    despacho.articulos as unknown as { nombre: string } | null
  )?.nombre
  const estado = ESTADO_DESPACHO[despacho.estado] ?? ESTADO_DESPACHO.borrador

  const totalKilos =
    rollos?.reduce((acc, r) => acc + Number(r.kilos ?? 0), 0) ?? 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/despachos"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Volver a despachos
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold">
            Despacho del {despacho.fecha_despacho}
          </h1>
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${estado.className}`}
          >
            {estado.text}
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Tintorería" value={tintoreria ?? '—'} />
        <Field label="Artículo" value={articulo ?? '—'} />
        <Field label="Número de remito" value={despacho.numero_remito ?? '—'} />
        <Field
          label="Total declarado"
          value={`${despacho.total_rollos_declarado ?? '—'} rollos / ${
            despacho.total_kilos_declarado ?? '—'
          } kg`}
        />
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm">
            Rollos cargados ({rollos?.length ?? 0})
          </h2>
          <span className="text-xs text-muted-foreground">
            Suma kilos: {totalKilos.toFixed(2)} kg
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr>
              <th className="px-4 py-2 font-medium">N° Pieza</th>
              <th className="px-4 py-2 font-medium">Color</th>
              <th className="px-4 py-2 font-medium">Kilos</th>
              <th className="px-4 py-2 font-medium">Metros</th>
              <th className="px-4 py-2 font-medium">Ratio</th>
              <th className="px-4 py-2 font-medium">Ubicación</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rollos && rollos.length > 0 ? (
              rollos.map((r) => {
                const e = ESTADO_ROLLO[r.estado] ?? ESTADO_ROLLO.pendiente
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.numero_pieza}</td>
                    <td className="px-4 py-2">{r.color ?? '—'}</td>
                    <td className="px-4 py-2">{r.kilos ?? '—'}</td>
                    <td className="px-4 py-2">{r.metros ?? '—'}</td>
                    <td className="px-4 py-2">{r.ratio_rendimiento ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.ubicacion ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 ${e.className}`}
                      >
                        {e.text}
                      </span>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Sin rollos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  )
}
