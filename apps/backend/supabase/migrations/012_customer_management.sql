-- ============================================================================
-- ReviewAI - Migration 012: Customer Management
-- Supabase PostgreSQL Migration
-- Version: 2.2.0
-- ============================================================================

-- 1. Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    company_name VARCHAR(255),
    gst_tax_id VARCHAR(100),
    billing_address JSONB DEFAULT '{}'::jsonb,
    shipping_address JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 2. Indexes for search, business tenant isolation, and filtering
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(business_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(business_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(business_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(business_id, company_name);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(business_id, deleted_at);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Tenant isolation and permissions
DROP POLICY IF EXISTS "Customers are accessible by authorized tenant users and admins" ON customers;
CREATE POLICY "Customers are accessible by authorized tenant users and admins"
ON customers
FOR ALL
USING (
    -- Admin has access to all businesses
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
    OR
    -- Business owner access
    EXISTS (
        SELECT 1 FROM businesses
        WHERE businesses.id = customers.business_id AND businesses.owner_id = auth.uid()
    )
    OR
    -- Authorized staff member access
    EXISTS (
        SELECT 1 FROM business_staff
        WHERE business_staff.business_id = customers.business_id
          AND business_staff.user_id = auth.uid()
          AND business_staff.accepted_at IS NOT NULL
    )
);

-- 5. Trigger for updated_at column
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
