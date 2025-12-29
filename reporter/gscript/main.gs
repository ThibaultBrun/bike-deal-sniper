function main() {
  const threads = listFacture();
  if (!threads || threads.length === 0) {
    Logger.log("Aucun thread");
    return;
  }


  //  Récupère ou crée le label DONE une seule fois
  const DONE_LABEL_NAME = 'rcz_facture/done';
  const doneLabel =
    GmailApp.getUserLabelByName(DONE_LABEL_NAME) ||
    GmailApp.createLabel(DONE_LABEL_NAME);


  const factures = [];

  threads.forEach((thread, idx) => {
    const first_message = thread.getMessages()[0];

    Logger.log(toYMD(first_message.getDate()));

    const details = parseRczOrderEmail(first_message.getBody());

    const date = toYMD(first_message.getDate());
    const order_number = details.order_number;
    const  items = details.items
        .map(i => i.name)
        .join(' + ');

  const subtotal = details.totals.subtotal;
  const discount = details.totals.discount;
  const tva = details.totals.vat;
  const shipping = details.totals.shipping;
  const grand_total = details.totals.grand_total;

  Logger.log(items + " " + + order_number  + " "+ grand_total + "€ ( " + subtotal + " + " + shipping + " - " + discount +" )");


    const purchase = {
      // vendor/source/created_by/etc sont en DEFAULT -> pas besoin de les envoyer
      order_number: String(details.order_number || "").trim(),
      order_date: toYMD(first_message.getDate()), // "YYYY-MM-DD" (si ta table est en DATE)
      items_text: (details.items || []).map(i => i.name).filter(Boolean).join(" + "),

      subtotal: details.totals && details.totals.subtotal,
      discount: details.totals && details.totals.discount,
      vat: details.totals && details.totals.vat,
      shipping: details.totals && details.totals.shipping,
      grand_total: details.totals && details.totals.grand_total
    };

    try {
      const inserted = insertPurchase(purchase);
      Logger.log("✅ Insert OK: " + JSON.stringify(inserted));
        thread.addLabel(doneLabel);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);

      if (msg.indexOf("duplicate key") >= 0 || msg.indexOf("409") >= 0) {
        Logger.log("⚠️ Déjà inséré (duplicate), skip: " + purchase.order_number);
        thread.addLabel(doneLabel);

        return;
      }

      Logger.log("❌ Insert failed: " + msg);
    }

  });

}



function listFacture() {
  const LABEL_FACTURE = 'rcz_facture';
  const LABEL_DONE = 'rcz_facture/done';

  // label facture ET PAS label done
  return GmailApp.search(
    `label:${LABEL_FACTURE} -label:${LABEL_DONE}`,
    0,
    200 // batch max
  );
}


