/**
 * Google Apps Script — Parse email HTML RCZ (quoted-printable) -> JSON
 *
 * Usage:
 *   const data = parseRczOrderEmail(rawHtmlString);
 *   Logger.log(JSON.stringify(data, null, 2));
 */
function parseRczOrderEmail(rawHtml) {
  var html = decodeQuotedPrintableUtf8_(rawHtml || "");

  // normalisation légère (évite que les regex cassent)
  var norm = html
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " ") // nbsp
    .replace(/\s+/g, " ");

  var out = {
    vendor: "RCZ Bike Shop",
    invoice_number: null,
    order_number: null,
    customer_name: null,
    billing_address: null,
    shipping_address: null,
    shipping_method: null,
    payment_method: null,
    payment_id: null,
    items: [],
    totals: {
      subtotal: null,
      discount: null,
      vat: null,
      shipping: null,
      grand_total: null
    },
    currency: "EUR",
    raw: {
      subject_line: null
    }
  };

  // --- Invoice / order (depuis le H1)
  // "Votre facture #31000104048 pour la commande #31000133592"
  var h1 = match1_(norm, /<h1[^>]*>\s*([^<]*?)\s*<\/h1>/i);
  if (h1) {
    out.raw.subject_line = stripTags_(h1);
    out.invoice_number = match1_(h1, /facture\s*#\s*(\d+)/i);
    out.order_number = match1_(h1, /commande\s*#\s*(\d+)/i);
  }

  // --- Customer greeting: "<p class="greeting">thibault brun,</p>"
  var greet = match1_(norm, /<p[^>]*class=["']greeting["'][^>]*>\s*([^<,]+)\s*,\s*<\/p>/i);
  if (greet) out.customer_name = stripTags_(greet).trim();

  // --- Billing & shipping blocks (RCZ: td.address-details avec <h3>Informations de facturation / Shipping Info)
  out.billing_address = extractAddressBlock_(norm, /Informations de facturation/i);
  out.shipping_address = extractAddressBlock_(norm, /Shipping Info/i);

  // --- Payment method + payment id
  // on récupère la section "Mode de paiement" puis "Creditcard/Deditcard" & "Payment Id"
  var paymentSection = sliceBetween_(norm, /Mode de paiement/i, /Mode de livraison/i);
  if (paymentSection) {
    out.payment_method = cleanText_(match1_(paymentSection, /<p[^>]*>\s*([^<]*?)\s*<\/p>\s*<\/dt>/i) || "")
      || cleanText_(match1_(paymentSection, /<p[^>]*>\s*([^<]*Creditcard[^<]*)\s*<\/p>/i) || null);
    out.payment_id = cleanText_(match1_(paymentSection, /Payment Id\s*<\/h4>\s*<p[^>]*>\s*([^<]+)\s*<\/p>/i));
  }

  // --- Shipping method
  var shipSection = sliceBetween_(norm, /Mode de livraison/i, /<\/td>\s*<\/tr>\s*<\/table>/i);
  if (shipSection) {
    out.shipping_method = cleanText_(match1_(shipSection, /<p[^>]*>\s*([^<]+)\s*<\/p>/i));
  }

  // --- Items: <p class="product-name"> ... </p>, qty dans <td class="item-qty">, price dans <span class="price">
  out.items = extractItems_(norm);

  // --- Totals (tfoot.order-totals)
out.totals.subtotal    = extractTotalByDataTh_(norm, /^Sous-total$/i);
out.totals.discount    = extractTotalByDataTh_(norm, /^Remise/i);          // dynamique (RCZG20 etc.)
out.totals.vat         = extractTotalByDataTh_(norm, /^TVA$/i);
out.totals.shipping    = extractTotalByDataTh_(norm, /^Frais de port$/i);
out.totals.grand_total = extractTotalByDataTh_(norm, /^Montant global$/i);

  return out;
}

/* ------------------ Helpers ------------------ */

function decodeQuotedPrintableUtf8_(input) {
  // 1) supprime les soft line breaks: "=\n"
  var s = String(input).replace(/=\r?\n/g, "");

  // 2) convertit =XX en bytes
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === "=" && i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
      bytes.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(s.charCodeAt(i) & 0xff);
    }
  }

  // 3) bytes -> string UTF-8
  return Utilities.newBlob(bytes).getDataAsString("UTF-8");
}

function extractTotalByDataTh_(normHtml, dataThRegex) {
  // dataThRegex: RegExp (ex: /^Sous-total$/i, /^Remise/i, /^Montant global$/i)
  var tdRe = /<td[^>]*\bdata-th\s*=\s*["']([^"']+)["'][^>]*>/gi;
  var m;

  while ((m = tdRe.exec(normHtml)) !== null) {
    var dataThValue = m[1];
    if (!dataThRegex.test(dataThValue)) continue;

    var start = m.index;
    var windowText = normHtml.substring(start, Math.min(normHtml.length, start + 1200));

    // tolère class="price" ET class=="price"
    var price = match1_(
      windowText,
      /<span[^>]*\bclass\s*=+\s*["']price["'][^>]*>([\s\S]*?)<\/span>/i
    );

    if (!price) {
      var rawPrice = match1_(windowText, /(-?\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?)\s*(?:€|EUR)/i);
      return parseEuro_(rawPrice);
    }

    return parseEuro_(cleanText_(price));
  }

  return null;
}


function escapeRegExp_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function extractItems_(normHtml) {
  var items = [];

  // On isole le tbody des items (plus stable)
  var itemsTable = sliceBetween_(normHtml, /<table[^>]*class=["']email-items["'][^>]*>/i, /<\/table>/i);
  if (!itemsTable) return items;

  // Chaque item est un <tr> qui contient product-name + item-qty + item-price
  var rowRe = /<tr[^>]*>\s*<td[^>]*class=["']item-info["'][^>]*>[\s\S]*?<\/td>\s*<td[^>]*class=["']item-qty["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["']item-price["'][^>]*>[\s\S]*?<span[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/td>\s*<\/tr>/gi;

  var m;
  while ((m = rowRe.exec(itemsTable)) !== null) {
    var rowChunkStart = Math.max(0, m.index - 500);
    var rowChunkEnd = Math.min(itemsTable.length, m.index + 1500);
    var rowChunk = itemsTable.substring(rowChunkStart, rowChunkEnd);

    var name = cleanText_(match1_(rowChunk, /<p[^>]*class=["']product-name["'][^>]*>\s*([\s\S]*?)\s*<\/p>/i));
    var ref  = cleanText_(match1_(rowChunk, /<p[^>]*class=["']sku["'][^>]*>\s*([\s\S]*?)\s*<\/p>/i));

    var qtyText = cleanText_(m[1]);
    var priceText = cleanText_(m[2]);

    var qty = qtyText ? parseInt(qtyText, 10) : null;

    items.push({
      name: name || null,
      reference: ref ? ref.replace(/^REF:\s*/i, "").trim() : null,
      quantity: isFinite(qty) ? qty : null,
      unit_price_eur: parseEuro_(priceText),
      currency: "EUR"
    });
  }

  return items;
}

function extractTotalByLabel_(normHtml, labelRegex) {
  var tfoot = match1_(normHtml, /<tfoot[^>]*class=["']order-totals["'][^>]*>([\s\S]*?)<\/tfoot>/i);
  if (!tfoot) return null;

  // récupère toutes les lignes <tr>...</tr> du tfoot
  var rows = tfoot.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    // texte du TH (souvent label)
    var thHtml = match1_(row, /<th[^>]*>([\s\S]*?)<\/th>/i);
    // parfois c'est dans un TD si structure différente
    var labelText = cleanText_(thHtml || match1_(row, /<td[^>]*>([\s\S]*?)<\/td>/i) || "");

    if (labelText && labelRegex.test(labelText)) {
      // prend le DERNIER span.price de la ligne (le plus fiable)
      var spans = row.match(/<span[^>]*class=["']price["'][^>]*>[\s\S]*?<\/span>/gi) || [];
      if (spans.length) {
        var lastSpan = spans[spans.length - 1];
        var priceInner = match1_(lastSpan, /<span[^>]*>([\s\S]*?)<\/span>/i);
        return parseEuro_(cleanText_(priceInner));
      }

      // fallback: prix direct "43,49 €" dans la ligne
      var rawPrice = match1_(row, /(-?\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?)\s*(?:€|EUR)/i);
      return parseEuro_(rawPrice);
    }
  }

  return null;
}

function extractAddressBlock_(normHtml, h3Regex) {
  // Trouve le <td class="address-details"> contenant <h3>...match...</h3> puis récupère le <p> suivant.
  var tdRe = /<td[^>]*class=["']address-details["'][^>]*>([\s\S]*?)<\/td>/gi;
  var m;
  while ((m = tdRe.exec(normHtml)) !== null) {
    var td = m[1];
    var h3 = match1_(td, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (h3 && h3Regex.test(stripTags_(h3))) {
      var p = match1_(td, /<p[^>]*>([\s\S]*?)<\/p>/i);
      if (!p) return null;

      // conserve les sauts de ligne <br>
      var txt = p
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n")
        .trim();

      return txt || null;
    }
  }
  return null;
}

function sliceBetween_(s, startRe, endRe) {
  var start = s.search(startRe);
  if (start < 0) return null;
  var sub = s.substring(start);
  var end = sub.search(endRe);
  if (end < 0) return sub;
  return sub.substring(0, end);
}

function parseEuro_(str) {
  if (!str) return null;
  var s = String(str)
    .replace(/\u00A0/g, " ")
    .replace(/[^\d,\.\-]/g, "")
    .trim();
  if (!s) return null;

  // FR: virgule décimale. On vire les points milliers éventuels.
  s = s.replace(/\./g, "").replace(",", ".");
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function stripTags_(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}

function cleanText_(s) {
  return stripTags_(String(s || ""))
    .replace(/\s+/g, " ")
    .trim() || null;
}

function match1_(s, re) {
  var m = String(s || "").match(re);
  return m ? m[1] : null;
}

/* --------- Petit test rapide --------- */
function test_parseRczOrderEmail() {
  var raw = "<html xmlns=3D\"http://www.w3.org/1999/xhtml\" style=3D\"font-size: 62.5%; -we=bkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-size-adjust: =100%; background-color: #f5f5f5;\"><head>    <meta http-equiv=3D\"Content-Type\" content=3D\"text/html; charset=3Dutf-8=\">    <meta name=3D\"viewport\" content=3D\"initial-scale=3D1.0, width=3Ddevice-=width\">    <meta http-equiv=3D\"X-UA-Compatible\" content=3D\"IE=3Dedge\">    <style type=3D\"text/css\">        body,td { color:#2f2f2f; font:11px/1.35em Verdana, Arial, Helvetica=, sans-serif; }        @import url(\"https://www.rczbikeshop.com/static/version1765785498/f=rontend/Rcz/default/fr_FR/css/email-fonts.css\");html{font-size:62.5%;-webki=t-text-size-adjust:100%;-ms-text-size-adjust:100%;font-size-adjust:100%}bod=y{color:#333;font-family:'Open Sans','Helvetica Neue',Helvetica,Arial,sans-=serif;font-style:normal;font-weight:400;line-height:1.42857143;font-size:14=px}p{margin-top:0;margin-bottom:10px}abbr[title]{border-bottom:1px dotted #=ccc;cursor:help}b,strong{font-weight:700}em,i{font-style:italic}mark{backgr=ound:#f6f6f6;color:#000}small,.small{font-size:12px}hr{border:0;border-top:=1px solid #ccc;margin-bottom:20px;margin-top:20px}sub,sup{font-size:71.4285=7143000001%;line-height:0;position:relative;vertical-align:baseline}sup{top=:-.5em}sub{bottom:-.25em}dfn{font-style:italic}h1{font-weight:300;line-heig=ht:1.1;font-size:26px;margin-top:0;margin-bottom:20px}h2{font-weight:300;li=ne-height:1.1;font-size:26px;margin-top:25px;margin-bottom:20px}h3{font-wei=ght:300;line-height:1.1;font-size:18px;margin-top:20px;margin-bottom:10px}h=4{font-weight:700;line-height:1.1;font-size:14px;margin-top:20px;margin-bot=tom:20px}h5{font-weight:700;line-height:1.1;font-size:12px;margin-top:20px;=margin-bottom:20px}h6{font-weight:700;line-height:1.1;font-size:10px;margin=-top:20px;margin-bottom:20px}h1 small,h2 small,h3 small,h4 small,h5 small,h=6 small,h1 .small,h2 .small,h3 .small,h4 .small,h5 .small,h6 .small{color:#=333;font-family:'Open Sans','Helvetica Neue',Helvetica,Arial,sans-serif;fon=t-style:normal;font-weight:400;line-height:1}a,.alink{color:#006bb4;text-de=coration:none}a:visited,.alink:visited{color:#006bb4;text-decoration:none}a=:hover,.alink:hover{color:#006bb4;text-decoration:underline}a:active,.alink=:active{color:#ff5501;text-decoration:underline}ul,ol{margin-top:0;margin-b=ottom:25px}ul>li,ol>li{margin-top:0;margin-bottom:10px}ul ul,ol ul,ul ol,ol= ol{margin-bottom:0}dl{margin-bottom:20px;margin-top:0}dt{font-weight:700;m=argin-bottom:5px;margin-top:0}dd{margin-bottom:10px;margin-top:0;margin-lef=t:0}code,kbd,pre,samp{font-family:Menlo,Monaco,Consolas,'Courier New',monos=pace}code{background:#f6f6f6;color:#111;padding:2px 4px;font-size:12px;whit=e-space:nowrap}kbd{background:#f6f6f6;color:#111;padding:2px 4px;font-size:=12px}pre{background:#f6f6f6;border:1px solid #ccc;color:#111;line-height:1.=42857143;margin:0 0 10px;padding:10px;font-size:12px;display:block;word-wra=p:break-word}pre code{background-color:transparent;border-radius:0;color:in=herit;font-size:inherit;padding:0;white-space:pre-wrap}blockquote{border-le=ft:0 solid #ccc;margin:0 0 20px 40px;padding:0;color:#333;font-family:'Open= Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-style:italic;font-w=eight:400;line-height:1.42857143;font-size:14px}blockquote p:last-child,blo=ckquote ul:last-child,blockquote ol:last-child{margin-bottom:0}blockquote f=ooter,blockquote small,blockquote .small{color:#333;line-height:1.42857143;=font-size:10px;display:block}blockquote footer:before,blockquote small:befo=re,blockquote .small:before{content:'\2014 \00A0'}blockquote cite{font-styl=e:normal}blockquote:before,blockquote:after{content:''}q{quotes:none}q:befo=re,q:after{content:'';content:none}cite{font-style:normal}.shipment-track t=h{text-align:left}.shipment-track>tbody>tr>th,.shipment-track>tfoot>tr>th,.=shipment-track>tbody>tr>td,.shipment-track>tfoot>tr>td{vertical-align:top}.=shipment-track>thead>tr>th,.shipment-track>thead>tr>td{vertical-align:botto=m}.shipment-track>thead>tr>th,.shipment-track>tbody>tr>th,.shipment-track>t=foot>tr>th,.shipment-track>thead>tr>td,.shipment-track>tbody>tr>td,.shipmen=t-track>tfoot>tr>td{padding:0 10px}.email-items th{text-align:left}.email-i=tems>tbody>tr>th,.email-items>tfoot>tr>th,.email-items>tbody>tr>td,.email-i=tems>tfoot>tr>td{vertical-align:top}.email-items>thead>tr>th,.email-items>t=head>tr>td{vertical-align:bottom}.email-items>thead>tr>th,.email-items>tbod=y>tr>th,.email-items>tfoot>tr>th,.email-items>thead>tr>td,.email-items>tbod=y>tr>td,.email-items>tfoot>tr>td{padding:0 10px}@media only screen and (max=-width:639px){html,body{background-color:#fff;width:100% !important}.main{m=ax-width:100% !important;min-width:240px;width:auto !important}.rma-items t=d,.rma-items th{font-size:12px !important;padding:5px !important}}@media on=ly screen and (max-width:479px){.header,.main-content,.footer{padding:25px =10px !important}.footer td{display:block;width:auto !important}.email-featu=res>tbody>tr>td{clear:both;display:block;padding-top:20px;width:auto !impor=tant}.email-summary h1{font-size:24px !important}.order-details .address-de=tails,.order-details .method-info{display:block;padding:10px 0 !important;w=idth:auto !important}.order-details .address-details h3,.order-details .met=hod-info h3{margin-bottom:5px !important;margin-top:0 !important}.button .i=nner-wrapper{width:100% !important}.button .inner-wrapper td a{font-size:16=px}}body,table,td,a{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%=}img{-ms-interpolation-mode:bicubic}table,td{mso-table-lspace:0pt;mso-table=-rspace:0pt}a:visited{color:#006bb4 !important;text-decoration:none !import=ant}a:hover{color:#006bb4 !important;text-decoration:underline !important}a=:active{color:#ff5501 !important;text-decoration:underline !important}.no-l=ink a,.address-details a{color:#333 !important;cursor:default !important;te=xt-decoration:none !important}.button .inner-wrapper td:hover{background-co=lor:#006bb4 !important}.button .inner-wrapper a:active,.button .inner-wrapp=er td:active{background-color:#006bb4 !important}.button a:active,.button a=:hover,.button a:visited{border:1px solid #006bb4;color:#fff !important;tex=t-decoration:none !important}.email-items{overflow-x:auto;overflow-y:hidden=;width:100%;-ms-overflow-style:-ms-autohiding-scrollbar;-webkit-overflow-sc=rolling:touch}    </style><style type=3D\"text/css\">@import url(\"https://www.rczbikeshop.com/static/ve=rsion1765785498/frontend/Rcz/default/fr_FR/css/email-fonts.css\");a:visited{=color: #006bb4; text-decoration: none;}a:hover{color: #006bb4; text-decorat=ion: underline;}a:active{color: #ff5501; text-decoration: underline;}</styl=e></head><body style=3D'margin: 0; padding: 0; color: #333; font-style: normal; line=-height: 1.42857143; font-size: 14px; font-family: \"Open Sans\",\"Helvetica N=eue\",Helvetica,Arial,sans-serif; font-weight: normal; text-align: left; bac=kground-color: #f5f5f5;'><!-- Begin wrapper table --><table class=3D\"wrapper\" width=3D\"100%\" style=3D\"border-collapse: collapse;= margin: 0 auto;\">    <tr>        <td class=3D\"wrapper-inner\" align=3D\"center\" style=3D'font-family: =\"Open Sans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: to=p; padding-bottom: 30px; width: 100%;'>            <table class=3D\"main\" align=3D\"center\" style=3D\"border-collapse=: collapse; margin: 0 auto; text-align: left; width: 660px;\">                <tr>                    <td class=3D\"header\" style=3D'font-family: \"Open Sans\",=\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; backgroun=d-color: #f5f5f5; padding: 25px;'>                        <a class=3D\"logo\" href=3D\"https://www.rczbikeshop.c=om/fr/\" style=3D\"color: #006bb4; text-decoration: none;\">                            <img width=3D\"180\" src=3D\"https://www.rczbikesh=op.com/media/email/logo/default/logo.png\" alt=3D\"RCZ Bike Shop\" border=3D\"0=\" style=3D\"border: 0; height: auto; line-height: 100%; outline: none; text-=decoration: none;\">                        </a>                    </td>                </tr>                <tr>                    <td class=3D\"main-content\" style=3D'font-family: \"Open =Sans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; bac=kground-color: #fff; padding: 25px;'>                    <!-- Begin Content --><table style=3D\"border-collapse: collapse;\">    <tr class=3D\"email-intro\">        <td style=3D'font-family: \"Open Sans\",\"Helvetica Neue\",Helvetica,Ar=ial,sans-serif; vertical-align: top; padding-bottom: 20px;'>            <p class=3D\"greeting\" style=3D\"margin-top: 0; margin-bottom: 10=px;\">thibault brun,</p>            <p style=3D\"margin-top: 0; margin-bottom: 10px;\">                Merci pour votre commande chez RCZ Bike Shop.                Vous pouvez v=C3=A9rifier l'=C3=A9tat de votre commande en =<a href=3D\"https://www.rczbikeshop.com/fr/customer/account/\" style=3D\"color=: #006bb4; text-decoration: none;\"> vous connectant =C3=A0 votre compte</a>=.                Nous vous informons que le paiement de votre commande a =C3==A9t=C3=A9 enregistr=C3=A9.<br><br>                Vous trouverez ci-jointe la facture.<br><br>                Votre commande est actuellement en cours de pr=C3=A9paratio=n.<br><br>                Lorsque votre colis sera exp=C3=A9di=C3=A9, le num=C3=A9ro =de suivi vous sera envoy=C3=A9 par E-mail et sera =C3=A9galement disponible= dans votre compte client.<br><br>                <strong style=3D\"font-weight: 700;\">Nous vous invitons =C3==A0 lire ce mail jusqu'au bout car ceci contient des informations tr=C3=A8s= importantes relatives =C3=A0 votre commande.                    Toutes les =C3=A9tapes du suivi de votre commande y son=t ainsi d=C3=A9taill=C3=A9es.</strong><br><br>            </p>            <p style=3D\"margin-top: 0; margin-bottom: 10px;\">                Si vous avez des questions concernant votre commande, vous =pouvez nous envoyer un email =C3=A0 <a href=3D\"mailto:info@rczbikeshop.com\"= style=3D\"color: #006bb4; text-decoration: none;\"> info@rczbikeshop.com</a>=.            </p>        </td>    </tr>    <tr class=3D\"email-summary\">        <td style=3D'font-family: \"Open Sans\",\"Helvetica Neue\",Helvetica,Ar=ial,sans-serif; vertical-align: top;'>            <h1 style=3D\"font-weight: 300; line-height: 1.1; font-size: 26p=x; margin-top: 0; border-bottom: 1px solid #ccc; margin-bottom: 10px; paddi=ng-bottom: 10px;\">Votre facture #31000104048 pour la commande #31000133592<=/h1>        </td>    </tr>    <tr class=3D\"email-information\">        <td style=3D'font-family: \"Open Sans\",\"Helvetica Neue\",Helvetica,Ar=ial,sans-serif; vertical-align: top;'>           =20            <table class=3D\"order-details\" style=3D\"border-collapse: collap=se; width: 100%;\">                <tr>                    <td class=3D\"address-details\" style=3D'font-family: \"Op=en Sans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; =padding: 10px 10px 10px 0; width: 50%;'>                        <h3 style=3D\"font-weight: 300; line-height: 1.1; fo=nt-size: 18px; margin-bottom: 10px; margin-top: 0;\">Informations de factura=tion</h3>                        <p style=3D\"margin-top: 0; margin-bottom: 10px;\">thibault brun<br>19 rue capitaine pellot<br>64100 Bayonne, <br>France<br>T: 0786624417</p>                    </td>                   =20                    <td class=3D\"address-details\" style=3D'font-family: \"Op=en Sans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; =padding: 10px 10px 10px 0; width: 50%;'>                        <h3 style=3D\"font-weight: 300; line-height: 1.1; fo=nt-size: 18px; margin-bottom: 10px; margin-top: 0;\">Shipping Info</h3>                        <p style=3D\"margin-top: 0; margin-bottom: 10px;\">thibault brun<br>locker 24/7 halles bon marche b<br>11 AVENUE DU MARECHAL JUIN<br>64100 BAYONNE, <br>France<br>T: 0786624417</p>                    </td>                   =20                </tr>                <tr>                    <td class=3D\"method-info\" style=3D'font-family: \"Open S=ans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; padd=ing: 10px 10px 10px 0; width: 50%;'>                        <h3 style=3D\"font-weight: 300; line-height: 1.1; fo=nt-size: 18px; margin-bottom: 10px; margin-top: 0;\">Mode de paiement</h3>                        <dl class=3D\"payment-method saferpay-custom\" style==3D\"margin-top: 0; margin-bottom: 10px;\">    <dt class=3D\"title\" style=3D\"margin-bottom: 5px; margin-top: 0; font-we=ight: 400;\">                    <div class=3D\"field payment-image\">                                                    <img src=3D\"https://www=.saferpay.com/static/logo/visa.svg?v=3D638990470119026828\" alt=3D\"Ic=C3=B4n=e\" style=3D\"border: 0; height: auto; line-height: 100%; outline: none; text=-decoration: none; max-height: 35px; width: auto;\">                                    <img src=3D\"https://www.saferpay.com/st=atic/logo/mastercard.svg?v=3D638990470119026828\" alt=3D\"Ic=C3=B4ne\" style==3D\"border: 0; height: auto; line-height: 100%; outline: none; text-decorat=ion: none; max-height: 35px; width: auto;\">                                    <img src=3D\"https://www.saferpay.com/st=atic/logo/maestro.svg?v=3D638990470119026828\" alt=3D\"Ic=C3=B4ne\" style=3D\"b=order: 0; height: auto; line-height: 100%; outline: none; text-decoration: =none; max-height: 35px; width: auto;\">                                    <img src=3D\"https://test.saferpay.com/s=tatic/logo/amex.svg?v=3D638658086945264800\" alt=3D\"Ic=C3=B4ne\" style=3D\"bor=der: 0; height: auto; line-height: 100%; outline: none; text-decoration: no=ne; max-height: 35px; width: auto;\">                                    <img src=3D\"https://test.saferpay.com/s=tatic/logo/diners.svg?v=3D638658086945264800\" alt=3D\"Ic=C3=B4ne\" style=3D\"b=order: 0; height: auto; line-height: 100%; outline: none; text-decoration: =none; max-height: 35px; width: auto;\">                                    <img src=3D\"https://test.saferpay.com/s=tatic/logo/bancontact.svg?v=3D638658086945264800\" alt=3D\"Ic=C3=B4ne\" style==3D\"border: 0; height: auto; line-height: 100%; outline: none; text-decorat=ion: none; max-height: 35px; width: auto;\">                                    <img src=3D\"https://test.saferpay.com/s=tatic/logo/jcb.svg?v=3D638658086945264800\" alt=3D\"Ic=C3=B4ne\" style=3D\"bord=er: 0; height: auto; line-height: 100%; outline: none; text-decoration: non=e; max-height: 35px; width: auto;\">                            </div>                <p style=3D\"margin-top: 0; margin-bottom: 10px;\">Creditcard=/Deditcard</p>    </dt>    <dd class=3D\"content\" style=3D\"margin-bottom: 10px; margin-top: 0; marg=in-left: 0;\">                    <h4 style=3D\"font-weight: 700; line-height: 1.1; font-s=ize: 14px; margin-top: 20px; margin-bottom: 20px;\">Payment Id </h4>            <p style=3D\"margin-top: 0; margin-bottom: 10px;\">vh6td0b3xb3tSA=42A8znb2jMx9SA</p>            </dd></dl>                    </td>                   =20                    <td class=3D\"method-info\" style=3D'font-family: \"Open S=ans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; padd=ing: 10px 10px 10px 0; width: 50%;'>                        <h3 style=3D\"font-weight: 300; line-height: 1.1; fo=nt-size: 18px; margin-bottom: 10px; margin-top: 0;\">Mode de livraison</h3>                        <p style=3D\"margin-top: 0; margin-bottom: 10px;\">Mo=ndial Relay - Livraison dans le Point Relais de votre choix</p>                    </td>                   =20                </tr>            </table>                <table class=3D\"email-items\" style=3D\"width: 100%; border-c=ollapse: collapse; border-spacing: 0; max-width: 100%;\">        <thead>            <tr>                <th class=3D\"item-info\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; text-align: left; vertical-alig=n: bottom; padding: 10px;'>                    Articles                </th>                <th class=3D\"item-qty\" style=3D'font-family: \"Open Sans\",\"H=elvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: bottom; padding:= 10px; text-align: center;'>                    Qt=C3=A9                </th>                <th class=3D\"item-subtotal\" style=3D'font-family: \"Open San=s\",\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: bottom; pad=ding: 10px; text-align: right;'>                    Sous-total                </th>            </tr>        </thead>                                    <tbody>                    <tr>    <td class=3D\"item-info\" style=3D'font-family: \"Open Sans\",\"Helvetica Ne=ue\",Helvetica,Arial,sans-serif; vertical-align: top; padding: 10px; border-=top: 1px solid #ccc;'>        <p class=3D\"product-name\" style=3D\"margin-top: 0; font-weight: 700;= margin-bottom: 5px;\">SHIMANO Frein =C3=A0 Disque AVANT XT BL-T8100/ BR-M81=20 160mm PM w/o disc (L.1000mm) (KM81201JLF9RX100)</p>        <p class=3D\"sku\" style=3D\"margin-top: 0; margin-bottom: 0;\">REF: SH=IMANO-800003131-KTL2</p>                                                        </td>    <td class=3D\"item-qty\" style=3D'font-family: \"Open Sans\",\"Helvetica Neu=e\",Helvetica,Arial,sans-serif; vertical-align: top; padding: 10px; border-t=op: 1px solid #ccc; text-align: center;'>1</td>    <td class=3D\"item-price\" style=3D'font-family: \"Open Sans\",\"Helvetica N=eue\",Helvetica,Arial,sans-serif; vertical-align: top; padding: 10px; border=-top: 1px solid #ccc; text-align: right;'>       =20        <span class=3D\"price\">39,99=C2=A0=E2=82=AC</span>        </td></tr>                </tbody>                            <tfoot class=3D\"order-totals\">                    <tr class=3D\"subtotal\">        <th colspan=3D\"2\" scope=3D\"row\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background=-color: #f5f5f5; font-weight: 400; padding: 10px; text-align: right;'>                            Sous-total                    </th>        <td data-th=3D\"Sous-total\" style=3D'font-family: \"Open Sans\",\"Helve=tica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-colo=r: #f5f5f5; padding: 10px; text-align: right;'>                            <span class=3D\"price\" style=3D\"white-space: now=rap;\">39,99=C2=A0=E2=82=AC</span>                    </td>    </tr>            <tr class=3D\"discount\">        <th colspan=3D\"2\" scope=3D\"row\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background=-color: #f5f5f5; font-weight: 400; padding: 10px; text-align: right; paddin=g-top: 0;'>                            Remise (RCZG20)                    </th>        <td data-th=3D\"Remise (RCZG20)\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background=-color: #f5f5f5; padding: 10px; text-align: right; padding-top: 0;'>                            <span class=3D\"price\" style=3D\"white-space: now=rap;\">-8,00=C2=A0=E2=82=AC</span>                    </td>    </tr>               =20                                <tr class=3D\"totals tax details details-1\">                <td colspan=3D\"2\" style=3D'font-family: \"Open Sans\",\"Helvet=ica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-color=: #f5f5f5; padding: 10px; text-align: right; padding-top: 0;'>                    TVA                                            (20%)                                        <br>                </td>                <td rowspan=3D\"1\" style=3D'font-family: \"Open Sans\",\"Helvet=ica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-color=: #f5f5f5; padding: 10px; text-align: right; padding-top: 0;'>                    <span class=3D\"price\" style=3D\"white-space: nowrap;\">7,=25=C2=A0=E2=82=AC</span>                </td>            </tr>       =20<tr class=3D\"totals-tax-summary\">    <th colspan=3D\"2\" scope=3D\"row\" style=3D'font-family: \"Open Sans\",\"Helv=etica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-col=or: #f5f5f5; font-weight: 400; padding: 10px; text-align: right; padding-to=p: 0;'>                    <div class=3D\"detailed\">TVA</div>            </th>    <td data-th=3D\"TVA\" style=3D'font-family: \"Open Sans\",\"Helvetica Neue\",=Helvetica,Arial,sans-serif; vertical-align: top; background-color: #f5f5f5;= padding: 10px; text-align: right; padding-top: 0;'>        <span class=3D\"price\" style=3D\"white-space: nowrap;\">7,25=C2=A0=E2==82=AC</span>    </td></tr>            <tr class=3D\"shipping\">        <th colspan=3D\"2\" scope=3D\"row\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background=-color: #f5f5f5; font-weight: 400; padding: 10px; text-align: right; paddin=g-top: 0;'>                            Frais de port                    </th>        <td data-th=3D\"Frais de port\" style=3D'font-family: \"Open Sans\",\"He=lvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-c=olor: #f5f5f5; padding: 10px; text-align: right; padding-top: 0;'>                            <span class=3D\"price\" style=3D\"white-space: now=rap;\">11,50=C2=A0=E2=82=AC</span>                    </td>    </tr>            <tr class=3D\"grand_total\">        <th colspan=3D\"2\" scope=3D\"row\" style=3D'font-family: \"Open Sans\",\"=Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background=-color: #f5f5f5; font-weight: 400; padding: 10px; text-align: right; paddin=g-top: 0;'>                            <strong style=3D\"font-weight: 700;\">Montant glo=bal</strong>                    </th>        <td data-th=3D\"Montant global\" style=3D'font-family: \"Open Sans\",\"H=elvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; background-=color: #f5f5f5; padding: 10px; text-align: right; padding-top: 0;'>                            <strong style=3D\"font-weight: 700;\"><span class==3D\"price\" style=3D\"white-space: nowrap;\">43,49=C2=A0=E2=82=AC</span></stro=ng>                    </td>    </tr>            </tfoot>    </table>        </td>    </tr>    <tr>        <td style=3D'font-family: \"Open Sans\",\"Helvetica Neue\",Helvetica,Ar=ial,sans-serif; vertical-align: top;'>            _______________________________________________________________=________________________________________<br><br><br>            <ul style=3D\"margin-top: 0; margin-bottom: 25px;\"><li style=3D\"=margin-top: 0; margin-bottom: 10px;\"><strong style=3D\"font-weight: 700;\">J==E2=80=99ai valid=C3=A9 et pay=C3=A9 ma commande et  je r=C3=A9alise avoir =fait une erreur dans cette dite commande.  Est-ce que je peux la modifier ?=</strong><br><br></li>                Si vous avez valid=C3=A9 et r=C3=A9alis=C3=A9 le paiement d=e votre commande, notre service re=C3=A7oit votre bon de commande d=C3=A9j==C3=A0 encod=C3=A9.<br>                Nous ne sommes malheureusement pas en mesure d=E2=80=99inte=rvenir et faire une modification sur un document d=C3=A9j=C3=A0 encod=C3=A9=.<br>                Nous vous invitons =C3=A0 bien v=C3=A9rifier votre commande= avant de proc=C3=A9der =C3=A0 sa validation.<br><br>                <li style=3D\"margin-top: 0; margin-bottom: 10px;\"><strong s=tyle=3D\"font-weight: 700;\">J=E2=80=99ai valid=C3=A9 et pay=C3=A9 ma command=e et  je r=C3=A9alise avoir fait une erreur dans cette dite commande.  Est-=ce que je peux l=E2=80=99annuler?</strong><br><br></li>                Apr=C3=A8s la validation et le paiement de votre commande, = nous proc=C3=A9dons =C3=A0 l=E2=80=99=C3=A9tablissement de votre facture. =Une commande factur=C3=A9e signifie que votre paiement a =C3=A9t=C3=A9 enre=gistr=C3=A9 et que votre commande est en cours de pr=C3=A9paration.<br>                Malheureusement,  une annulation perturbera fortement notre= organisation et ne sera donc pas recevable.<br>                Nous vous invitons =C3=A0 bien v=C3=A9rifier votre commande= avant de proc=C3=A9der =C3=A0 sa validation.<br><br>                <li style=3D\"margin-top: 0; margin-bottom: 10px;\"><strong s=tyle=3D\"font-weight: 700;\">J=E2=80=99ai valid=C3=A9 et pay=C3=A9 ma command=e et  j=E2=80=99ai oubli=C3=A9 de mettre mon code de remise.  Est-ce que vo=us pourrez l=E2=80=99appliquer ou je peux demander le remboursement de la r=emise?</strong><br><br></li>                Si vous avez valid=C3=A9 et r=C3=A9alis=C3=A9 le paiement d=e votre commande, notre service re=C3=A7oit votre bon de commande d=C3=A9j==C3=A0 encod=C3=A9.<br>                De plus, par soucis de transparence, seul le client a la po=ssibilit=C3=A9 d=E2=80=99appliquer le code de remise.<br>                Nous ne sommes malheureusement pas en mesure d=E2=80=99inte=rvenir et faire une modification sur un document d=C3=A9j=C3=A0 encod=C3=A9=.<br>                Nous vous invitons =C3=A0 bien v=C3=A9rifier votre commande= avant de proc=C3=A9der =C3=A0 sa validation.<br><br><br>                Service Client=C3=A8le RCZ<br><br>            </ul>        </td>    </tr></table><!-- End Content -->                    </td>                </tr>                <tr>                    <td class=3D\"footer\" style=3D'font-family: \"Open Sans\",=\"Helvetica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; backgroun=d-color: #f5f5f5; padding: 25px;'>                        <table style=3D\"border-collapse: collapse; width: 1=00%;\">                            <tr>                                <td style=3D'font-family: \"Open Sans\",\"Helv=etica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; padding-bottom=: 25px; width: 33%;'>                                   =20                                   =20                                </td>                                <td style=3D'font-family: \"Open Sans\",\"Helv=etica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; padding-bottom=: 25px; width: 33%;'>                                   =20                                   =20                                </td>                                <td style=3D'font-family: \"Open Sans\",\"Helv=etica Neue\",Helvetica,Arial,sans-serif; vertical-align: top; padding-bottom=: 25px; width: 33%;'>                                    <p class=3D\"address\" style=3D\"margin-to=p: 0; margin-bottom: 0;\">                                        RCZ Bike Shop<br><br>  <br>                                    </p>                                </td>                            </tr>                        </table>                    </td>                </tr>            </table>        </td>    </tr></table><!-- End wrapper table --></body></html>"; // ou récup depuis GmailApp
  var data = parseRczOrderEmail(raw);
  Logger.log(JSON.stringify(data, null, 2));
}
