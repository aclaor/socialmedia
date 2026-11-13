export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL, salt TEXT NOT NULL, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
    avatar_key TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS uploads (key TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, caption TEXT NOT NULL DEFAULT '', video_key TEXT NOT NULL, thumb_key TEXT,
    duration REAL NOT NULL DEFAULT 0, privacy TEXT NOT NULL DEFAULT 'public', allow_comments INTEGER NOT NULL DEFAULT 1,
    views INTEGER NOT NULL DEFAULT 0, likes_count INTEGER NOT NULL DEFAULT 0, comments_count INTEGER NOT NULL DEFAULT 0,
    shares_count INTEGER NOT NULL DEFAULT 0, bookmarks_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at)`,
  `CREATE TABLE IF NOT EXISTS video_tags (video_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (video_id, tag))`,
  `CREATE INDEX IF NOT EXISTS idx_tags_tag ON video_tags(tag)`,
  `CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL, video_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, video_id))`,
  `CREATE INDEX IF NOT EXISTS idx_likes_video ON likes(video_id)`,
  `CREATE TABLE IF NOT EXISTS bookmarks (user_id INTEGER NOT NULL, video_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, video_id))`,
  `CREATE TABLE IF NOT EXISTS views (user_id INTEGER NOT NULL, video_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, video_id))`,
  `CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL, followee_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, followee_id))`,
  `CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)`,
  `CREATE TABLE IF NOT EXISTS blocks (blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL, PRIMARY KEY (blocker_id, blocked_id))`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT NOT NULL, user_id INTEGER NOT NULL, parent_id INTEGER,
    body TEXT NOT NULL, likes_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS comment_likes (user_id INTEGER NOT NULL, comment_id INTEGER NOT NULL, PRIMARY KEY (user_id, comment_id))`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER NOT NULL, type TEXT NOT NULL,
    video_id TEXT, comment_id INTEGER, seen INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL,
    body TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(sender_id, recipient_id, id)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id, id)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, video_id TEXT NOT NULL, reason TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
];
