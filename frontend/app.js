// app.js — вся логика фронтенда
const API_URL = 'https://ВАШ-БЭКЕНД.onrender.com/api'; // ← замени на свой адрес

let state = {
  type: '',
  genre: '',
  year: '',
  sort: 'date',
  page: 1,
  search: ''
};

const movieGrid = document.getElementById('movieGrid');
const carousel = document.getElementById('carousel');
const pagination = document.getElementById('pagination');
const catalogTitle = document.getElementById('catalogTitle');

// === ЗАГРУЗКА КАРУСЕЛИ НОВИНОК ===
async function loadFeatured() {
  try {
    const res = await fetch(`${API_URL}/featured`);
    const movies = await res.json();
    carousel.innerHTML = movies.map(m => `
      <div class="carousel-item" onclick="openMovie(${m.id})">
        <img src="${m.poster_url || 'https://via.placeholder.com/160x230?text=No+Image'}" alt="${escapeHtml(m.title)}">
        <div class="title">${escapeHtml(m.title)}</div>
      </div>
    `).join('');
  } catch (e) {
    carousel.innerHTML = '<p style="color:#9a9ca5">Не удалось загрузить новинки</p>';
  }
}

// === ЗАГРУЗКА СПИСКА ЖАНРОВ ДЛЯ ФИЛЬТРА ===
async function loadGenres() {
  try {
    const res = await fetch(`${API_URL}/genres`);
    const genres = await res.json();
    const select = document.getElementById('filterGenre');
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.name;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Не удалось загрузить жанры', e);
  }
}

// === ЗАПОЛНЕНИЕ ФИЛЬТРА ПО ГОДАМ ===
function fillYears() {
  const select = document.getElementById('filterYear');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= 1990; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }
}

// === ЗАГРУЗКА КАТАЛОГА С ФИЛЬТРАМИ ===
async function loadCatalog() {
  movieGrid.innerHTML = '<div class="loading">Загрузка...</div>';

  const params = new URLSearchParams();
  if (state.type) params.set('type', state.type);
  if (state.genre) params.set('genre', state.genre);
  if (state.year) params.set('year', state.year);
  if (state.sort) params.set('sort', state.sort);
  if (state.search) params.set('search', state.search);
  params.set('page', state.page);

  try {
    const res = await fetch(`${API_URL}/movies?${params.toString()}`);
    const data = await res.json();
    renderGrid(data.movies);
    renderPagination(data.page, data.totalPages);
  } catch (e) {
    movieGrid.innerHTML = '<div class="loading">Не удалось загрузить каталог. Проверьте, что backend запущен.</div>';
  }
}

function renderGrid(movies) {
  if (!movies.length) {
    movieGrid.innerHTML = '<div class="loading">Ничего не найдено</div>';
    return;
  }
  movieGrid.innerHTML = movies.map(m => `
    <div class="movie-card" onclick="openMovie(${m.id})">
      <img src="${m.poster_url || 'https://via.placeholder.com/200x250?text=No+Image'}" alt="${escapeHtml(m.title)}">
      <div class="info">
        <div class="title">${escapeHtml(m.title)}</div>
        <div class="meta">
          <span>${(m.release_date || '').slice(0, 4) || '—'}</span>
          <span class="rating-badge">${m.vote_average ? m.vote_average.toFixed(1) : '—'}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPagination(current, total) {
  if (total <= 1) { pagination.innerHTML = ''; return; }
  let html = '';
  const maxButtons = 7;
  let start = Math.max(1, current - 3);
  let end = Math.min(total, start + maxButtons - 1);

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  pagination.innerHTML = html;
}

function goToPage(page) {
  state.page = page;
  loadCatalog();
  window.scrollTo({ top: document.querySelector('.content').offsetTop - 20, behavior: 'smooth' });
}

// === МОДАЛКА С ДЕТАЛЯМИ ФИЛЬМА (ПИРАТСКАЯ ВЕРСИЯ) ===
const modal = document.getElementById('movieModal');
const modalContent = document.getElementById('modalContent');

async function openMovie(id) {
  modal.classList.add('open');
  modalContent.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    const res = await fetch(`${API_URL}/movies/${id}`);
    const m = await res.json();

    // Формируем поисковый запрос для hdrezka (название + год)
    const searchQuery = encodeURIComponent(m.title + ' ' + (m.release_date || '').slice(0,4));
    const hdrezkaUrl = `https://hdrezka.ag/search/?q=${searchQuery}`;

    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-body">
        <div>
          <img src="${m.poster_url || 'https://via.placeholder.com/240x340?text=No+Image'}" alt="${escapeHtml(m.title)}">
        </div>
        <div>
          <h2>${escapeHtml(m.title)}</h2>
          <div class="modal-meta"><b>Год:</b> ${(m.release_date || '').slice(0,4) || '—'}</div>
          <div class="modal-meta"><b>Рейтинг TMDB:</b> ${m.vote_average ? m.vote_average.toFixed(1) : '—'} (${m.vote_count || 0} голосов)</div>
          <div class="modal-meta"><b>Жанры:</b> ${(m.genres || []).join(', ') || '—'}</div>
          <div class="overview">${escapeHtml(m.overview) || 'Описание отсутствует.'}</div>
          
          <!-- ПИРАТСКИЙ ПЛЕЕР (iframe с hdrezka) -->
          <iframe class="trailer-frame" src="${hdrezkaUrl}" allowfullscreen></iframe>
          
          <!-- РЕКЛАМА КАЗИНО (ЗАМЕНИ ССЫЛКУ) -->
          <div style="margin-top: 16px; text-align: center;">
            <a href="https://твоя-партнерская-ссылка-казино.com" target="_blank">
              <img src="https://via.placeholder.com/728x90/f5c842/000?text=YOUR+CASINO+AD" style="width:100%; max-width:728px;" alt="Реклама">
            </a>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    modalContent.innerHTML = '<button class="modal-close" onclick="closeModal()">✕</button><p>Ошибка загрузки</p>';
  }
}

function closeModal() {
  modal.classList.remove('open');
}
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// === ОБРАБОТЧИКИ ФИЛЬТРОВ ===
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.type = btn.dataset.type;
    state.page = 1;
    catalogTitle.textContent = btn.textContent;
    loadCatalog();
  });
});

document.getElementById('filterGenre').addEventListener('change', (e) => {
  state.genre = e.target.value;
  state.page = 1;
  loadCatalog();
});
document.getElementById('filterYear').addEventListener('change', (e) => {
  state.year = e.target.value;
  state.page = 1;
  loadCatalog();
});
document.getElementById('filterSort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  state.page = 1;
  loadCatalog();
});
document.getElementById('resetFilters').addEventListener('click', () => {
  state = { type: '', genre: '', year: '', sort: 'date', page: 1, search: '' };
  document.getElementById('filterGenre').value = '';
  document.getElementById('filterYear').value = '';
  document.getElementById('filterSort').value = 'date';
  document.getElementById('searchInput').value = '';
  loadCatalog();
});

document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doSearch();
});
function doSearch() {
  state.search = document.getElementById('searchInput').value.trim();
  state.page = 1;
  loadCatalog();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === ИНИЦИАЛИЗАЦИЯ ===
loadFeatured();
loadGenres();
fillYears();
loadCatalog();
