CREATE TYPE "public"."completion_status" AS ENUM('done', 'pending', 'late');--> statement-breakpoint
CREATE TYPE "public"."homework_status" AS ENUM('published', 'cancelled');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"due_date" date NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"status" "homework_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
CREATE TABLE "homework_attachments" (
	"institute_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "homework_attachments_homework_id_file_id_pk" PRIMARY KEY("homework_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "completion_status" NOT NULL,
	"feedback" text,
	"score" numeric(6, 2),
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_section_fk" FOREIGN KEY ("section_id","institute_id") REFERENCES "public"."sections"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_subject_fk" FOREIGN KEY ("subject_id","institute_id") REFERENCES "public"."subjects"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_staff_fk" FOREIGN KEY ("staff_id","institute_id") REFERENCES "public"."staff"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_homework_fk" FOREIGN KEY ("homework_id","institute_id") REFERENCES "public"."homework"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_file_fk" FOREIGN KEY ("file_id","institute_id") REFERENCES "public"."files"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_fk" FOREIGN KEY ("homework_id","institute_id") REFERENCES "public"."homework"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_fk" FOREIGN KEY ("student_id","institute_id") REFERENCES "public"."students"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_section_due" ON "homework" USING btree ("section_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_submissions_homework_student" ON "homework_submissions" USING btree ("homework_id","student_id");