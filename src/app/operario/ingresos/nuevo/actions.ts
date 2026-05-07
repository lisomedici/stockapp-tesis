'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  extraerPlanilla,
  type IngresoExtraido,
  UMBRAL_BAJA_CONFIANZA,
} from '@/lib/extraccion/extraerPlanilla'
import { subirPlanilla } from '@/lib/storage/planillas'

// ── Tipos del flow manual + IA ─────────────────────────────

export type RolloInput = {
  numero_pieza: string
  kilos: string
  metros: string
  ratio_rendimiento: string
  gramaje_planilla?: string
  ubicacion: string
  estado: 'en_stock' | 'pendiente'
  /** Confianza promedio reportada por la IA para este rollo (0-1). Solo se setea en flow IA. */
  confianza_ia?: number
}

export type IngresoInput = {
  tintoreria_id: string
  articulo_id: string
  fecha: string
  numero_remito: string
  color: string
  ot?: string
  rem_tejeduria?: string
  referencia?: string
  total_rollos_declarado: string
  total_kilos_declarado: string
  /** Path en Storage (bucket planillas) si vino por flow IA. */
  imagen_path?: string
  origen?: 'manual' | 'planilla_ia'
  rollos: RolloInput[]
}

// ── Server action: procesar planilla con IA ────────────────

export type ProcesarPlanillaResult =
  | {
      ok: true
      imagen_path: string
      datos: IngresoExtraido
      warnings: string[]
    }
  | {
      ok: false
      error: string
      codigo:
        | 'NO_FILE'
        | 'NO_TINTORERIA'
        | 'TIPO_INVALIDO'
        | 'NO_AUTH'
        | 'SIN_EMPRESA'
        | 'STORAGE_ERROR'
        | 'GEMINI_ERROR'
        | 'JSON_INVALID'
        | 'NO_API_KEY'
        | 'FORMATO_INVALIDO'
        | 'OTHER'
      /** Si la imagen ya se subió pero la IA falló, devolvemos el path para reintento. */
      imagen_path?: string
    }

const MIME_ACEPTADOS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]

/**
 * Procesa una planilla con IA aplicando la config de la tintorería elegida.
 * Si la tintorería no tiene `extraction_config_key`, usa el prompt default.
 */
