/*
  # CIBA Authorization and AI Chat Schema

  ## Overview
  This migration creates the database schema for implementing Client Initiated Backchannel Authentication (CIBA)
  with an AI chatbot that requires push approval before accessing user information.

  ## New Tables
  
  ### `ciba_auth_requests`
  Stores backchannel authentication requests initiated by the chatbot
  - `id` (uuid, primary key) - Unique identifier for the auth request
  - `auth_req_id` (text, unique) - Auth0 CIBA request identifier
  - `user_id` (text) - Auth0 user ID who needs to approve
  - `binding_message` (text) - Human-readable message shown during approval
  - `scope` (text) - Requested OAuth scopes
  - `status` (text) - Request status: 'pending', 'approved', 'denied', 'expired'
  - `expires_at` (timestamptz) - When the request expires
  - `created_at` (timestamptz) - When request was created
  - `updated_at` (timestamptz) - Last status update

  ### `chat_messages`
  Stores chat conversation history between user and AI
  - `id` (uuid, primary key) - Unique message identifier
  - `user_id` (text) - Auth0 user ID
  - `role` (text) - Message role: 'user', 'assistant', 'system'
  - `content` (text) - Message text content
  - `requires_approval` (boolean) - Whether message triggered CIBA flow
  - `auth_req_id` (uuid, foreign key) - Link to CIBA request if applicable
  - `created_at` (timestamptz) - Message timestamp

  ### `user_approvals`
  Tracks approval history for audit purposes
  - `id` (uuid, primary key) - Unique approval record
  - `auth_req_id` (uuid, foreign key) - Related CIBA request
  - `user_id` (text) - Auth0 user ID who approved/denied
  - `action` (text) - Action taken: 'approved', 'denied'
  - `approved_at` (timestamptz) - When action was taken

  ## Security
  - Enable RLS on all tables
  - Users can only access their own chat messages
  - Users can only view and approve their own CIBA requests
  - Approval records are read-only after creation

  ## Important Notes
  1. CIBA flow requires Auth0 configuration with backchannel authentication enabled
  2. Binding messages should be descriptive to help users understand what they're approving
  3. Expired requests are automatically marked as such by the polling function
  4. Chat history enables contextual conversations with the AI
*/

-- Create CIBA authorization requests table
CREATE TABLE IF NOT EXISTS ciba_auth_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_req_id text UNIQUE NOT NULL,
  user_id text NOT NULL,
  binding_message text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  requires_approval boolean DEFAULT false,
  auth_req_id uuid REFERENCES ciba_auth_requests(id),
  created_at timestamptz DEFAULT now()
);

-- Create user approvals tracking table
CREATE TABLE IF NOT EXISTS user_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_req_id uuid REFERENCES ciba_auth_requests(id) NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  approved_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ciba_auth_req_id ON ciba_auth_requests(auth_req_id);
CREATE INDEX IF NOT EXISTS idx_ciba_user_id ON ciba_auth_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ciba_status ON ciba_auth_requests(status);
CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_auth_req ON user_approvals(auth_req_id);

-- Enable Row Level Security
ALTER TABLE ciba_auth_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ciba_auth_requests
CREATE POLICY "Users can view own CIBA requests"
  ON ciba_auth_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "System can insert CIBA requests"
  ON ciba_auth_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own CIBA request status"
  ON ciba_auth_requests FOR UPDATE
  TO authenticated
  USING (user_id = auth.jwt()->>'sub')
  WITH CHECK (user_id = auth.jwt()->>'sub');

-- RLS Policies for chat_messages
CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.jwt()->>'sub');

-- RLS Policies for user_approvals
CREATE POLICY "Users can view own approvals"
  ON user_approvals FOR SELECT
  TO authenticated
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert own approvals"
  ON user_approvals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.jwt()->>'sub');
