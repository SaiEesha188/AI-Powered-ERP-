CREATE TYPE "public"."material_audience" AS ENUM('staff', 'students', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('link', 'file');--> statement-breakpoint
CREATE TABLE "material_sections" (
	"institute_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	CONSTRAINT "material_sections_material_id_section_id_pk" PRIMARY KEY("material_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"chapter" text,
	"title" text NOT NULL,
	"description" text,
	"type" "material_type" NOT NULL,
	"url" text,
	"file_id" uuid,
	"audience" "material_audience" DEFAULT 'everyone' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
ALTER TABLE "material_sections" ADD CONSTRAINT "material_sections_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_sections" ADD CONSTRAINT "material_sections_material_fk" FOREIGN KEY ("material_id","institute_id") REFERENCES "public"."materials"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_sections" ADD CONSTRAINT "material_sections_section_fk" FOREIGN KEY ("section_id","institute_id") REFERENCES "public"."sections"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_class_fk" FOREIGN KEY ("class_id","institute_id") REFERENCES "public"."classes"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_fk" FOREIGN KEY ("subject_id","institute_id") REFERENCES "public"."subjects"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_file_fk" FOREIGN KEY ("file_id","institute_id") REFERENCES "public"."files"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_class_subject" ON "materials" USING btree ("class_id","subject_id");