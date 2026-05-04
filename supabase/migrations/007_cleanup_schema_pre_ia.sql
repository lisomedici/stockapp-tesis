-- ============================================================
-- Migración 007 — Cleanup de schema antes de Etapa 3 (IA)
--
-- Cambios:
--   1. Mover `color` de `rollos` a `despachos` (1 lote tintorería = 1 color).
--      Para datos existentes, copiamos el color del primer rollo de cada
--      despacho al despacho mismo, después dropeamos la columna en rollos.
--
--   2. Eliminar `codigo_externo` de `rollos`. Era redundante: en la realidad
--      textil el QR físico del rollo codifica el mismo `numero_pieza` que
--      figura en la planilla. No hay un "código externo" separado.
--
--   3. Agregar campos de trazabilidad de planilla en `despachos`:
--      - `ot`: número de Orden de Trabajo de la tintorería
--      - `rem_tejeduria`: remito de tejeduría (origen del rollo crudo)
--      - `referencia`: referencia interna de la tintorería (ej "SBI")
--
--   4. Agregar `gramaje_planilla` en `rollos` (g/m² declarado en planilla).
--      Existe `gramaje_propio` (medido al recibir); el nuevo es el
--      declarado por la tintorería para comparar después.
--
-- Idempotente.
-- ============================================================

-- 1. Agregar nuevas columnas en despachos (NULL, sin default)
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS ot TEXT;
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS rem_tejeduria TEXT;
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS referencia TEXT;

-- 2. Agregar nueva columna en rollos
ALTER TABLE rollos ADD COLUMN IF NOT EXISTS gramaje_planilla NUMERIC(5,2);

-- 3. Migrar datos: copiar color del primer rollo de cada despacho al despacho.
--    Solo si la columna rollos.color todavía existe (idempotencia).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rollos'
      AND column_name = 'color'
  ) THEN
    UPDATE despachos d
       SET color = sub.color
      FROM (
        SELECT DISTINCT ON (despacho_id)
               despacho_id,
               color
          FROM rollos
         WHERE color IS NOT NULL
         ORDER BY despacho_id, created_at ASC
      ) AS sub
     WHERE d.id = sub.despacho_id
       AND d.color IS NULL;
  END IF;
END $$;

-- 4. Drop columnas viejas de rollos
ALTER TABLE rollos DROP COLUMN IF EXISTS color;
ALTER TABLE rollos DROP COLUMN IF EXISTS codigo_externo;
