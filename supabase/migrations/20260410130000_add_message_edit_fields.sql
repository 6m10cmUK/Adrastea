-- Add edit tracking fields to messages table
ALTER TABLE "public"."messages" ADD COLUMN "edited_at" bigint NULL;
ALTER TABLE "public"."messages" ADD COLUMN "edited_by_uid" uuid NULL;

-- Drop and recreate the messages_update policy to allow sender and room owner to edit
DROP POLICY "messages_update" ON "public"."messages";

CREATE POLICY "messages_update" ON "public"."messages"
FOR UPDATE
USING (
  "public"."has_min_role"("room_id", 'user'::text)
  AND (
    ("sender_uid" = "auth"."uid"())
    OR "public"."has_min_role"("room_id", 'owner'::text)
  )
);

-- Drop and recreate the messages_delete policy to ensure individual message deletion works
DROP POLICY "messages_delete" ON "public"."messages";

CREATE POLICY "messages_delete" ON "public"."messages"
FOR DELETE
USING (
  "public"."has_min_role"("room_id", 'owner'::text)
);
