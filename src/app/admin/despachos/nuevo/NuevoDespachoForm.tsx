'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDespacho, type RolloInput } from './actions'

type Catalog = { id: string; nombre: string }

function emptyRollo(): RolloInput {
  return {
    numero_pieza: '',
    color: '',
    kilos: '',
    metros: '',
    ratio_rendimiento: '',
    ubicacion: '',
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function NuevoDespachoForm({
  tintorerias,
  articulos,
}: {
  tintorerias: Catalog[]
  articulos: Catalog[]
}) {
  const router = useRouter()

  // Header
  const [tintoreriaId, setTintoreriaId] = useState('')
  const [articuloId, setArticuloId] = useState('')
  const [fecha, setFecha] = useState(todayISO())
  const [numeroRemito, setNumeroRemito] = useState('')
  const [totalRollosDeclarado, setTotalRollosDeclarado] = useState('')
  const [totalKilosDeclarado, setTotalKilosDeclarado] = useState('')

  // Rollos
  const [rollos, setRollos] = useState<RolloInput[]>([emptyRollo()])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function updateRollo(idx: number, field: keyof RolloInput, value: string) {
    setRollos(
      rollos.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    )
  }

  function addRow() {
    setRollos([...rollos, emptyRollo()])
  }

  function removeRow(idx: number) {
    if (rollos.length === 1) {
      setRollos([emptyRollo()])
    } else {
      setRollos(rollos.filter((_, i) => i !== idx))
    }
  }

  // Validaciones derivadas
  const validations = useMemo(() => {
    const sumaKilos = rollos.reduce(
      (acc, r) => acc + (parseFloat(r.kilos) || 0),
      0
    )
    const cantidadRollos = rollos.filter((r) =>
      r.numero_pieza.trim()
    ).length

    const numeros = rollos
      .map((r) => r.numero_pieza.trim())
      .filter(Boolean)
    const seen = new Set<string>()
    const duplicadosSet = new Set<string>()
    for (const n of numeros) {
      if (seen.has(n)) duplicadosSet.add(n)
      seen.add(n)
    }
    const duplicados = Array.from(duplicadosSet)

    const totalRollosNum = parseInt(totalRollosDeclarado) || null
    const totalKilosNum = parseFloat(totalKilosDeclarado) || null

    const cantidadCoincide =
      totalRollosNum === null || totalRollosNum === cantidadRollos
    const kilosCoinciden =
      totalKilosNum === null ||
      Math.abs(totalKilosNum - sumaKilos) < 0.01

    return {
      sumaKilos,
      cantidadRollos,
      duplicados,
      cantidadCoincide,
      kilosCoinciden,
    }
  }, [rollos, totalRollosDeclarado, totalKilosDeclarado])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const result = await createDespacho({
      tintoreria_id: tintoreriaId,
      articulo_id: articuloId,
      fecha_despacho: fecha,
      numero_remito: numeroRemito,
      total_rollos_declarado: totalRollosDeclarado,
      total_kilos_declarado: totalKilosDeclarado,
      rollos: rollos.filter((r) => r.numero_pieza.trim()),
    })

    if (result.error) {
      setSubmitError(result.error)
      setSubmitting(false)
      return
    }

    router.push(`/admin/despachos/${result.despachoId}`)
    router.refresh()
  }

  const blockSubmit =
    submitting ||
    !tintoreriaId ||
    !articuloId ||
    !fecha ||
    validations.cantidadRollos === 0 ||
    validations.duplicados.length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold">Datos del despacho</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tintorería *</label>
            <select
              value={tintoreriaId}
              onChange={(e) => setTintoreriaId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccionar...</option>
              {tintorerias.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Artículo *</label>
            <select
              value={articuloId}
              onChange={(e) => setArticuloId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccionar...</option>
              {articulos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Número de remito</label>
            <input
              type="text"
              value={numeroRemito}
              onChange={(e) => setNumeroRemito(e.target.value)}
              placeholder="Ej: 0001-00012345"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Total de rollos declarado
            </label>
            <input
              type="number"
              min="0"
              value={totalRollosDeclarado}
              onChange={(e) => setTotalRollosDeclarado(e.target.value)}
              placeholder="Ej: 24"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Total de kilos declarado
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={totalKilosDeclarado}
              onChange={(e) => setTotalKilosDeclarado(e.target.value)}
              placeholder="Ej: 480.50"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Rollos */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Rollos</h2>
          <span className="text-xs text-muted-foreground">
            {validations.cantidadRollos} cargados · suma{' '}
            {validations.sumaKilos.toFixed(2)} kg
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">N° Pieza *</th>
                <th className="px-3 py-2 font-medium">Color</th>
                <th className="px-3 py-2 font-medium w-24">Kilos</th>
                <th className="px-3 py-2 font-medium w-24">Metros</th>
                <th className="px-3 py-2 font-medium w-20">Ratio</th>
                <th className="px-3 py-2 font-medium w-28">Ubicación</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rollos.map((r, i) => {
                const isDuplicate =
                  r.numero_pieza.trim() &&
                  validations.duplicados.includes(r.numero_pieza.trim())
                return (
                  <tr
                    key={i}
                    className={`border-b last:border-0 ${
                      isDuplicate ? 'bg-destructive/5' : ''
                    }`}
                  >
                    <td className="px-3 py-1 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1">
                      <input
                        type="text"
                        value={r.numero_pieza}
                        onChange={(e) =>
                          updateRollo(i, 'numero_pieza', e.target.value)
                        }
                        placeholder="204021911"
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                          isDuplicate
                            ? 'border-destructive'
                            : 'border-input'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="text"
                        value={r.color}
                        onChange={(e) =>
                          updateRollo(i, 'color', e.target.value)
                        }
                        placeholder="Blanco"
                        className="w-full rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.kilos}
                        onChange={(e) =>
                          updateRollo(i, 'kilos', e.target.value)
                        }
                        placeholder="20.5"
                        className="w-full rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.metros}
                        onChange={(e) =>
                          updateRollo(i, 'metros', e.target.value)
                        }
                        placeholder="50"
                        className="w-full rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.ratio_rendimiento}
                        onChange={(e) =>
                          updateRollo(i, 'ratio_rendimiento', e.target.value)
                        }
                        placeholder="2.4"
                        className="w-full rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="text"
                        value={r.ubicacion}
                        onChange={(e) =>
                          updateRollo(i, 'ubicacion', e.target.value)
                        }
                        placeholder="A42"
                        className="w-full rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="px-3 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-muted-foreground hover:text-destructive text-lg leading-none"
                        aria-label="Eliminar fila"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t bg-zinc-50">
          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Agregar fila
          </button>
        </div>
      </div>

      {/* Validaciones / warnings */}
      {(validations.duplicados.length > 0 ||
        !validations.cantidadCoincide ||
        !validations.kilosCoinciden) && (
        <div className="rounded-lg border bg-warning/10 border-warning/30 p-4 space-y-1 text-sm">
          {validations.duplicados.length > 0 && (
            <p className="text-destructive">
              ⚠ Números de pieza duplicados:{' '}
              {validations.duplicados.join(', ')}
            </p>
          )}
          {!validations.cantidadCoincide && (
            <p>
              ⚠ Cargaste {validations.cantidadRollos} rollos, pero declaraste{' '}
              {totalRollosDeclarado}.
            </p>
          )}
          {!validations.kilosCoinciden && (
            <p>
              ⚠ Suma de kilos {validations.sumaKilos.toFixed(2)} kg vs{' '}
              {totalKilosDeclarado} kg declarados.
            </p>
          )}
        </div>
      )}

      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={blockSubmit}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Guardando...' : 'Guardar despacho'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/despachos')}
          className="rounded-md border bg-white px-5 py-2 text-sm font-medium hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
