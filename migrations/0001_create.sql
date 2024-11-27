-- Migration number: 0001 	 2024-11-25T00:40:29.492Z
-- Drop existing tables, indexes, and triggers
DROP TRIGGER IF EXISTS update_todays_tasks_timestamp;
DROP TRIGGER IF EXISTS update_all_tasks_timestamp;
DROP INDEX IF EXISTS idx_todays_tasks_user_id;
DROP INDEX IF EXISTS idx_all_tasks_user_id;
DROP TABLE IF EXISTS todays_tasks;
DROP TABLE IF EXISTS all_tasks;

CREATE TABLE IF NOT EXISTS all_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  tasks TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for all_tasks user_id
CREATE INDEX IF NOT EXISTS idx_all_tasks_user_id 
ON all_tasks(user_id);

-- Create trigger for all_tasks
CREATE TRIGGER IF NOT EXISTS update_all_tasks_timestamp 
AFTER UPDATE ON all_tasks
BEGIN
  UPDATE all_tasks SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Today's tasks table
CREATE TABLE IF NOT EXISTS todays_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  tasks TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for todays_tasks user_id
CREATE INDEX IF NOT EXISTS idx_todays_tasks_user_id 
ON todays_tasks(user_id);

-- Create trigger for todays_tasks
CREATE TRIGGER IF NOT EXISTS update_todays_tasks_timestamp 
AFTER UPDATE ON todays_tasks
BEGIN
  UPDATE todays_tasks SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;