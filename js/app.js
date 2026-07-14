import { loadAll } from './data.js';
import { renderHome } from './views/home.js';
import { renderCourses } from './views/courses.js';
import { renderCourse } from './views/course.js';
import { renderStats, wireStats } from './views/stats.js';
import { mountNew } from './views/new.js';

const app = document.getElementById('app');
let state = null;

function currentRoute() {
  const [page, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'home', param };
}

function markActiveNav(page) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === page);
  });
}

function onSaved({ games, courses }, courseId) {
  state.games = games;
  if (courses) state.courses = courses;
  location.hash = `#/courses/${courseId}`;
}

function render() {
  if (!state) return;
  const { page, param } = currentRoute();
  markActiveNav(page);
  if (page === 'home') app.innerHTML = renderHome(state);
  else if (page === 'courses' && param) app.innerHTML = renderCourse(state, param);
  else if (page === 'courses') app.innerHTML = renderCourses(state);
  else if (page === 'stats') {
    app.innerHTML = renderStats(state);
    wireStats(app, state);
  } else if (page === 'new') mountNew(app, state, { onSaved });
  else if (page === 'edit' && param) mountNew(app, state, { onSaved, editGameId: param });
  else app.innerHTML = '<p class="empty">Page not found. 🕳️</p>';
  window.scrollTo(0, 0);
}

async function main() {
  try {
    state = await loadAll();
    const [p1, p2] = state.config.players;
    document.documentElement.style.setProperty('--p1', p1.color);
    document.documentElement.style.setProperty('--p2', p2.color);
    render();
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="card error-card">
        <p>Could not load the scores. 😢</p>
        <button type="button" onclick="location.reload()">Try again</button>
      </div>`;
  }
}

window.addEventListener('hashchange', render);
main();
