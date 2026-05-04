import { GoogleGenAI, Type, type Schema } from '@google/genai'
import type {
  DespachoExtraido,
  ExtraccionResult,
} from './extraerPlanilla'

const MODELO = 'gemini-2.5-flash'

// ── Prompt ──────────────────────────────────────────────────
//
// Diseñado a partir de la planilla real de Muter Textil (24 rollos
// blancos, layout en bloques paralelos de columnas).
// Si llegan formatos distintos de otras tintorerías y la calidad cae,
// hay que iterar este prompt con ejemplos concretos.

const PROMPT = `
Sos un asistente experto en procesar planillas de remitos de tintorerías textiles argentinas.

Te paso una imagen o PDF de una planilla. Extraé TODOS los datos en formato JSON estructurado, según el schema dado.

# Cosas importantes sobre el layout

- La planilla suele venir con los rollos en BLOQUES PARALELOS DE COLUMNAS (típicamente 2-4 bloques uno al lado del otro), no en una sola tabla vertical larga.
- Tenés que leer cada bloque por completo de arriba abajo, y después pasar al siguiente bloque a la derecha.
- Cada bloque tiene las MISMAS columnas (N° pieza, kilos, metros, ratio, gramaje/Pm2). Los rollos del bloque 2 son CONTINUACIÓN de los del bloque 1, no son rollos distintos.
- El número de pieza suele ser correlativo (ej 204021911, 204021912, ...). Si ves un salto raro, puede ser un error de OCR — bajá la confianza.

# Datos del HEADER (uno solo, arriba o al margen de la planilla)

- numero_remito: el número de la planilla/despacho. Aparece como "DESPACHO N°", "REMITO N°" o similar. Suele estar en la esquina superior derecha, a veces con código de barras al lado.
- fecha: en formato ISO 'YYYY-MM-DD'. Si la planilla la trae como 'DD/MM/YY' o 'DD/MM/YYYY', convertí. Si son solo 2 dígitos del año, asumí 20YY (ej "13/03/26" → "2026-03-13").
- color: el color del lote. UN SOLO COLOR para toda la planilla (ej "BLANCO", "NEGRO", "AZUL FRANCIA"). Si en el header aparece más de una vez, es porque se repite arriba de cada bloque visual — ignorá la repetición.
- ot: número de "Orden de Trabajo" (a veces "OT" o "O.T."), interno de la tintorería. Solo dígitos típicamente.
- rem_tejeduria: "Remito de Tejeduría" (a veces "REM. TEJ." o "REM TEJEDURIA"), número del remito de la fábrica de tejido (origen del rollo crudo).
- referencia: código de referencia interno de la tintorería (ej "SBI"), suele ser una abreviación corta de 2-5 letras.
- total_rollos_declarado: número de rollos que la planilla declara. Suele estar al pie como "ROL: 24" o similar. Es el TOTAL del despacho, no de cada bloque.
- total_kilos_declarado: kilos despachados totales (NO los ingresados, sino los efectivamente despachados). Suele estar al pie como "DESP" o "KILOS DESP". Si hay también un valor "INGR" (ingresados), ESE NO ES — usá el de despachados/salida.

# Datos POR ROLLO (uno por fila, leyendo bloques en paralelo)

- numero_pieza: identificador del rollo (ej "204021911"). String, conservar ceros a la izquierda si los hay.
- kilos: peso en kg, decimal (ej 18.25). Usar punto, NO coma.
- metros: largo en metros, decimal (ej 74.70).
- ratio: rendimiento m/kg, decimal (ej 4.09). A veces aparece como "Ratio", "Rdto" o "Rto".
- gramaje_planilla: g/m² (peso por metro cuadrado de tela), número entero o decimal corto (ej 144). Suele aparecer como "Pm2", "Gramaje" o "g/m²".

# REGLAS DE CONFIANZA (campo confidence, 0.0 a 1.0)

- 1.0 → letra/número claro, formato esperado, sin ambigüedad.
- 0.85-0.95 → legible pero con riesgo bajo (ej letras 0/O, 5/S, 1/I que se podrían confundir, o un decimal donde el punto está lejos).
- 0.5-0.85 → legible con dudas (mancha, decimal poco claro, dígito mitad cortado).
- 0.0-0.5 → casi ilegible, adivinaste por contexto (ej rellenaste el último dígito porque el patrón sugería continuación correlativa).

Si un campo NO aparece en la planilla, devolvé value: null y confidence: 0.

Devolvé el JSON. No agregues explicaciones ni texto adicional fuera del JSON.
`.trim()

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
  mimeType: string
): Promise<ExtraccionResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'Falta GEMINI_API_KEY en las variables de entorno',
      codigo: 'NO_API_KEY',
    }
  }

  let response
  try {
    const ai = new GoogleGenAI({ apiKey })
    response = await ai.models.generateContent({
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
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
      },
    })
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    return {
      ok: false,
      error: `Error al llamar a Gemini: ${msg}`,
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
    const parsed = JSON.parse(text) as DespachoExtraido
    return { ok: true, data: parsed }
  } catch (e) {
    return {
      ok: false,
      error: `JSON inválido en respuesta de IA: ${(e as Error).message}`,
      codigo: 'JSON_INVALID',
    }
  }
}
