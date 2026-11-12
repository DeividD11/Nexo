export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("es-CO", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }).format(date);
}

export function truncate(value = "", max = 72) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
