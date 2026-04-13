-- ══════════════════════════════════════════════
-- The Unc Backrooms — Supabase Schema
-- Run this in your Supabase SQL editor
-- ══════════════════════════════════════════════

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  entity_slug TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast message lookups
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_entity
  ON messages(entity_slug);

CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations(status, created_at DESC);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Public read access (everyone can view)
CREATE POLICY "Public read conversations"
  ON conversations FOR SELECT
  USING (true);

CREATE POLICY "Public read messages"
  ON messages FOR SELECT
  USING (true);

-- Service role can insert/update (for the engine)
CREATE POLICY "Service insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update conversations"
  ON conversations FOR UPDATE
  USING (true);

CREATE POLICY "Service insert messages"
  ON messages FOR INSERT
  WITH CHECK (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
