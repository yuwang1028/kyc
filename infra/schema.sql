CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    legal_name TEXT NOT NULL,
    normalized_name TEXT,
    registration_number TEXT,
    tax_id TEXT,
    incorporation_country TEXT,
    incorporation_state TEXT,
    incorporation_date DATE,
    registered_address TEXT,
    operating_address TEXT,
    website TEXT,
    business_description TEXT,
    industry_code TEXT,
    status TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    case_type TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    jurisdiction TEXT,
    status TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    assigned_to UUID,
    risk_level TEXT,
    risk_score NUMERIC,
    policy_pack_version TEXT,
    opened_at TIMESTAMP NOT NULL,
    due_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
