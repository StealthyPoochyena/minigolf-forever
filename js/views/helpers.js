export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const CROWN = '<span class="crown" role="img" aria-label="leader">👑</span>';

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const fmt1 = (n) => n.toFixed(1);

export const courseName = (courses, id) => {
  const course = courses.find((c) => c.id === id);
  return course ? course.name : id;
};
