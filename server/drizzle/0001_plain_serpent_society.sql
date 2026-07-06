ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" varchar(255);