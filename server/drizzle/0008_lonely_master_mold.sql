CREATE TABLE "pest_control_treatments" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"treated_on" date NOT NULL,
	"company_name" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pest_control_treatments" ADD CONSTRAINT "pest_control_treatments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;