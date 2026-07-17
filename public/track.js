// Cart + checkout-abandonment tracking pixel — paste into the theme's
// theme.liquid (or a snippet included on every page):
//
//   <script src="https://<this-app-domain>/track.js" data-email="{{ customer.email }}" async></script>
//
// Only tracks when data-email is present, i.e. a logged-in Shopify
// customer — anonymous/guest cart activity isn't tracked in this pass
// (see DEPLOYMENT.md). Reads Shopify's own /cart.js AJAX endpoint (no
// theme-specific markup assumptions) and posts to this deployment's own
// /api/track/* routes — same origin as this script, so no config needed
// on the snippet itself beyond the script tag.
(function () {
  var scriptEl = document.currentScript;
  var email = scriptEl && scriptEl.getAttribute('data-email');
  if (!email) return;

  var API_BASE = new URL(scriptEl.src).origin;

  function post(path, body) {
    var url = API_BASE + path;
    var payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
    }
  }

  function reportCart() {
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        post('/api/track/cart', { email: email, cartValue: cart.total_price / 100, itemCount: cart.item_count });
      })
      .catch(function () {});
  }

  // Fires once on load (covers a returning visitor with an existing
  // cart) and again after any add-to-cart form submits on the page.
  reportCart();
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.action && form.action.indexOf('/cart/add') !== -1) {
      setTimeout(reportCart, 400);
    }
  });

  // "Checkout started" fires on click, before the browser navigates away
  // to Shopify's own checkout domain — we can't run script on that page
  // itself under Checkout Extensibility, so this is the last moment this
  // pixel can observe checkout intent. Actual conversion is confirmed
  // separately via the orders/create Shopify webhook.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a[href*="/checkout"], button[name="checkout"], input[name="checkout"]');
    if (!el) return;
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        post('/api/track/checkout-started', { email: email, cartValue: cart.total_price / 100 });
      })
      .catch(function () {});
  });
})();
