// server.js — основной сервер
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const { syncPopular, syncNowPlaying, syncTopRated, syncByGenres } = require('./tmdb-sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === API ЭНДПОИНТЫ ===

// Список фильмов с фильтрами: /api/movies?genre=28&year=2025&type=movie&sort=rating&page=1
app.get('/api/movies', (req, res) => {
  const { genre, year, country, type, sort, page = 1, search } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;

  let conditions = [];
  let params = {};

  if (type) {
    conditions.push('media_type = :type');
    params.type = type;
  }
  if (year) {
    conditions.push("release_date LIKE :year");
    params.year = `${year}%`;
  }
  if (genre) {
    conditions.push("genres LIKE :genre");
    params.genre = `%"${genre}"%`;
  }
  if (search) {
    conditions.push('(title LIKE :search OR original_title LIKE :search)');
    params.search = `%${search}%`;
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  let orderBy = 'release_date DESC';
  if (sort === 'rating') orderBy = 'vote_average DESC';
  if (sort === 'year') orderBy = 'release_date DESC';
  if (sort === 'title') orderBy = 'title ASC';

  const query = `SELECT * FROM movies ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
  const stmt = db.prepare(query);
  const movies = stmt.all(params);

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM movies ${where}`);
  const { total } = countStmt.get(params);

  res.json({
    movies: movies.map(formatMovie),
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit)
  });
});

// Один фильм по id: /api/movies/123
app.get('/api/movies/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  res.json(formatMovie(movie));
});

// Список жанров для фильтра
app.get('/api/genres', (req, res) => {
  const genres = db.prepare('SELECT * FROM genres').all();
  res.json(genres);
});

// Новинки для карусели на главной
app.get('/api/featured', (req, res) => {
  const movies = db.prepare('SELECT * FROM movies ORDER BY release_date DESC LIMIT 10').all();
  res.json(movies.map(formatMovie));
});

// Ручной запуск синхронизации (на случай если нужно обновить прямо сейчас)
app.post('/api/sync', async (req, res) => {
  try {
    await runFullSync();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === ПРОКСИ ДЛЯ ОБХОДА БЛОКИРОВОК (добавленный эндпоинт) ===
app.get('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  res.redirect(url);
});

function formatMovie(row) {
  return {
    ...row,
    genres: JSON.parse(row.genres || '[]'),
    countries: JSON.parse(row.countries || '[]'),
    watch_providers: JSON.parse(row.watch_providers || '[]'),
    poster_url: row.poster_path ? `https://image.tmdb.org/t/p/w500${row.poster_path}` : null,
    backdrop_url: row.backdrop_path ? `https://image.tmdb.org/t/p/original${row.backdrop_path}` : null,
  };
}

// === АВТООБНОВЛЕНИЕ КАТАЛОГА ===
async function runFullSync() {
  console.log('Запуск синхронизации с TMDB...');
  await syncNowPlaying();
  await syncPopular();
  await syncTopRated();
  await syncByGenres();
  console.log('Синхронизация завершена');
}

// Раз в день в 4 утра — сайт сам обновляет каталог
cron.schedule('0 4 * * *', () => {
  runFullSync().catch(console.error);
});

// При первом запуске сервера — сразу подтягиваем данные, если база пустая
const movieCount = db.prepare('SELECT COUNT(*) as c FROM movies').get().c;
if (movieCount === 0) {
  console.log('База пустая, запускаю первую синхронизацию...');
  runFullSync().catch(console.error);
}

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
