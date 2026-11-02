CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'pending_approval', 'published');--> statement-breakpoint
CREATE TYPE "public"."announcement_type" AS ENUM('circular', 'notice');--> statement-breakpoint
CREATE TYPE "public"."audience_type" AS ENUM('all', 'staff', 'parents', 'class', 'section', 'user');--> statement-breakpoint
CREATE TABLE "announcement_attachments" (
	"institute_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "announcement_attachments_announcement_id_file_id_pk" PRIMARY KEY("announcement_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "announcement_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"audience_type" "audience_type" NOT NULL,
	"ref_id" uuid
);
--> statement-breakpoint
CREATE TABLE "announcement_recipients" (
	"institute_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "announcement_recipients_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"type" "announcement_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_id_institute" UNIQUE("id","institute_id")
);
--> statement-breakpoint
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_fk" FOREIGN KEY ("announcement_id","institute_id") REFERENCES "public"."announcements"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_file_fk" FOREIGN KEY ("file_id","institute_id") REFERENCES "public"."files"("id","institute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_announcement_fk" FOREIGN KEY ("announcement_id","institute_id") REFERENCES "public"."announcements"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_fk" FOREIGN KEY ("announcement_id","institute_id") REFERENCES "public"."announcements"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_recipients_user" ON "announcement_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "announcements_institute_status" ON "announcements" USING btree ("institute_id","status");