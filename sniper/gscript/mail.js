/***** ========== RENDU MAIL ========== *****/
function buildSubject_(it) {
  const pct = it.discountPct != null ? `-${it.discountPct}%` : '';
  const usage = it.usageFinal ? ` · ${it.usageFinal}` : '';
  return `[RCZ] ${it.type || ''} ${usage} ${pct} ${it.title || it.rawDescription || 'Article'}`.trim();
}

function buildItemEmailHtml_(item, idx) {
  const code = item.code ? `<code style="background:#111827;color:#fff;padding:2px 6px;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml_(item.code)}</code>` : '—';
  const img  = item.image ? `<img src="${escapeHtml_(item.image)}" alt="" style="max-width:560px;height:auto;border-radius:10px;margin:8px 0;">` : '';
  const url  = escapeHtml_(item.canonical || item.link || '');
  const usage = item.usageFinal || 'Autre';
  const resume = item.resumeIA_fr || '';

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.55">
    <h2 style="margin:0 0 6px">#${idx} · ${escapeHtml_(item.title || item.rawDescription || 'Article RCZ')}</h2>
    <div style="margin:0 0 12px;color:#374151">${item.pageDescription || ''}</div>
    ${img}
    <table style="border-collapse:collapse;margin:10px 0 14px 0;font-size:14px;">
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Usage</td>
        <td style="padding:4px 8px;text-align:right;"><b>${escapeHtml_(usage)}</b></td>
      </tr>
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Résumé IA</td>
        <td style="padding:4px 8px;text-align:right;">${escapeHtml_(resume || '—')}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Compatibilité</td>
        <td style="padding:4px 8px;text-align:right;">${escapeHtml_(item.compatible || '—')}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Prix promo (mail)</td>
        <td style="padding:4px 8px;text-align:right;">
          <b>${fmtPrice_(item.priceNew)}</b>
          &nbsp; <span style="text-decoration:line-through;color:#6b7280;">${fmtPrice_(item.priceOld)}</span>
          &nbsp; <span style="color:#16a34a;font-weight:700;">-${item.discountPct != null ? item.discountPct : '—'}%</span>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Code à appliquer</td>
        <td style="padding:4px 8px;text-align:right;">${code}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;background:#f3f4f6;border-radius:6px;">Lien produit RCZ</td>
        <td style="padding:4px 8px;text-align:right;"><a href="${url}" style="color:#2563eb;text-decoration:none;">${url || '(lien indisponible)'}</a></td>
      </tr>
    </table>
  </div>`;
}

function getOrCreateLabel_(name) {
  const existing = GmailApp.getUserLabelByName(name);
  if (existing) return existing;
  log(`   🏷️  Création du libellé: ${name}`);
  return GmailApp.createLabel(name);
}
function threadHasLabel_(thread, labelName) {
  return thread.getLabels().some(l => l.getName() === labelName);
}
function markDone_(thread, doneLbl) {
  try {
    thread.addLabel(doneLbl);
    log(`   🏁 Label ajouté: ${DONE_LABEL_NAME}`);
  } catch (e) {
    log(`   ⚠️  Impossible d'ajouter le label done: ${e}`);
  }
}