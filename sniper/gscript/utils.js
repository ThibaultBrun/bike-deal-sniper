// Utilitaire pour échapper le HTML
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl_(base, rel) { try { return new URL(rel, base).toString(); } catch { return rel; } }
