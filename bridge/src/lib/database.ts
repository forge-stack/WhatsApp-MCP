import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Check if we're in build phase
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

// Use global to persist database across hot reloads
const globalForDb = globalThis as unknown as {
  db: Database.Database | null;
  dbHelpers: ReturnType<typeof createHelpers> | null;
  initialized: boolean;
};

// Initialize global state
if (!globalForDb.initialized) {
  globalForDb.db = null;
  globalForDb.dbHelpers = null;
  globalForDb.initialized = true;
}

function initializeDatabase(): Database.Database {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'whatsapp.db');
  globalForDb.db = new Database(dbPath);

  // WAL Mode with optimal settings for high-volume writes
  globalForDb.db.pragma('journal_mode = WAL');
  globalForDb.db.pragma('synchronous = NORMAL');
  globalForDb.db.pragma('cache_size = -64000'); // 64MB cache

  // Critical fixes for compaction errors
  globalForDb.db.pragma('wal_autocheckpoint = 5000');
  globalForDb.db.pragma('busy_timeout = 10000');

  // Disable foreign keys to avoid constraint errors during sync
  globalForDb.db.pragma('foreign_keys = OFF');

  // Temp store optimization
  globalForDb.db.pragma('temp_store = MEMORY');
  globalForDb.db.pragma('query_only = FALSE');

  // Initialize tables
  globalForDb.db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      name TEXT,
      notify TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      last_message_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      sender_jid TEXT,
      content TEXT,
      message_type TEXT DEFAULT 'text',
      is_from_me INTEGER DEFAULT 0,
      timestamp DATETIME,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_status (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_jid ON messages(chat_jid);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content);
    CREATE INDEX IF NOT EXISTS idx_chats_last_message ON chats(last_message_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
  `);

  console.log('[Database] Initialized with optimizations');
  return globalForDb.db;
}

function createHelpers(db: Database.Database) {
  return {
    // Contacts
    upsertContact: db.prepare(`
      INSERT INTO contacts (jid, name, notify, phone, updated_at)
      VALUES (@jid, @name, @notify, @phone, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(@name, name),
        notify = COALESCE(@notify, notify),
        phone = COALESCE(@phone, phone),
        updated_at = CURRENT_TIMESTAMP
    `),

    getContact: db.prepare('SELECT * FROM contacts WHERE jid = ?'),

    searchContacts: db.prepare(`
      SELECT * FROM contacts 
      WHERE name LIKE @query OR notify LIKE @query OR phone LIKE @query
      ORDER BY updated_at DESC
      LIMIT @limit
    `),

    getAllContacts: db.prepare(`
      SELECT * FROM contacts 
      ORDER BY name ASC
      LIMIT @limit OFFSET @offset
    `),

    // Chats
    upsertChat: db.prepare(`
      INSERT INTO chats (jid, name, is_group, unread_count, last_message_at, updated_at)
      VALUES (@jid, @name, @is_group, @unread_count, @last_message_at, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(@name, name),
        is_group = COALESCE(@is_group, is_group),
        unread_count = COALESCE(@unread_count, unread_count),
        last_message_at = COALESCE(@last_message_at, last_message_at),
        updated_at = CURRENT_TIMESTAMP
    `),

    getChat: db.prepare('SELECT * FROM chats WHERE jid = ?'),

    getAllChats: db.prepare(`
      SELECT * FROM chats 
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT @limit OFFSET @offset
    `),

    getChatCount: db.prepare('SELECT COUNT(*) as count FROM chats'),

    // Messages
    insertMessage: db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_jid, sender_jid, content, message_type, is_from_me, timestamp, raw_data)
      VALUES (@id, @chat_jid, @sender_jid, @content, @message_type, @is_from_me, @timestamp, @raw_data)
    `),

    getMessages: db.prepare(`
      SELECT * FROM messages 
      WHERE chat_jid = @chat_jid
      ORDER BY timestamp DESC
      LIMIT @limit OFFSET @offset
    `),

    getMessageCount: db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE chat_jid = ?
    `),

    searchMessages: db.prepare(`
      SELECT m.*, c.name as chat_name 
      FROM messages m
      LEFT JOIN chats c ON m.chat_jid = c.jid
      WHERE m.content LIKE @query
      ORDER BY m.timestamp DESC
      LIMIT @limit
    `),

    getRecentMessages: db.prepare(`
      SELECT m.*, c.name as chat_name 
      FROM messages m
      LEFT JOIN chats c ON m.chat_jid = c.jid
      ORDER BY m.timestamp DESC
      LIMIT @limit
    `),

    getOldestMessages: db.prepare(`
      SELECT m.*, c.name as chat_name 
      FROM messages m
      LEFT JOIN chats c ON m.chat_jid = c.jid
      ORDER BY m.timestamp ASC
      LIMIT @limit
    `),

    getLastDayMessages: db.prepare(`
      SELECT m.*, c.name as chat_name 
      FROM messages m
      LEFT JOIN chats c ON m.chat_jid = c.jid
      WHERE m.timestamp > datetime('now', '-1 day')
      ORDER BY m.timestamp DESC
      LIMIT @limit
    `),

    // Sync status
    setSyncStatus: db.prepare(`
      INSERT INTO sync_status (key, value, updated_at)
      VALUES (@key, @value, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = @value,
        updated_at = CURRENT_TIMESTAMP
    `),

    getSyncStatus: db.prepare(`
      SELECT value FROM sync_status WHERE key = ?
    `),

    getAllSyncStatus: db.prepare(`
      SELECT * FROM sync_status
    `)
  };
}

// Lazy getter for database
export function getDb(): Database.Database | null {
  if (isBuildPhase) {
    return null;
  }
  return initializeDatabase();
}

// Lazy getter for helpers
export function getDbHelpers() {
  if (isBuildPhase) {
    return null;
  }

  if (!globalForDb.dbHelpers) {
    const db = initializeDatabase();
    globalForDb.dbHelpers = createHelpers(db);
  }
  return globalForDb.dbHelpers;
}

// Manual checkpoint function
export function checkpointDatabase() {
  const db = getDb();
  if (!db) return;

  try {
    db.pragma('wal_checkpoint(RESTART)');
    console.log('[Database] WAL checkpoint completed');
  } catch (error) {
    console.error('[Database] Checkpoint error:', error);
  }
}

// Legacy exports for compatibility (use getDb() and getDbHelpers() instead)
export const db = new Proxy({} as Database.Database, {
  get(_, prop) {
    const realDb = getDb();
    if (!realDb) throw new Error('Database not available during build');
    return (realDb as any)[prop];
  }
});

export const dbHelpers = new Proxy({} as ReturnType<typeof createHelpers>, {
  get(_, prop) {
    const helpers = getDbHelpers();
    if (!helpers) throw new Error('Database not available during build');
    return (helpers as any)[prop];
  }
});

export default db;