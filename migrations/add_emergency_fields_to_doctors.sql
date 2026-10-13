-- Migration: Add Emergency Information columns to doctors table
-- Safe and idempotent

ALTER TABLE doctors
ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS emergency_relationship VARCHAR(50) DEFAULT NULL;
