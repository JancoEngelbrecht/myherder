const DATE_OPTIONS = { day: '2-digit', month: 'short', year: 'numeric' }
const DATETIME_OPTIONS = { ...DATE_OPTIONS, hour: '2-digit', minute: '2-digit' }

export function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, DATE_OPTIONS)
}

export function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, DATETIME_OPTIONS)
}
