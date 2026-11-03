-- Migration 0002: Add thinking column to turns table

ALTER TABLE turns ADD COLUMN thinking TEXT;
