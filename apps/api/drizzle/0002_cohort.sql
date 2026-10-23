CREATE TYPE "public"."batch_member_role" AS ENUM('mentor', 'program_manager');--> statement-breakpoint
CREATE TABLE "batch_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "batch_member_role" NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone,
	"unassigned_by" uuid,
	CONSTRAINT "batch_members_unassigned_check" CHECK (("batch_members"."unassigned_at" is null) = ("batch_members"."unassigned_by" is null)),
	CONSTRAINT "batch_members_unassigned_after_check" CHECK ("batch_members"."unassigned_at" is null or "batch_members"."unassigned_at" >= "batch_members"."assigned_at")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_name_unique" UNIQUE("name"),
	CONSTRAINT "batches_dates_check" CHECK ("batches"."end_date" > "batches"."start_date")
);
--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_members" ADD CONSTRAINT "batch_members_unassigned_by_users_id_fk" FOREIGN KEY ("unassigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_members_one_pm_unique" ON "batch_members" USING btree ("batch_id") WHERE "batch_members"."role" = 'program_manager' and "batch_members"."unassigned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_members_current_unique" ON "batch_members" USING btree ("batch_id","user_id","role") WHERE "batch_members"."unassigned_at" is null;--> statement-breakpoint
CREATE INDEX "batch_members_current_user_index" ON "batch_members" USING btree ("user_id") WHERE "batch_members"."unassigned_at" is null;