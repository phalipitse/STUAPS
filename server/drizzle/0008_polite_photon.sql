CREATE TABLE "billing_usage_charges" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"plan" varchar(16) NOT NULL,
	"active_students" integer NOT NULL,
	"billable_extra_students" integer NOT NULL,
	"amount_rand" numeric(12, 2) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"paystack_reference" varchar(255),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "paystack_authorization_code" varchar(255);--> statement-breakpoint
ALTER TABLE "billing_usage_charges" ADD CONSTRAINT "billing_usage_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_usage_charges_tenant_period_unique" ON "billing_usage_charges" USING btree ("tenant_id","period_start");