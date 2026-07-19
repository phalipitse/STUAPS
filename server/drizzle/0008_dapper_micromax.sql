CREATE TYPE "public"."detected_document_kind" AS ENUM('statement', 'student_roster', 'employee_roster', 'unknown');--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email_connection_id" integer NOT NULL,
	"sent_by_user_id" integer,
	"to_address" varchar(255) NOT NULL,
	"subject" varchar(998) NOT NULL,
	"attachment_filename" varchar(255),
	"provider_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detected_statements" ADD COLUMN "attachment_mime_type" varchar(255);--> statement-breakpoint
ALTER TABLE "detected_statements" ADD COLUMN "document_kind" "detected_document_kind" DEFAULT 'statement' NOT NULL;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_email_connection_id_email_connections_id_fk" FOREIGN KEY ("email_connection_id") REFERENCES "public"."email_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;