-- ============================================================================
-- ReviewAI - Migration 006: Business Category System & Duplicate Reviews Prevention
-- ============================================================================

-- 1. Create business_categories table
CREATE TABLE IF NOT EXISTS business_categories (
    id varchar(50) PRIMARY KEY,
    name varchar(100) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE,
    description text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create category_default_tags table
CREATE TABLE IF NOT EXISTS category_default_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id varchar(50) NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
    tag_name varchar(50) NOT NULL,
    tag_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(category_id, tag_name)
);

-- 3. Extend businesses table with category and custom_tags
DO $$ BEGIN
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS category varchar(100) DEFAULT 'other';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS custom_tags jsonb DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 4. Create indexes for high performance business-scoped queries
CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_generated_reviews_business_created ON generated_reviews(business_id, created_at DESC);

-- 5. Seed initial business categories
INSERT INTO business_categories (id, name, slug, description)
VALUES
    ('gym-fitness', 'Gym & Fitness', 'gym-fitness', 'Fitness centers, gyms, yoga studios, and training facilities'),
    ('cafe-coffee-shop', 'Café & Coffee Shop', 'cafe-coffee-shop', 'Coffee houses, bakeries, tea shops, and casual cafes'),
    ('restaurant', 'Restaurant', 'restaurant', 'Fine dining, casual eateries, family diners, and bistros'),
    ('hospital-healthcare', 'Hospital & Healthcare', 'hospital-healthcare', 'Clinics, hospitals, diagnostic centers, and medical care'),
    ('dental-clinic', 'Dental Clinic', 'dental-clinic', 'Dental care centers, orthodontics, and cosmetic dental practices'),
    ('salon-beauty', 'Salon & Beauty', 'salon-beauty', 'Hair salons, spas, grooming lounges, and aesthetic centers'),
    ('hotel-hospitality', 'Hotel & Hospitality', 'hotel-hospitality', 'Hotels, resorts, guesthouses, and hospitality stays'),
    ('retail-store', 'Retail Store', 'retail-store', 'Clothing boutiques, supermarkets, electronics, and retail stores'),
    ('automobile-service', 'Automobile Service', 'automobile-service', 'Auto repair shops, service stations, and car dealerships'),
    ('education-coaching', 'Education & Coaching', 'education-coaching', 'Coaching institutes, academies, tutoring centers, and schools'),
    ('other', 'Other', 'other', 'Professional services and other local businesses')
ON CONFLICT (id) DO NOTHING;
