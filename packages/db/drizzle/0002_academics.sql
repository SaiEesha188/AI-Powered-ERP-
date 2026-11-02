CREATE TYPE "public"."staff_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('scholastic', 'co_scholastic', 'elective');--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"periods_per_week" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_subjects_periods" CHECK ("class_subjects"."periods_per_week" is null or "class_subjects"."periods_per_week" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_code" text,
	"designation" text NOT NULL,
	"joining_date" date,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" "subject_type" DEFAULT 'scholastic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_fk" FOREIGN KEY ("class_id","institute_id") REFERENCES "public"."classes"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_fk" FOREIGN KEY ("subject_id","institute_id") REFERENCES "public"."subjects"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_fk" FOREIGN KEY ("class_id","institute_id") REFERENCES "public"."classes"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_year_fk" FOREIGN KEY ("academic_year_id","institute_id") REFERENCES "public"."academic_years"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_fk" FOREIGN KEY ("class_teacher_id","institute_id") REFERENCES "public"."staff"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_staff_fk" FOREIGN KEY ("staff_id","institute_id") REFERENCES "public"."staff"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_section_fk" FOREIGN KEY ("section_id","institute_id") REFERENCES "public"."sections"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subject_fk" FOREIGN KEY ("subject_id","institute_id") REFERENCES "public"."subjects"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_subjects_class_subject" ON "class_subjects" USING btree ("class_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_institute_name" ON "classes" USING btree ("institute_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_class_year_name" ON "sections" USING btree ("class_id","academic_year_id","name");--> statement-breakpoint
CREATE INDEX "sections_institute_year" ON "sections" USING btree ("institute_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_institute_user" ON "staff" USING btree ("institute_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_institute_code" ON "staff" USING btree ("institute_id","employee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_institute_code" ON "subjects" USING btree ("institute_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_assignments_unique" ON "teacher_assignments" USING btree ("staff_id","section_id","subject_id");--> statement-breakpoint
CREATE INDEX "teacher_assignments_section" ON "teacher_assignments" USING btree ("section_id");