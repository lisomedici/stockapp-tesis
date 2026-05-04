'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createDespacho,
  createTintoreriaInline,
  createArticuloInline,
  procesarPlanillaConIA,
  type RolloInput,
} from './actions'
import {
  UMBRAL_BAJA_CONFIANZA,
  type DespachoExtraido,
  type Field,
} from '@/lib/extraccion/extraerPlanilla'

type Catalog = { id: string; nombre: string }

type Modo = 'manual' | 'ia'

/**
 * Confianza por celda — mismo shape que `DespachoExtraido` pero solo con los
 * números de confianza, alineado con los rollos por índice.
 */
type Confianzas = {
  numero_remito: number
  fecha: number
  color: number
  ot: number
  rem_tejeduria: number
  referencia: number
  total_rollos_declarado: number
  total_kilos_declarado: number
  rollos: Array<{
    numero_pieza: number
    kilos: number
    metros: number
    ratio: number
    gramaje_planilla: number
  }>
}

function emptyRollo(): RolloInput {
  return {
    numero_pieza: '',
    kilos: '',
    metros: '',
    ratio_rendimiento: '',
    gramaje_planilla: '',
    ubicacion: '',
    estado: 'en_stock',
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function fmt(v: number | null): string {
  return v === null || v === undefined ? '' : String(v)
}

/** Normaliza un Field<T> para usarlo en el form (string vacío si null). */
function valOf<T>(f: Field<T>): string {
  if (f.value === null || f.value === undefined) return ''
  return String(f.value)
}

/** Promedio simple de confianzas — usado para el `confianza_ia` por rollo. */
function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Clase Tailwind para celdas con baja confianza (borde amarillo). */
function celdaCls(confianza: number | undefined): string {
  if (confianza === undefined) return 'border-input'
  return confianza < UMBRAL_BAJA_CONFIANZA
    ? 'border-warning ring-1 ring-warning/40'
    : 'border-input'
}

export default function NuevoDespachoForm({
  tintorerias: initialTintorerias,
  articulos: initialArticulos,
}: {
  tintorerias: Catalog[]
  articulos: Catalog[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Catálogos (mutable porque se pueden agregar inline)
  const [tintorerias, setTintorerias] = useState(initialTintorerias)
  const [articulos, setArticulos] = useState(initialArticulos)

  // Modo de carga
  const [modo, setModo] = useState<Modo>('manual')

  // Estado del flow IA
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imagenPath, setImagenPath] = useState<string | null>(null)
  const [extrayendo, setExtrayendo] = useState(false)
  const [extraccionError, setExtraccionError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [confianzas, setConfianzas] = useState<Confianzas | null>(null)

  // Header
  const [tintoreriaId, setTintoreriaId] = useState('')
  const [articuloId, setArticuloId] = useState('')
  const [fecha, setFecha] = useState(todayISO())
  const [numeroRemito, setNumeroRemito] = useState('')
  const [color, setColor] = useState('')
  const [ot, setOt] = useState('')
  const [remTejeduria, setRemTejeduria] = useState('')
  const [referencia, setReferencia] = useState('')
  const [totalRollosDeclarado, setTotalRollosDeclarado] = useState('')
  const [totalKilosDeclarado, setTotalKilosDeclarado] = useState('')

  // Rollos
  const [rollos, setRollos] = useState<RolloInput[]>([emptyRollo()])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function updateRollo<K extends keyof RolloInput>(
    idx: number,
    field: K,
    value: RolloInput[K]
  ) {
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
    if (confianzas) {
      const nuevas = { ...confianzas }
      nuevas.rollos = nuevas.rollos.filter((_, i) => i !== idx)
      setConfianzas(nuevas)
    }
  }

  function resetIA() {
    setArchivo(null)
    setPreviewUrl(null)
    setImagenPath(null)
    setExtrayendo(false)
    setExtraccionError(null)
    setWarnings([])
    setConfianzas(null)
  }

  function cambiarModo(nuevo: Modo) {
    if (nuevo === modo) return
    if (nuevo === 'manual') {
      // Pasar a manual: limpio estado IA pero conservo lo que el usuario haya editado en el form
      resetIA()
    }
    setModo(nuevo)
  }

  async function handleArchivoSeleccionado(file: File) {
    setArchivo(file)
    setExtraccionError(null)
    setWarnings([])
    setConfianzas(null)

    // Preview local (solo para imágenes; PDF queda con preview genérico)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreviewUrl(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
    }

    setExtrayendo(true)
    const formData = new FormData()
    formData.set('archivo', file)
    const result = await procesarPlanillaConIA(formData)
    setExtrayendo(false)

    if (!result.ok) {
      setExtraccionError(result.error)
      if (result.imagen_path) setImagenPath(result.imagen_path)
      return
    }

    setImagenPath(result.imagen_path)
    setWarnings(result.warnings)
    aplicarDatosIA(result.datos)
  }

  function aplicarDatosIA(datos: DespachoExtraido) {
    // Header
    setNumeroRemito(valOf(datos.numero_remito))
    if (datos.fecha.value) setFecha(datos.fecha.value)
    setColor(valOf(datos.color))
    setOt(valOf(datos.ot))
    setRemTejeduria(valOf(datos.rem_tejeduria))
    setReferencia(valOf(datos.referencia))
    setTotalRollosDeclarado(
      datos.total_rollos_declarado.value !== null
        ? String(datos.total_rollos_declarado.value)
        : ''
    )
    setTotalKilosDeclarado(
      datos.total_kilos_declarado.value !== null
        ? String(datos.total_kilos_declarado.value)
        : ''
    )

    // Rollos: en flow IA arrancan en `pendiente` (esperan scanner físico de Etapa 4)
    const rollosFromIA: RolloInput[] = datos.rollos.map((r) => ({
      numero_pieza: valOf(r.numero_pieza),
      kilos: fmt(r.kilos.value),
      metros: fmt(r.metros.value),
      ratio_rendimiento: fmt(r.ratio.value),
      gramaje_planilla: fmt(r.gramaje_planilla.value),
      ubicacion: '',
      estado: 'pendiente',
      confianza_ia: avg([
        r.numero_pieza.confidence,
        r.kilos.confidence,
        r.metros.confidence,
        r.ratio.confidence,
        r.gramaje_planilla.confidence,
      ]),
    }))
    setRollos(rollosFromIA.length > 0 ? rollosFromIA : [emptyRollo()])

    // Confianzas para el render visual
    setConfianzas({
      numero_remito: datos.numero_remito.confidence,
      fecha: datos.fecha.confidence,
      color: datos.color.confidence,
      ot: datos.ot.confidence,
      rem_tejeduria: datos.rem_tejeduria.confidence,
      referencia: datos.referencia.confidence,
      total_rollos_declarado: datos.total_rollos_declarado.confidence,
      total_kilos_declarado: datos.total_kilos_declarado.confidence,
      rollos: datos.rollos.map((r) => ({
        numero_pieza: r.numero_pieza.confidence,
        kilos: r.kilos.confidence,
        metros: r.metros.confidence,
        ratio: r.ratio.confidence,
        gramaje_planilla: r.gramaje_planilla.confidence,
      })),
    })
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

    // Solo en modo manual: ubicación obligatoria si estado=en_stock
    const ubicacionesFaltantes =
      modo === 'manual'
        ? rollos.filter(
            (r) =>
              r.numero_pieza.trim() &&
              r.estado === 'en_stock' &&
              !r.ubicacion.trim()
          ).length
        : 0

    return {
      sumaKilos,
      cantidadRollos,
      duplicados,
      cantidadCoincide,
      kilosCoinciden,
      ubicacionesFaltantes,
    }
  }, [rollos, totalRollosDeclarado, totalKilosDeclarado, modo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const result = await createDespacho({
      tintoreria_id: tintoreriaId,
      articulo_id: articuloId,
      fecha_despacho: fecha,
      numero_remito: numeroRemito,
      color,
      ot,
      rem_tejeduria: remTejeduria,
      referencia,
      total_rollos_declarado: totalRollosDeclarado,
      total_kilos_declarado: totalKilosDeclarado,
      imagen_path: imagenPath ?? undefined,
      origen: modo === 'ia' ? 'planilla_ia' : 'manual',
      rollos: rollos.filter((r) => r.numero_pieza.trim()),
    })

    if (result?.error) {
      setSubmitError(result.error)
      setSubmitting(false)
    }
  }

  const blockSubmit =
    submitting ||
    extrayendo ||
    !tintoreriaId ||
    !articuloId ||
    !fecha ||
    validations.cantidadRollos === 0 ||
    validations.duplicados.length > 0 ||
    validations.ubicacionesFaltantes > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Toggle de modo */}
      <div className="rounded-lg border bg-white p-4 shadow-sm flex items-center gap-2">
        <button
          type="button"
          onClick={() => cambiarModo('manual')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'manual'
              ? 'bg-primary text-primary-foreground'
              : 'bg-zinc-100 hover:bg-zinc-200'
          }`}
        >
          Cargar a mano
        </button>
        <button
          type="button"
          onClick={() => cambiarModo('ia')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'ia'
              ? 'bg-primary text-primary-foreground'
              : 'bg-zinc-100 hover:bg-zinc-200'
          }`}
        >
          Subir planilla con IA
        </button>
      </div>

      {/* Zona de subida + estado IA */}
      {modo === 'ia' && (
        <div className="rounded-lg border bg-white p-5 shadow-sm space-y-4">
          {!archivo && !extrayendo && !extraccionError && (
            <UploadArea
              onFile={handleArchivoSeleccionado}
              fileInputRef={fileInputRef}
            />
          )}

          {extrayendo && (
            <div className="flex items-center gap-3 rounded-md bg-zinc-50 px-4 py-6 text-sm">
              <Spinner />
              <div>
                <p className="font-medium">Procesando planilla con IA...</p>
                <p className="text-xs text-muted-foreground">
                  Esto suele tomar 5-10 segundos.
                </p>
              </div>
            </div>
          )}

          {extraccionError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium text-destructive">
                ⚠ La IA no pudo procesar la planilla
              </p>
              <p className="text-xs text-muted-foreground">
                {extraccionError}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => archivo && handleArchivoSeleccionado(archivo)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Reintentar IA
                </button>
                <button
                  type="button"
                  onClick={() => cambiarModo('manual')}
                  className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
                >
                  Cargar a mano
                </button>
              </div>
            </div>
          )}

          {archivo && !extrayendo && !extraccionError && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md border bg-zinc-50 p-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Planilla"
                    className="h-20 w-20 object-cover rounded"
                  />
                ) : (
                  <div className="h-20 w-20 rounded bg-zinc-200 flex items-center justify-center text-xs text-muted-foreground">
                    PDF
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{archivo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(archivo.size / 1024).toFixed(1)} KB · datos extraídos
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetIA}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </button>
              </div>

              {warnings.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-xs text-foreground">
                      💡 {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            <InlineCreator
              label="+ Nueva tintorería"
              placeholder="Nombre de la tintorería"
              onCreate={async (nombre) => {
                const res = await createTintoreriaInline(nombre)
                if (res.success && res.data) {
                  setTintorerias([...tintorerias, res.data])
                  setTintoreriaId(res.data.id)
                }
                return res
              }}
            />
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
            <InlineCreator
              label="+ Nuevo artículo"
              placeholder="Nombre del artículo"
              onCreate={async (nombre) => {
                const res = await createArticuloInline(nombre)
                if (res.success && res.data) {
                  setArticulos([...articulos, res.data])
                  setArticuloId(res.data.id)
                }
                return res
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.fecha)}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Número de remito</label>
            <input
              type="text"
              value={numeroRemito}
              onChange={(e) => setNumeroRemito(e.target.value)}
              placeholder="Ej: 0001-00012345"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.numero_remito)}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Color</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Ej: Blanco"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.color)}`}
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
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.total_rollos_declarado)}`}
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
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.total_kilos_declarado)}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">OT</label>
            <input
              type="text"
              value={ot}
              onChange={(e) => setOt(e.target.value)}
              placeholder="Orden de trabajo"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.ot)}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Remito tejeduría</label>
            <input
              type="text"
              value={remTejeduria}
              onChange={(e) => setRemTejeduria(e.target.value)}
              placeholder="Remito de la tejeduría"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.rem_tejeduria)}`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Referencia</label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej: SBI"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${celdaCls(confianzas?.referencia)}`}
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
                <th className="px-3 py-2 font-medium w-24">Kilos</th>
                <th className="px-3 py-2 font-medium w-24">Metros</th>
                <th className="px-3 py-2 font-medium w-20">Ratio</th>
                <th className="px-3 py-2 font-medium w-20">Gramaje</th>
                <th className="px-3 py-2 font-medium w-32">Estado</th>
                <th className="px-3 py-2 font-medium w-28">Ubicación</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rollos.map((r, i) => {
                const conf = confianzas?.rollos[i]
                const isDuplicate =
                  r.numero_pieza.trim() &&
                  validations.duplicados.includes(r.numero_pieza.trim())
                const ubicacionFaltante =
                  modo === 'manual' &&
                  r.numero_pieza.trim() &&
                  r.estado === 'en_stock' &&
                  !r.ubicacion.trim()
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
                            : celdaCls(conf?.numero_pieza)
                        }`}
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
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${celdaCls(conf?.kilos)}`}
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
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${celdaCls(conf?.metros)}`}
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
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${celdaCls(conf?.ratio)}`}
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.gramaje_planilla ?? ''}
                        onChange={(e) =>
                          updateRollo(i, 'gramaje_planilla', e.target.value)
                        }
                        placeholder="142"
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${celdaCls(conf?.gramaje_planilla)}`}
                      />
                    </td>
                    <td className="px-3 py-1">
                      <select
                        value={r.estado}
                        onChange={(e) =>
                          updateRollo(
                            i,
                            'estado',
                            e.target.value as RolloInput['estado']
                          )
                        }
                        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="en_stock">En stock</option>
                        <option value="pendiente">Pendiente</option>
                      </select>
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="text"
                        value={r.ubicacion}
                        onChange={(e) =>
                          updateRollo(i, 'ubicacion', e.target.value)
                        }
                        placeholder={
                          r.estado === 'en_stock' ? 'A42' : 'opcional'
                        }
                        className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                          ubicacionFaltante
                            ? 'border-destructive'
                            : 'border-input'
                        }`}
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
        validations.ubicacionesFaltantes > 0 ||
        !validations.cantidadCoincide ||
        !validations.kilosCoinciden) && (
        <div className="rounded-lg border bg-warning/10 border-warning/30 p-4 space-y-1 text-sm">
          {validations.duplicados.length > 0 && (
            <p className="text-destructive">
              ⚠ Números de pieza duplicados:{' '}
              {validations.duplicados.join(', ')}
            </p>
          )}
          {validations.ubicacionesFaltantes > 0 && (
            <p className="text-destructive">
              ⚠ Faltan ubicaciones en {validations.ubicacionesFaltantes}{' '}
              {validations.ubicacionesFaltantes === 1 ? 'rollo' : 'rollos'} con
              estado &quot;en stock&quot;.
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
          onClick={() => router.push('/operario/despachos')}
          className="rounded-md border bg-white px-5 py-2 text-sm font-medium hover:bg-zinc-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Componentes auxiliares ──────────────────────────────────

function UploadArea({
  onFile,
  fileInputRef,
}: {
  onFile: (file: File) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-input hover:bg-zinc-50'
      }`}
    >
      <p className="text-sm font-medium">
        Arrastrá la planilla acá o hacé click para elegir
      </p>
      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP, HEIC o PDF
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  )
}

// ── Componente para crear catálogo inline ───────────────────

function InlineCreator({
  label,
  placeholder,
  onCreate,
}: {
  label: string
  placeholder: string
  onCreate: (
    nombre: string
  ) => Promise<{ success?: boolean; data?: Catalog; error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!value.trim()) return
    setLoading(true)
    setError(null)
    const res = await onCreate(value)
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setValue('')
      setOpen(false)
    }
  }

  function reset() {
    setOpen(false)
    setValue('')
    setError(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:underline"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSave()
            } else if (e.key === 'Escape') {
              reset()
            }
          }}
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !value.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? '...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
