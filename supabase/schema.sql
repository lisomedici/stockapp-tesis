-- ============================================================
-- StockApp Muter — Schema completo
-- Ejecutar en: Supabase → SQL Editor → New Query → Run All
-- ============================================================


-- ── PROFILES ────────────────────────────────────────────────
-- Extiende auth.users con nombre y rol

CREATE TABLE profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre     TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'deposito')),
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

CREATE POLICY "Admins gestionan artículos"
  ON articulos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


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

CREATE POLICY "Admins gestionan tintorerías"
  ON tintorerias FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


-- ── DESPACHOS ───────────────────────────────────────────────

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
  imagen_url             TEXT,
  created_by             UUID REFERENCES profiles(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen despachos"
  ON despachos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gestionan despachos"
  ON despachos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Depósito actualiza despachos"
  ON despachos FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'deposito');


-- ── ROLLOS ──────────────────────────────────────────────────

CREATE TABLE rollos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  despacho_id       UUID NOT NULL REFERENCES despachos(id),
  articulo_id       UUID NOT NULL REFERENCES articulos(id),
  numero_pieza      TEXT NOT NULL,
  codigo_externo    TEXT,
  color             TEXT,
  kilos             NUMERIC(10, 2),
  metros            NUMERIC(10, 2),
  ratio_rendimiento NUMERIC(10, 4),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'en_stock', 'reservado', 'despachado')),
  confianza_ia      NUMERIC(4, 3),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (despacho_id, numero_pieza)
);

ALTER TABLE rollos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen rollos"
  ON rollos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gestionan rollos"
  ON rollos FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Depósito actualiza rollos"
  ON rollos FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'deposito');


-- ── ÓRDENES ─────────────────────────────────────────────────

CREATE TABLE ordenes (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_orden TEXT UNIQUE,
  cliente      TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'en_preparacion', 'lista', 'despachada')),
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen órdenes"
  ON ordenes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gestionan órdenes"
  ON ordenes FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


-- ── ORDEN ITEMS ─────────────────────────────────────────────

CREATE TABLE orden_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id        UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  articulo_id     UUID NOT NULL REFERENCES articulos(id),
  color           TEXT,
  kilos_pedidos   NUMERIC(10, 2) NOT NULL,
  kilos_asignados NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orden_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen ítems de órdenes"
  ON orden_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gestionan ítems de órdenes"
  ON orden_items FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


-- ── ASIGNACIONES ────────────────────────────────────────────
-- Qué rollo cubre qué ítem de orden

CREATE TABLE asignaciones (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_item_id UUID NOT NULL REFERENCES orden_items(id) ON DELETE CASCADE,
  rollo_id      UUID NOT NULL REFERENCES rollos(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rollo_id) -- un rollo solo puede estar en una asignación
);

ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leen asignaciones"
  ON asignaciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados gestionan asignaciones"
  ON asignaciones FOR ALL TO authenticated USING (true);
