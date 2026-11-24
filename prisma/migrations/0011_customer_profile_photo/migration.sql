-- Additive column for Customer / Showroom profile photo
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "profilePhotoUrl" TEXT;
