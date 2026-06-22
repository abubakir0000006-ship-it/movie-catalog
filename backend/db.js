// db.js — простая база данных SQLite (файл, не нужен отдельный сервер БД)
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'movies.db'));

// Создаём таблицы, если их ещё нет
db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    original_title TEXT,
    overview TEXT,
    poster_path TEXT,
    backdrop_path TEXT,
    release_date TEXT,
    vote_average REAL,
    vote_count INTEGER,
    runtime INTEGER,
    media_type TEXT, -- 'movie' or 'tv'
    genres TEXT, -- JSON массив жанров
    countries TEXT, -- JSON массив стран
    trailer_key TEXT, -- YouTube key
    watch_providers TEXT, -- JSON массив легальных платформ
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY,
    name TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_release_date ON movies(release_date);
  CREATE INDEX IF NOT EXISTS idx_vote_average ON movies(vote_average);
  CREATE INDEX IF NOT EXISTS idx_media_type ON movies(media_type);
`);

module.exports = db;
