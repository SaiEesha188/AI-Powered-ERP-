CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'promoted', 'detained', 'left');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."guardian_relation" AS ENUM('mother', 'father', 'guardian', 'other');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'left', 'alumni');--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"roll_no" integer,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_id_institute" UNIQUE("id","institute_id"),
	CONSTRAINT "enrollments_roll_positive" CHECK ("enrollments"."roll_no" is null or "enrollments"."roll_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"institute_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relation" "guardian_relation" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"user_id" uuid,
	"admission_no" text NOT NULL,
	"name" text NOT NULL,
	"dob" date,
	"gender" "gender",
	"admission_date" date,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"medical_notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_fk" FOREIGN KEY ("student_id","institute_id") REFERENCES "public"."students"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_id_year_institute" UNIQUE("id","academic_year_id","institute_id");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_fk" FOREIGN KEY ("section_id","academic_year_id","institute_id") REFERENCES "public"."sections"("id","academic_year_id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_fk" FOREIGN KEY ("student_id","institute_id") REFERENCES "public"."students"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_fk" FOREIGN KEY ("guardian_id","institute_id") REFERENCES "public"."guardians"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_student_year" ON "enrollments" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_section_roll" ON "enrollments" USING btree ("section_id","roll_no");--> statement-breakpoint
CREATE INDEX "enrollments_section" ON "enrollments" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_institute_user" ON "guardians" USING btree ("institute_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_primary" ON "student_guardians" USING btree ("student_id") WHERE "student_guardians"."is_primary";--> statement-breakpoint
CREATE INDEX "student_guardians_guardian" ON "student_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_institute_admission_no" ON "students" USING btree ("institute_id","admission_no");--> statement-breakpoint
CREATE UNIQUE INDEX "students_institute_user" ON "students" USING btree ("institute_id","user_id");