export async function procesarPlanillaConIA(
  formData: FormData
): Promise<ProcesarPlanillaResult> {
  const file = formData.get('archivo')
  const tintoreriaId = formData.get('tintoreria_id')

  if (!(file instanceof File)) {
    return { ok: false, error: 'No se recibió archivo.', codigo: 'NO_FILE' }
  }
  if (typeof tintoreriaId !== 'string' || !tintoreriaId.trim()) {
    return {
      ok: false,
      error: 'Hay que seleccionar la tintorería antes de subir la planilla.',
      codigo: 'NO_TINTORERIA',
    }
  }
  if (!MIME_ACEPTADOS.includes(file.type)) {
    return {
      ok: false,
      error: `Tipo de archivo no soportado: ${file.type}. Aceptamos JPG, PNG, WebP, HEIC y PDF.`,
      codigo: 'TIPO_INVALIDO',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Sesión expirada — volvé a iniciar sesión.', codigo: 'NO_AUTH' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('empresa_id')
    .eq('id', user.id)
    .single()
  if (!profile?.empresa_id) {
    return {
      ok: false,
      error: 'Tu usuario no tiene empresa asignada.',
      codigo: 'SIN_EMPRESA',
    }
  }

  // Lookup de la config de la tintorería elegida.
  // Si no tiene `extraction_config_key`, queda null y se usa el default.
  const { data: tintoreria } = await supabase
    .from('tintorerias')
    .select('extraction_config_key')
    .eq('id', tintoreriaId)
    .single()

  const configKey = tintoreria?.extraction_config_key ?? null

  const buffer = Buffer.from(await file.arrayBuffer())

  const upload = await subirPlanilla(buffer, file.type, profile.empresa_id)
  if (!upload.ok) {
    return { ok: false, error: upload.error, codigo: 'STORAGE_ERROR' }
  }

  const extraccion = await extraerPlanilla(buffer, file.type, configKey)
  if (!extraccion.ok) {
    return {
      ok: false,
      error: extraccion.error,
      codigo: extraccion.codigo,
      imagen_path: upload.path,
    }
  }

  const warnings = calcularWarnings(extraccion.data)

  return {
    ok: true,
    imagen_path: upload.path,
    datos: extraccion.data,
    warnings,
  }
}

/** Banners de fallback 3-tier: incompleto + calidad pobre. (Falla técnica se maneja arriba.) */
function calcularWarnings(data: IngresoExtraido): string[] {
  const warnings: string[] = []

  const declarados = data.total_rollos_declarado.value
  const extraidos = data.rollos.length
  if (declarados !== null && declarados !== extraidos) {
    if (extraidos < declarados) {
      warnings.push(
        `La planilla declara ${declarados} rollos pero la IA extrajo solo ${extraidos}. Agregá los ${declarados - extraidos} faltantes a mano antes de guardar.`
      )
    } else {
      warnings.push(
        `La planilla declara ${declarados} rollos pero la IA extrajo ${extraidos}. Revisá si hay duplicados.`
      )
    }
  }

  const todasLasCeldas: number[] = []
  for (const k of [
    'numero_remito',
    'fecha',
    'color',
    'ot',
    'rem_tejeduria',
    'referencia',
    'total_rollos_declarado',
    'total_kilos_declarado',
  ] as const) {
    todasLasCeldas.push(data[k].confidence)
  }
  for (const r of data.rollos) {
    todasLasCeldas.push(
      r.numero_pieza.confidence,
      r.kilos.confidence,
      r.metros.confidence,
      r.ratio.confidence,
      r.gramaje_planilla.confidence
    )
  }
  const bajas = todasLasCeldas.filter((c) => c < UMBRAL_BAJA_CONFIANZA).length
  const pctBajas = todasLasCeldas.length > 0 ? bajas / todasLasCeldas.length : 0
  if (pctBajas > 0.3) {
    warnings.push(
      `La IA detectó muchos campos con baja confianza (${Math.round(pctBajas * 100)}%). Te recomendamos revisar cuidadosamente o cargar a mano.`
    )
  }

  return warnings
}

// ── Server action: crear ingreso (flow manual o IA) ────────

export async function crearIngreso(input: IngresoInput) {
  const supabase = await createClient()

  if (!input.tintoreria_id) return { error: 'Falta seleccionar la tintorería.' }
  if (!input.articulo_id) return { error: 'Falta seleccionar el artículo.' }
  if (!input.fecha) return { error: 'Falta la fecha del ingreso.' }
  if (!input.rollos.length) return { error: 'Cargá al menos un rollo.' }

  const origen = input.origen ?? 'manual'

  for (const r of input.rollos) {
    if (!r.numero_pieza.trim()) {
      return { error: 'Todos los rollos deben tener número de pieza.' }
    }
    if (origen === 'manual' && r.estado === 'en_stock' && !r.ubicacion.trim()) {
      return {
        error:
          'Los rollos en estado "en stock" deben tener ubicación asignada.',
      }
    }
  }

  const numeros = input.rollos.map((r) => r.numero_pieza.trim())
  const unicos = new Set(numeros)
  if (unicos.size !== numeros.length) {
    return { error: 'Hay números de pieza duplicados en el ingreso.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Sesión expirada — volvé a iniciar sesión.' }

  // Estado del ingreso derivado del origen:
  // - planilla_ia → siempre `auditado` (rollos quedan `pendiente`, esperan scanner físico en Etapa 4)
  // - manual: si todos los rollos están en_stock → `confirmado`, si alguno está pendiente → `borrador`
  let ingresoEstado: 'borrador' | 'auditado' | 'confirmado'
  if (origen === 'planilla_ia') {
    ingresoEstado = 'auditado'
  } else {
    const algunoPendiente = input.rollos.some((r) => r.estado === 'pendiente')
    ingresoEstado = algunoPendiente ? 'borrador' : 'confirmado'
  }

  const { data: ingreso, error: iError } = await supabase
    .from('ingresos')
    .insert({
      tintoreria_id: input.tintoreria_id,
      articulo_id: input.articulo_id,
      fecha_despacho: input.fecha,
      numero_remito: input.numero_remito.trim() || null,
      color: input.color.trim() || null,
      ot: input.ot?.trim() || null,
      rem_tejeduria: input.rem_tejeduria?.trim() || null,
      referencia: input.referencia?.trim() || null,
      total_rollos_declarado: input.total_rollos_declarado
        ? parseInt(input.total_rollos_declarado)
        : null,
      total_kilos_declarado: input.total_kilos_declarado
        ? parseFloat(input.total_kilos_declarado)
        : null,
      imagen_url: input.imagen_path ?? null,
      estado: ingresoEstado,
      origen,
      created_by: user.id,
    })
    .select()
    .single()

  if (iError || !ingreso) {
    return { error: `No se pudo crear el ingreso: ${iError?.message}` }
  }

  const rollosToInsert = input.rollos.map((r) => ({
    ingreso_id: ingreso.id,
    articulo_id: input.articulo_id,
    numero_pieza: r.numero_pieza.trim(),
    kilos: r.kilos ? parseFloat(r.kilos) : null,
    metros: r.metros ? parseFloat(r.metros) : null,
    ratio_rendimiento: r.ratio_rendimiento
      ? parseFloat(r.ratio_rendimiento)
      : null,
    gramaje_planilla: r.gramaje_planilla
      ? parseFloat(r.gramaje_planilla)
      : null,
    ubicacion: r.ubicacion.trim() || null,
    estado: r.estado,
    confianza_ia: r.confianza_ia ?? null,
  }))

  const { error: rError } = await supabase.from('rollos').insert(rollosToInsert)

  if (rError) {
    await supabase.from('ingresos').delete().eq('id', ingreso.id)
    return { error: `No se pudieron cargar los rollos: ${rError.message}` }
  }

  redirect(`/operario/ingresos/${ingreso.id}?creado=1`)
}

// ── Creación inline desde el form ───────────────────────────

export async function createTintoreriaInline(nombre: string) {
  const supabase = await createClient()
  const cleanName = nombre.trim()
  if (!cleanName) return { error: 'El nombre no puede estar vacío.' }

  const { data, error } = await supabase
    .from('tintorerias')
    .insert({ nombre: cleanName })
    .select('id, nombre, extraction_config_key')
    .single()

  if (error || !data) return { error: error?.message ?? 'Error al crear.' }
  return { success: true, data }
}

export async function createArticuloInline(nombre: string) {
  const supabase = await createClient()
  const cleanName = nombre.trim()
  if (!cleanName) return { error: 'El nombre no puede estar vacío.' }

  const { data, error } = await supabase
    .from('articulos')
    .insert({ nombre: cleanName })
    .select('id, nombre')
    .single()

  if (error || !data) return { error: error?.message ?? 'Error al crear.' }
  return { success: true, data }
}
