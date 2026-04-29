import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const ESTADO_LABEL: Record<string, { text: string; className: string }> = {
  borrador: { text: 'Borrador', className: 'bg-zinc-100 text-zinc-700' },
  auditado: { text: 'Auditado', className: 'bg-warning/15 text-warning' },
  confirmado: { text: 'Confirmado', className: 'bg-success/15 text-success' },
}

export default async function DespachosPage() {
  const supabase = await createClient()

  const { data: despachos } = await supabase
    .from('despachos')
    .select(`
      id,
      fecha_despacho,
      numero_remito,
      total_rollos_declarado,
      total_kilos_declarado,
      estado,
      tintorerias ( nombre ),
      articulos ( nombre )
    `)
    .order('fecha_despacho', { ascending: false })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold mt-1">Despachos</h1>
          <p className="text-sm text-muted-foreground">
            Llegadas de mercadería desde tintorerías
          </p>
        </div>
        <Link
          href="/admin/despachos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nuevo despacho
        </Link>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tintorería</th>
              <th className="px-4 py-3 font-medium">Artículo</th>
              <th className="px-4 py-3 font-medium">Remito</th>
              <th className="px-4 py-3 font-medium">Rollos</th>
              <th className="px-4 py-3 font-medium">Kilos</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {despachos && despachos.length > 0 ? (
              despachos.map((d) => {
                const estado = ESTADO_LABEL[d.estado] ?? ESTADO_LABEL.borrador
                const tintoreria = (
                  d.tintorerias as unknown as { nombre: string } | null
                )?.nombre
                const articulo = (
                  d.articulos as unknown as { nombre: string } | null
                )?.nombre
                return (
                  <tr
                    key={d.id}
                    className="border-b last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/despachos/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.fecha_despacho}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{tintoreria ?? '—'}</td>
                    <td className="px-4 py-3">{articulo ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.numero_remito ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {d.total_rollos_declarado ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {d.total_kilos_declarado
                        ? `${d.total_kilos_declarado} kg`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 ${estado.className}`}
                      >
                        {estado.text}
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
                  Todavía no cargaste ningún despacho.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
