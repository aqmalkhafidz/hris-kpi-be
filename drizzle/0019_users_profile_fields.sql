ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emergency_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emergency_phone" text;
