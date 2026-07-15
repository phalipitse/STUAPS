CREATE TABLE "waitlist_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"company_name" varchar(255),
	"country" varchar(64),
	"property_count" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_signups_email_idx" ON "waitlist_signups" USING btree ("email");