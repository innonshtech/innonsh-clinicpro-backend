-- Migration: Make patient email column nullable
-- Safe and idempotent

ALTER TABLE patients ALTER COLUMN email DROP NOT NULL;
