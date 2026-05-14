-- Run in Supabase SQL editor (or supabase db push) to match Project Planning schema.

CREATE TYPE player_role AS ENUM ('describer', 'writer');
CREATE TYPE room_status AS ENUM ('lobby', 'active', 'ended');
CREATE TYPE game_mode AS ENUM ('classic', 'blitz', 'chain', 'refactor');
CREATE TYPE prompt_category AS ENUM (
  'algorithm',
  'complexity',
  'language',
  'sysdesign',
  'cloud'
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code char(6) UNIQUE NOT NULL,
  host_id uuid,
  status room_status NOT NULL DEFAULT 'lobby',
  game_mode game_mode NOT NULL DEFAULT 'classic',
  current_round integer NOT NULL DEFAULT 0,
  round_count smallint NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(32) NOT NULL,
  room_id uuid REFERENCES rooms (id) ON DELETE CASCADE,
  socket_id varchar(64),
  role player_role,
  is_host boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms
  ADD CONSTRAINT rooms_host_fk FOREIGN KEY (host_id) REFERENCES players (id) ON DELETE SET NULL;

CREATE INDEX players_room_id_idx ON players (room_id);

CREATE TABLE prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  category prompt_category NOT NULL
);

-- Seed a few prompts for local demos (optional).
INSERT INTO prompts (text, category) VALUES
  ('Write a function that draws a graph using PyTorch.', 'language'),
  ('Write any function that runs in O(n log n) time.', 'complexity'),
  ('Write a function that multiplies two numbers in O(n log n).', 'complexity'),
  ('Add two numbers in MIPSY.', 'language'),
  ('Design an API rate limiter for a distributed system.', 'sysdesign');
