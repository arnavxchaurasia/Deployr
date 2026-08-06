-- Seat-based team billing: org-level plan + purchased seat count.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "plan" "Plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "seatsPurchased" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "razorpayOrderId" TEXT;
