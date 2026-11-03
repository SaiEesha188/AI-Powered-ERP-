CREATE TYPE "public"."exam_status" AS ENUM('draft', 'scheduled', 'locked', 'published');--> statement-breakpoint
CREATE TYPE "public"."report_card_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "assessment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weightage" numeric(5, 2) NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_types_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "exam_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date,
	"max_marks" numeric(6, 2) NOT NULL,
	"pass_marks" numeric(6, 2) NOT NULL,
	"syllabus_scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_papers_id_institute" UNIQUE("id","institute_id"),
	CONSTRAINT "exam_papers_marks" CHECK ("exam_papers"."max_marks" > 0 and "exam_papers"."pass_marks" >= 0 and "exam_papers"."pass_marks" <= "exam_papers"."max_marks")
);
--> statement-breakpoint
CREATE TABLE "exam_section_locks" (
	"institute_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"locked_by" uuid NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"assessment_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "exam_status" DEFAULT 'draft' NOT NULL,
	"grade_scale_id" uuid,
	"created_by" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_id_institute" UNIQUE("id","institute_id"),
	CONSTRAINT "exams_dates" CHECK ("exams"."end_date" >= "exams"."start_date")
);
--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"grade_scale_id" uuid NOT NULL,
	"min_pct" numeric(5, 2) NOT NULL,
	"max_pct" numeric(5, 2) NOT NULL,
	"grade" text NOT NULL,
	"points" numeric(4, 1),
	"description" text,
	CONSTRAINT "grade_bands_range" CHECK ("grade_bands"."min_pct" >= 0 and "grade_bands"."max_pct" <= 100 and "grade_bands"."min_pct" <= "grade_bands"."max_pct")
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_scales_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"exam_paper_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks_obtained" numeric(6, 2),
	"is_absent" boolean DEFAULT false NOT NULL,
	"entered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marks_value" CHECK ("marks"."marks_obtained" is null or "marks"."marks_obtained" >= 0),
	CONSTRAINT "marks_absent_blank" CHECK (not "marks"."is_absent" or "marks"."marks_obtained" is null)
);
--> statement-breakpoint
CREATE TABLE "report_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"remarks" text,
	"remarks_ai_drafted" boolean DEFAULT false NOT NULL,
	"status" "report_card_status" DEFAULT 'draft' NOT NULL,
	"pdf_file_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_cards_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_types" ADD CONSTRAINT "assessment_types_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_exam_fk" FOREIGN KEY ("exam_id","institute_id") REFERENCES "public"."exams"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_class_fk" FOREIGN KEY ("class_id","institute_id") REFERENCES "public"."classes"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subject_fk" FOREIGN KEY ("subject_id","institute_id") REFERENCES "public"."subjects"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_section_locks" ADD CONSTRAINT "exam_section_locks_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_section_locks" ADD CONSTRAINT "exam_section_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_section_locks" ADD CONSTRAINT "exam_section_locks_exam_fk" FOREIGN KEY ("exam_id","institute_id") REFERENCES "public"."exams"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_year_fk" FOREIGN KEY ("academic_year_id","institute_id") REFERENCES "public"."academic_years"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_type_fk" FOREIGN KEY ("assessment_type_id","institute_id") REFERENCES "public"."assessment_types"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_scale_fk" FOREIGN KEY ("grade_scale_id","institute_id") REFERENCES "public"."grade_scales"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_scale_fk" FOREIGN KEY ("grade_scale_id","institute_id") REFERENCES "public"."grade_scales"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_paper_fk" FOREIGN KEY ("exam_paper_id","institute_id") REFERENCES "public"."exam_papers"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_fk" FOREIGN KEY ("student_id","institute_id") REFERENCES "public"."students"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_exam_fk" FOREIGN KEY ("exam_id","institute_id") REFERENCES "public"."exams"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_student_fk" FOREIGN KEY ("student_id","institute_id") REFERENCES "public"."students"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_pdf_fk" FOREIGN KEY ("pdf_file_id","institute_id") REFERENCES "public"."files"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_types_institute_name" ON "assessment_types" USING btree ("institute_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_papers_exam_class_subject" ON "exam_papers" USING btree ("exam_id","class_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_section_locks_pk" ON "exam_section_locks" USING btree ("exam_id","section_id");--> statement-breakpoint
CREATE INDEX "exams_institute_year" ON "exams" USING btree ("institute_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_scales_one_default" ON "grade_scales" USING btree ("institute_id") WHERE "grade_scales"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "marks_paper_student" ON "marks" USING btree ("exam_paper_id","student_id");--> statement-breakpoint
CREATE INDEX "marks_student" ON "marks" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_cards_exam_student" ON "report_cards" USING btree ("exam_id","student_id");--> statement-breakpoint
CREATE INDEX "report_cards_student" ON "report_cards" USING btree ("student_id");