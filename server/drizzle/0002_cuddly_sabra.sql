CREATE TYPE "public"."addon_status" AS ENUM('active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."detected_statement_status" AS ENUM('pending', 'approved', 'rejected', 'import_failed');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gmail');--> statement-breakpoint
CREATE TABLE "detected_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email_connection_id" integer NOT NULL,
	"provider_message_id" varchar(255) NOT NULL,
	"provider_attachment_id" varchar(255),
	"sender" varchar(255) NOT NULL,
	"subject" text,
	"received_at" timestamp with time zone,
	"attachment_filename" varchar(255),
	"status" "detected_statement_status" DEFAULT 'pending' NOT NULL,
	"parsed_preview" text,
	"imported_invoice_id" integer,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" "email_provider" DEFAULT 'gmail' NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encrypted_access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"watch_keywords" text DEFAULT 'nsfas.org.za' NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"connected_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "addon_status" "addon_status";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "addon_stripe_subscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "detected_statements" ADD CONSTRAINT "detected_statements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_statements" ADD CONSTRAINT "detected_statements_email_connection_id_email_connections_id_fk" FOREIGN KEY ("email_connection_id") REFERENCES "public"."email_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_statements" ADD CONSTRAINT "detected_statements_imported_invoice_id_invoices_id_fk" FOREIGN KEY ("imported_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_statements" ADD CONSTRAINT "detected_statements_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "detected_statements_connection_message_unique" ON "detected_statements" USING btree ("email_connection_id","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_connections_tenant_provider_unique" ON "email_connections" USING btree ("tenant_id","provider");