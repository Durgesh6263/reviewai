-- Migration 008: Strict Admin Account Protection
-- Rule: No one can delete or deactivate any admin account under any circumstances.

-- 1. Create protection trigger function
CREATE OR REPLACE FUNCTION protect_admin_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Block hard deletion of admin accounts
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' OR OLD.email = 'thelastminuteprojectsss@gmail.com' THEN
      RAISE EXCEPTION 'Admin accounts cannot be deleted (user_id: %)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- Block soft deletion or deactivation of admin accounts
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' OR OLD.email = 'thelastminuteprojectsss@gmail.com' THEN
      -- Cannot soft delete
      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Admin accounts cannot be deleted (user_id: %)', OLD.id;
      END IF;

      -- Cannot deactivate
      IF NEW.account_status = 'deactivated' THEN
        RAISE EXCEPTION 'Admin accounts cannot be deactivated (user_id: %)', OLD.id;
      END IF;

      -- Cannot demote primary owner admin role
      IF OLD.email = 'thelastminuteprojectsss@gmail.com' AND NEW.role <> 'admin' THEN
        RAISE EXCEPTION 'Primary administrator role cannot be revoked';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Bind trigger to users table
DROP TRIGGER IF EXISTS trg_protect_admin_accounts ON users;
CREATE TRIGGER trg_protect_admin_accounts
  BEFORE DELETE OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION protect_admin_accounts();
