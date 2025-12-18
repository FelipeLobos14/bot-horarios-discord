function formatDuration(ms) {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / (1000 * 60)) % 60;
  const h = Math.floor(ms / (1000 * 60 * 60));
  return `${h}h ${m}m ${s}s`;
}

function isSameDay(date, target) {
  return date.toDateString() === target.toDateString();
}

module.exports = { formatDuration, isSameDay };
