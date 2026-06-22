// tmdb-sync.js — модуль, который сам ходит в TMDB и обновляет каталог
const fetch = require('node-fetch');
const db = require('./db');

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const LANG = 'ru-RU'; // данные на русском

if (!API_KEY) {
  console.warn('⚠️  TMDB_API_KEY не задан в переменных окружения! Синхронизация не будет работать.');
}

// Загружаем справочник жанров один раз и сохраняем в базу
async function syncGenres() {
  const [moviesGenres, tvGenres] = await Promise.all([
    fetchJson(`/genre/movie/list?api_key=${API_KEY}&language=${LANG}`),
    fetchJson(`/genre/tv/list?api_key=${API_KEY}&language=${LANG}`)
  ]);
  const all = [...(moviesGenres.genres || []), ...(tvGenres.genres || [])];
  const insert = db.prepare('INSERT OR REPLACE INTO genres (id, name) VALUES (?, ?)');
  const tx = db.transaction((items) => {
    for (const g of items) insert.run(g.id, g.name);
  });
  tx(all);
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Получить трейлер с YouTube для фильма
async function getTrailerKey(tmdbId, mediaType) {
  try {
    const data = await fetchJson(`/${mediaType}/${tmdbId}/videos?api_key=${API_KEY}&language=${LANG}`);
    const trailer = (data.results || []).find(
      v => v.site === 'YouTube' && v.type === 'Trailer'
    ) || (data.results || [])[0];
    return trailer ? trailer.key : null;
  } catch (e) {
    return null;
  }
}

// Получить легальные платформы для просмотра (watch/providers)
async function getWatchProviders(tmdbId, mediaType) {
  try {
    const data = await fetchJson(`/${mediaType}/${tmdbId}/watch/providers?api_key=${API_KEY}`);
    const region = data.results?.RU || data.results?.US || {};
    const flatrate = region.flatrate || [];
    return flatrate.map(p => ({
      name: p.provider_name,
      logo: `https://image.tmdb.org/t/p/original${p.logo_path}`,
      link: region.link
    }));
  } catch (e) {
    return [];
  }
}

// Получить жанры фильма как массив имён
function getGenreNames(genreIds) {
  const genres = db.prepare('SELECT * FROM genres WHERE id IN (' + genreIds.map(() => '?').join(',') + ')').all(...genreIds);
  return genres.map(g => g.name);
}

// Сохранить один фильм/сериал в базу (с дополнительными данными)
async function saveItem(item, mediaType) {
  const tmdbId = item.id;
  const title = item.title || item.name;
  const originalTitle = item.original_title || item.original_name;
  const releaseDate = item.release_date || item.first_air_date || '';

  // Тянем доп. данные параллельно (трейлер + платформы)
  const [trailerKey, watchProviders] = await Promise.all([
    getTrailerKey(tmdbId, mediaType),
    getWatchProviders(tmdbId, mediaType)
  ]);

  const genreNames = item.genre_ids ? getGenreNames(item.genre_ids) : [];

  const stmt = db.prepare(`
    INSERT INTO movies (
      tmdb_id, title, original_title, overview, poster_path, backdrop_path,
      release_date, vote_average, vote_count, media_type, genres,
      trailer_key, watch_providers, updated_at
    ) VALUES (
      @tmdb_id, @title, @original_title, @overview, @poster_path, @backdrop_path,
      @release_date, @vote_average, @vote_count, @media_type, @genres,
      @trailer_key, @watch_providers, @updated_at
    )
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title=excluded.title, overview=excluded.overview, poster_path=excluded.poster_path,
      backdrop_path=excluded.backdrop_path, vote_average=excluded.vote_average,
      vote_count=excluded.vote_count, genres=excluded.genres,
      trailer_key=excluded.trailer_key, watch_providers=excluded.watch_providers,
      updated_at=excluded.updated_at
  `);

  stmt.run({
    tmdb_id: tmdbId,
    title,
    original_title: originalTitle,
    overview: item.overview || '',
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    release_date: releaseDate,
    vote_average: item.vote_average || 0,
    vote_count: item.vote_count || 0,
    media_type: mediaType,
    genres: JSON.stringify(genreNames),
    trailer_key: trailerKey,
    watch_providers: JSON.stringify(watchProviders),
    updated_at: new Date().toISOString()
  });
}

// Синхронизация одной категории (несколько страниц)
async function syncCategory(endpoint, mediaType, pages = 3) {
  await syncGenres(); // обновляем справочник жанров на всякий случай
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJson(`${endpoint}&page=${page}&language=${LANG}`);
    for (const item of data.results || []) {
      await saveItem(item, mediaType);
    }
    // небольшая пауза, чтобы не упереться в лимиты TMDB (50 запросов / сек)
    await new Promise(r => setTimeout(r, 300));
  }
}

async function syncNowPlaying() {
  console.log('Синхронизация: сейчас в кино...');
  await syncCategory(`/movie/now_playing?api_key=${API_KEY}`, 'movie', 3);
}

async function syncPopular() {
  console.log('Синхронизация: популярное...');
  await syncCategory(`/movie/popular?api_key=${API_KEY}`, 'movie', 3);
  await syncCategory(`/tv/popular?api_key=${API_KEY}`, 'tv', 3);
}

async function syncTopRated() {
  console.log('Синхронизация: топ рейтинг...');
  await syncCategory(`/movie/top_rated?api_key=${API_KEY}`, 'movie', 2);
  await syncCategory(`/tv/top_rated?api_key=${API_KEY}`, 'tv', 2);
}

async function syncByGenres() {
  console.log('Синхронизация: по жанрам...');
  // Можно расширить под конкретные жанры при необходимости
  await syncCategory(`/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc`, 'movie', 2);
}

module.exports = {
  syncNowPlaying,
  syncPopular,
  syncTopRated,
  syncByGenres,
  syncGenres
};
