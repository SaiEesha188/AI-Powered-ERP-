CREATE TYPE "public"."calendar_event_scope" AS ENUM('all', 'classes', 'staff');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_type" AS ENUM('holiday', 'half_day', 'event', 'exam', 'ptm');--> statement-breakpoint
CREATE TABLE "calendar_event_classes" (
	"institute_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	CONSTRAINT "calendar_event_classes_event_id_class_id_pk" PRIMARY KEY("event_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institute_id" uuid NOT NULL,
	"type" "calendar_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"scope" "calendar_event_scope" DEFAULT 'all' NOT NULL,
	"status" "calendar_event_status" NOT NULL,
	"created_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_id_institute" UNIQUE("id","institute_id"),
	CONSTRAINT "calendar_events_dates" CHECK ("calendar_events"."end_date" >= "calendar_events"."start_date")
);
--> statement-breakpoint
ALTER TABLE "calendar_event_classes" ADD CONSTRAINT "calendar_event_classes_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_classes" ADD CONSTRAINT "calendar_event_classes_event_fk" FOREIGN KEY ("event_id","institute_id") REFERENCES "public"."calendar_events"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_classes" ADD CONSTRAINT "calendar_event_classes_class_fk" FOREIGN KEY ("class_id","institute_id") REFERENCES "public"."classes"("id","institute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_institute_dates" ON "calendar_events" USING btree ("institute_id","start_date","end_date");