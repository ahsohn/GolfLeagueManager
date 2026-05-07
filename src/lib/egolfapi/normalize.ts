// Mirrors GolfMajorsPool/frontend/src/utils/scoring.js:4-10
// and python/src/egolfapi/normalize.py.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeName(name: string): string {
  if (!name) return "";
  return name.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}
