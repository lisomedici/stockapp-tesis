-- ============================================================
-- Migración 003 — Operario puede gestionar catálogos
--
-- Permite que operario cree/edite artículos y tintorerías,
-- para no romper el flujo cuando carga un despacho y descubre
-- que la tintorería todavía no estaba en el sistema.
-- ============================================================

DROP POLICY IF EXISTS "Admins gestionan artículos"      ON articulos;
DROP POLICY IF EXISTS "Admin gestiona artículos"        ON articulos;
DROP POLICY IF EXISTS "Admin y operario gestionan artículos" ON articulos;

CREATE POLICY "Admin y operario gestionan artículos"
  ON articulos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'operario'));

DROP POLICY IF EXISTS "Admins gestionan tintorerías"      ON tintorerias;
DROP POLICY IF EXISTS "Admin gestiona tintorerías"        ON tintorerias;
DROP POLICY IF EXISTS "Admin y operario gestionan tintorerías" ON tintorerias;

CREATE POLICY "Admin y operario gestionan tintorerías"
  ON tintorerias FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'operario'));
