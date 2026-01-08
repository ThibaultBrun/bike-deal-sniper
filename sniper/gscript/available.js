/**
 * Retourne true si le bouton "Add to Cart" est présent sur la page RCZ
 */
function rczIsAddToCartPresent(url) {
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (res.getResponseCode() !== 200) {
    return false;
  }

  const html = res.getContentText();

  return html.includes('id="product-addtocart-button"');
}

function testRczAvailability() {
  let url = "https://www.rczbikeshop.com/default/x-fusion-rear-shock-02pro-r-210x55mm-grey-104-23301.html";
  let isAvailable = rczIsAddToCartPresent(url);

  console.log(isAvailable); // true ou false

    url = "https://www.rczbikeshop.com/default/x-fusion-rear-shock-02pro-r-210x47-5mm-grey-104-23300.html";
  isAvailable = rczIsAddToCartPresent(url);

  console.log(isAvailable); // true ou false

}


function updateAvailableProducts() {
  const PRODUCTS = SUPABASE.getActiveAvailableProducts();

  Logger.log(`🔄 Checking ${PRODUCTS.length} products`);

  PRODUCTS.forEach(p => {
    try {
      const isAvailable = rczIsAddToCartPresent(p.url);

      if (!isAvailable) {
        Logger.log(`🚫 Not available anymore: ${p.id}`);
        SUPABASE.updateProductAvailableFlag(p.id, false);
      } else {
        Logger.log(`✅ Still available: ${p.id}`);
      }

      Utilities.sleep(800); // évite de spammer RCZ

    } catch (e) {
      Logger.log(`❌ Error on ${p.id}: ${e.message}`);
    }
  });
}



