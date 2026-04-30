-- ============================================================
-- Migración 006 — Super-admin como rol distinto + empresa_id nullable
--
-- Refactor: en vez de dos campos redundantes (role='admin' +
-- is_super_admin=TRUE), un solo campo `role` con cuatro valores:
--   - operario  (depósito)
--   - ventas
--   - admin     (dueño de UNA empresa-cliente)
--   - super     (super-admin de la plataforma StockApp)
--
-- Y `empresa_id` es NULL solo cuando role='super'. CHECK lo enforza.
--
-- La función is_super_admin() sigue existiendo (la usan muchas RLS
-- policies) pero internamente ahora chequea `role = 'super'`.
--
-- Idempotente.
-- ============================================================

-- 1. Hacer empresa_id NULLABLE
ALTER TABLE profiles ALTER COLUMN empresa_id DROP NOT NULL;

-- 2. Drop el constraint viejo de role para poder agregar 'super'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operario', 'ventas', 'admin', 'super'));

-- 3. Migrar: usuarios con is_super_admin=TRUE pasan a role='super'
--    y empresa_id NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_super_admin'
  ) THEN
    UPDATE profiles
       SET role = 'super',
           empresa_id = NULL
     WHERE is_super_admin = TRUE;
  END IF;
END $$;

-- 4. CHECK que enforza la regla: super → empresa_id NULL, resto → NOT NULL
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_super_admin_empresa_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_super_admin_empresa_check
  CHECK (
    (role = 'super' AND empresa_id IS NULL)
    OR (role IN ('admin', 'ventas', 'operario') AND empresa_id IS NOT NULL)
  );

-- 5. Drop la columna is_super_admin (ya no hace falta)
ALTER TABLE profiles DROP COLUMN IF EXISTS is_super_admin;

-- 6. Helper function actualizada (mismo nombre, mismo comportamiento booleano)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'super' FROM profiles WHERE id = auth.uid()), FALSE)
$$;

-- 7. Trigger handle_new_user actualizado
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  empresa_uuid UUID;
  user_role TEXT;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');

  IF user_role = 'super' THEN
    empresa_uuid := NULL;
  ELSE
    empresa_uuid := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'empresa_id', '')::UUID,
      (SELECT id FROM public.empresas WHERE nombre = 'Muter Textil' LIMIT 1)
    );
  END IF;

  INSERT INTO public.profiles (id, nombre, role, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    user_role,
    empresa_uuid
  );
  RETURN NEW;
END;
$$;
