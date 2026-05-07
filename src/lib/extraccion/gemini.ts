import { GoogleGenAI, Type, type Schema } from '@google/genai'
import type {
  IngresoExtraido,
  ExtraccionResult,
} from './extraerPlanilla'
import { getConfig } from './tintorerias/_registry'

const MODELO = 'gemini-2.5-flash'

// ── Prompt base ────────────────────────────────────────────
//
// Es la parte fija del prompt: rol del asistente + reglas universales de
// confianza + formato de salida. Las instrucciones específicas de cada
// tintorería se inyectan después (ver buildPrompt()).

const PROMPT_BASE = `
Sos un asistente experto en procesar planillas de remitos de tintorerías textiles argentinas.

Te paso una imagen o PDF de una planilla. Extraé TODOS los datos en formato JSON estructurado, según el schema dado.

Devolvé el JSON directamente. No agregues explicaciones ni texto adicional fuera del JSON.
`.trim()

function buildPrompt(configKey: string | null): string {
  const config = getConfig(configKey)
  return `${PROMPT_BASE}\n\n${config.promptInstructions}`
}

// ── Schema (Gemini responseSchema) ──────────────────────────
//
// Cada campo de la planilla se envuelve en `{ value, confidence }` para
// que la IA reporte su confianza por celda.

function fieldString(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      value: { type: Type.STRING, nullable: true },
      confidence: { type: Type.NUMBER },
    },
    required: ['value', 'confidence'],
  }
}

function fieldNumber(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      value: { type: Type.NUMBER, nullable: true },
      confidence: { type: Type.NUMBER },
    },
    required: ['value', 'confidence'],
  }
}

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    numero_remito: fieldString(),
    fecha: fieldString(),
    color: fieldString(),
    ot: fieldString(),
    rem_tejeduria: fieldString(),
    referencia: fieldString(),
    total_rollos_declarado: fieldNumber(),
    total_kilos_declarado: fieldNumber(),
    rollos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          numero_pieza: fieldString(),
          kilos: fieldNumber(),
          metros: fieldNumber(),
          ratio: fieldNumber(),
          gramaje_planilla: fieldNumber(),
        },
        required: [
          'numero_pieza',
          'kilos',
          'metros',
          'ratio',
          'gramaje_planilla',
        ],
      },
    },
  },
  required: [
    'numero_remito',
    'fecha',
    'color',
    'ot',
    'rem_tejeduria',
    'referencia',
    'total_rollos_declarado',
    'total_kilos_declarado',
    'rollos',
  ],
}

// ── Implementación ──────────────────────────────────────────

export async function extraerConGemini(
  fileBuffer: Buffer,
  mimeType: string,
  configKey: string | null
): Promise<ExtraccionResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'Falta GEMINI_API_KEY en las variables de entorno',
      codigo: 'NO_API_KEY',
    }
  }

  const prompt = buildPrompt(configKey)

  const TIMEOUT_MS = 45_000

  let response
  try {
    const ai = new GoogleGenAI({ apiKey })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('La IA tardó demasiado. Intentá de nuevo o cargá manualmente.')),
        TIMEOUT_MS
      )
    )
    response = await Promise.race([
      ai.models.generateContent({
        model: MODELO,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: fileBuffer.toString('base64'),
                  mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
        },
      }),
      timeout,
    ])
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    return {
      ok: false,
      error: msg,
      codigo: 'GEMINI_ERROR',
    }
  }

  const text = response.text
  if (!text) {
    return {
      ok: false,
      error: 'La IA no devolvió contenido',
      codigo: 'GEMINI_ERROR',
    }
  }

  try {
    const parsed = JSON.parse(text) as IngresoExtraido
    if (!parsed.rollos || parsed.rollos.length === 0) {
      return {
        ok: false,
        error:
          'La imagen no parece ser una planilla de tintorería válida. La IA no encontró ningún rollo. Verificá que subiste la foto correcta.',
        codigo: 'FORMATO_INVALIDO',
      }
    }
    return { ok: true, data: parsed }
  } catch (e) {
    return {
      ok: false,
      error: `JSON inválido en respuesta de IA: ${(e as Error).message}`,
      codigo: 'JSON_INVALID',
    }
  }
}
