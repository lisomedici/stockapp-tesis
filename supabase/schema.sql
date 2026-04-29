-- ============================================================
-- StockApp — Schema completo (Etapa 2)
-- Ejecutar en Supabase → SQL Editor → Run All para una DB nueva.
-- Para una DB existente con la estructura de Etapa 1, ver:
--   supabase/migrations/001_etapa2_refactor.sql
-- ============================================================


-- ── PROFILES ────────────────────────────────────────────────
-- Extiende auth.users con nombre y rol

CREATE TABLE profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre     TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin'
               CHECK (role IN ('operario', 'ventas', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer perfiles"
  ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios actualizan su propio perfil"
  ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Trigger: al crear usuario en Auth → crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── ARTÍCULOS ───────────────────────────────────────────────
-- Catálogo de tipos de tela. Lo gestiona admin/dueño.

CREATE TABLE articulos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE articulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen artículos"
  ON articulos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operario gestionan artículos"
  ON articulos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'operario'));


-- ── TINTORERÍAS ─────────────────────────────────────────────

CREATE TABLE tintorerias (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tintorerias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen tintorerías"
  ON tintorerias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin y operario gestionan tintorerías"
  ON tintorerias FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'operario'));


-- ── DESPACHOS ───────────────────────────────────────────────
-- Cada llegada de tintorería con su planilla.

CREATE TABLE despachos (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tintoreria_id          UUID NOT NULL REFERENCES tintorerias(id),
  articulo_id            UUID NOT NULL REFERENCES articulos(id),
  fecha_despacho         DATE NOT NULL DEFAULT CURRENT_DATE,
  numero_remito          TEXT,
  total_rollos_declarado INTEGER,
  total_kilos_declarado  NUMERIC(10, 2),
  estado                 TEXT NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador', 'auditado', 'confirmado')),
  origen                 TEXT NOT NULL DEFAULT 'manual'
                           CHECK (origen IN ('manual', 'planilla_ia')),
  imagen_url             TEXT,
  created_by             UUID REFERENCES profiles(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen despachos"
  ON despachos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin gestiona despachos"
  ON despachos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Operario actualiza despachos"
  ON despachos FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'operario');


-- ── ROLLOS ──────────────────────────────────────────────────
-- El item central. Cada rollo físico de tela.

CREATE TABLE rollos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  despacho_id       UUID NOT NULL REFERENCES despachos(id),
  articulo_id       UUID NOT NULL REFERENCES articulos(id),
  numero_pieza      TEXT NOT NULL,
  codigo_externo    TEXT,                   -- QR/barcode de la tintorería
  color             TEXT,
  ubicacion         TEXT,                   -- slot físico (ej: "A42")
  pantone           TEXT,                   -- código pantone para colores lisos
  foto_url          TEXT,                   -- foto del rollo

  -- Datos del proveedor (de la planilla)
  kilos             NUMERIC(10, 2),
  metros            NUMERIC(10, 2),
  ratio_rendimiento NUMERIC(10, 4),

  -- Datos propios (después del control de calidad en recepción)
  kilos_propios     NUMERIC(10, 2),
  metros_propios    NUMERIC(10, 2),
  ancho_propio      NUMERIC(10, 2),
  gramaje_propio    NUMERIC(10, 2),         -- g/m² (pesar 10x10cm)

  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'en_stock', 'reservado', 'entregado', 'baja')),
  confianza_ia      NUMERIC(4, 3),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (despacho_id, numero_pieza)
);

ALTER TABLE rollos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen rollos"
  ON rollos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin gestiona rollos"
  ON rollos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Operario actualiza rollos"
  ON rollos FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'operario');


-- ── PEDIDOS (antes "ordenes") ───────────────────────────────
-- Lo que ventas/dueño reservan para un cliente.

CREATE TABLE pedidos (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido         TEXT UNIQUE,
  cliente               TEXT NOT NULL,
  numero_remito_externo TEXT,                 -- link al sistema de facturación (Softland u otro)
  estado                TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente', 'en_preparacion', 'lista', 'entregada', 'cancelada')),
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen pedidos"
  ON pedidos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ventas y admin gestionan pedidos"
  ON pedidos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('ventas', 'admin'));

CREATE POLICY "Operario actualiza estado de pedidos"
  ON pedidos FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'operario');


-- ── PEDIDO_ROLLOS ───────────────────────────────────────────
-- Many-to-many: qué rollos cubren qué pedido.
-- Reemplaza al modelo orden_items + asignaciones.

CREATE TABLE pedido_rollos (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id  UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  rollo_id   UUID NOT NULL REFERENCES rollos(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rollo_id) -- un rollo solo puede estar reservado en un pedido
);

ALTER TABLE pedido_rollos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen pedido_rollos"
  ON pedido_rollos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ventas y admin gestionan pedido_rollos"
  ON pedido_rollos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('ventas', 'admin'));
