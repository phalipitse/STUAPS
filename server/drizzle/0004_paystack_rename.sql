-- Switch billing provider from Stripe to Paystack — rename the tenant
-- columns that stored Stripe identifiers to their Paystack equivalents.
-- Safe as a plain rename: Stripe was never configured with live keys in any
-- environment, so these columns are guaranteed NULL everywhere.
ALTER TABLE "tenants" RENAME COLUMN "stripe_customer_id" TO "paystack_customer_code";
ALTER TABLE "tenants" RENAME COLUMN "stripe_subscription_id" TO "paystack_subscription_code";
ALTER TABLE "tenants" RENAME COLUMN "addon_stripe_subscription_id" TO "addon_paystack_subscription_code";
