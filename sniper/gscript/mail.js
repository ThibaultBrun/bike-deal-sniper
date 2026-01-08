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