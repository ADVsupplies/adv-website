/* ADV helpful prompts — small slide-in cards that only appear when they fit what the customer is doing.
   Rules: never on the first page of a visit, at most ONE card per visit, never over the product popup / cart / checkout,
   "No thanks" hides that card for 14 days, giving details hides it for good. */
(function () {
  "use strict";
  if (window.__advNudge) return;
  window.__advNudge = 1;

  var DAY = 864e5, NOW = Date.now();
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem("adv_n_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("adv_n_" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var ss = {
    get: function (k, d) { try { var v = sessionStorage.getItem("adv_n_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { sessionStorage.setItem("adv_n_" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function cart() { try { return JSON.parse(localStorage.getItem("adv_cart") || "[]") || []; } catch (e) { return []; } }
  function checkout() { try { return JSON.parse(localStorage.getItem("adv_checkout") || "{}") || {}; } catch (e) { return {}; } }

  // Page views this visit
  var views = ss.get("views", 0) + 1; ss.set("views", views);
  if (/thanks\.html/.test(location.pathname)) return;

  function blocked(id) {
    if (ss.get("shown", false)) return true;               // one card per visit
    if (ls.get("done", false)) return true;                // already gave details
    var snooze = ls.get("snooze_" + id, 0);
    return snooze && NOW < snooze;
  }
  function busy() {
    var m = document.getElementById("modal"), d = document.getElementById("drawer"), c = document.querySelector(".advc");
    return (m && !m.hidden) || (d && !d.hidden) || (c && !c.hidden);
  }

  /* ---------- the card ---------- */
  var css =
    ".advn{position:fixed;left:20px;bottom:20px;z-index:89;width:360px;max-width:calc(100vw - 110px);background:#fff;color:#1A1A1A;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.25);border-top:6px solid #C80000;font-family:Barlow,system-ui,sans-serif;transform:translateY(130%);transition:transform .35s ease}" +
    ".advn.on{transform:none}.advn-in{padding:16px 18px 16px}" +
    ".advn h4{margin:0 26px 6px 0;font:800 21px/1.1 'Barlow Condensed',Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em}" +
    ".advn p{margin:0 0 10px;font-size:14.5px;line-height:1.45;color:#333}" +
    ".advn .x{position:absolute;top:8px;right:8px;background:none;border:0;font-size:24px;line-height:1;cursor:pointer;color:#777;padding:4px 8px}" +
    ".advn ul{margin:0 0 10px;padding:0 0 0 18px;font-size:14px;color:#333;max-height:96px;overflow:auto}" +
    ".advn input{width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #D9D0CA;border-radius:8px;font-size:15px;margin:0 0 8px}" +
    ".advn input:focus{outline:none;border-color:#C80000}" +
    ".advn .row{display:flex;gap:8px}.advn .row input{flex:1;min-width:0}" +
    ".advn .go{display:inline-block;border:0;border-radius:999px;background:#C80000;color:#fff;padding:11px 18px;font:600 14px 'Barlow Semi Condensed',Barlow,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none}" +
    ".advn .go.alt{background:#1A1A1A}.advn .go:disabled{opacity:.6}" +
    ".advn .btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
    ".advn .no{background:none;border:0;color:#777;font-size:13px;text-decoration:underline;cursor:pointer;padding:6px}" +
    ".advn .small{font-size:12px;color:#888;margin:8px 0 0}.advn .msg{color:#B00000;font-weight:700;font-size:13.5px}" +
    "@media(max-width:520px){.advn{left:10px;right:10px;bottom:84px;width:auto;max-width:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var card = null;
  function show(id, html, wire) {
    if (card || blocked(id) || busy()) return false;
    ss.set("shown", true);
    card = document.createElement("div");
    card.className = "advn"; card.setAttribute("role", "dialog"); card.setAttribute("aria-live", "polite");
    card.innerHTML = '<button class="x" aria-label="Close">×</button><div class="advn-in">' + html + "</div>";
    document.body.appendChild(card);
    requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("on"); }); });
    function close(snoozeDays) {
      if (snoozeDays) ls.set("snooze_" + id, Date.now() + snoozeDays * DAY);
      card.classList.remove("on"); var c = card; setTimeout(function () { c.remove(); }, 400); card = null;
    }
    card.querySelector(".x").onclick = function () { close(14); };
    var no = card.querySelector(".no"); if (no) no.onclick = function () { close(14); };
    if (wire) wire(card, close);
    return true;
  }

  function post(body) {
    return fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); })
      .catch(function () { return { status: 0 }; });
  }
  function netlifyCopy(name, fields) {
    var p = new URLSearchParams(); p.append("form-name", name);
    Object.keys(fields).forEach(function (k) { p.append(k, fields[k] == null ? "" : fields[k]); });
    return fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() }).catch(function () {});
  }

  /* ---------- cart summary (names from the live catalogue) ---------- */
  var CAT = null;
  function catalog() {
    if (CAT) return Promise.resolve(CAT);
    return fetch("/api/catalog").then(function (r) { return r.json(); }).then(function (d) { CAT = d; return d; }).catch(function () { return null; });
  }
  function cartLines(cat) {
    var by = {}; ((cat && cat.products) || []).forEach(function (p) { by[p.id] = p; });
    return cart().map(function (l) {
      var p = by[l.id]; if (!p) return null;
      if (p.bulk) return { text: p.name + " x " + (+l.qty) + " m³", m3: +l.qty, bulk: true };
      var v = (p.variations || []).filter(function (x) { return x.id === l.variationId; })[0];
      return { text: p.name + (v && v.name ? " (" + v.name + ")" : "") + " x " + l.qty, m3: 0, bulk: false };
    }).filter(Boolean);
  }

  /* ===== 1. Save my quote — they have things in the cart but haven't paid ===== */
  function quoteCard() {
    if (!cart().length) return;
    catalog().then(function (cat) {
      var lines = cartLines(cat); if (!lines.length) return;
      var co = checkout(), sub = co.suburb || "";
      show("quote",
        "<h4>Want us to hold this quote?</h4>" +
        "<p>Leave your details and the team will send you this quote" + (sub ? " for delivery to <b>" + esc(sub) + "</b>" : "") + ", or call you to sort out the order.</p>" +
        "<ul>" + lines.map(function (l) { return "<li>" + esc(l.text) + "</li>"; }).join("") + "</ul>" +
        '<form><div class="row"><input name="name" placeholder="First name" autocomplete="given-name" required><input name="phone" type="tel" placeholder="Mobile" autocomplete="tel"></div>' +
        '<input name="email" type="email" placeholder="Email" autocomplete="email" required>' +
        '<p class="msg" hidden></p><div class="btns"><button class="go" type="submit">Send me the quote</button><button class="no" type="button">No thanks</button></div>' +
        '<p class="small">We\'ll only use this for your quote. Call (03) 9799 6399 anytime.</p></form>',
        function (el, close) {
          var f = el.querySelector("form"), msg = el.querySelector(".msg");
          f.onsubmit = function (e) {
            e.preventDefault();
            var b = f.querySelector(".go"); b.disabled = true; b.textContent = "Sending…";
            var d = { kind: "quote", name: f.name.value, email: f.email.value, phone: f.phone.value, suburb: sub, mode: co.mode || "", items: lines.map(function (l) { return l.text; }).join("\n"), page: location.pathname };
            netlifyCopy("quote-request", d);
            post(d).then(function (r) {
              if (r.status === 400 && r.error) { msg.hidden = false; msg.textContent = r.error; b.disabled = false; b.textContent = "Send me the quote"; return; }
              ls.set("done", true);
              el.querySelector(".advn-in").innerHTML = "<h4>Got it, thanks!</h4><p>The team will be in touch with your quote. Your cart is saved on this device too.</p>";
              setTimeout(function () { close(0); }, 4500);
            });
          };
        });
    });
  }

  /* ===== 2. How much do I need? — looked at several bulk products without adding any ===== */
  function helpCard() {
    show("help",
      "<h4>Not sure how much you need?</h4>" +
      "<p>Tell us the area and depth and we'll work out the cubic metres for you.</p>" +
      '<div class="btns"><a class="go" href="/#calculator">Use the calculator</a><button class="go alt" type="button" data-ask>Ask ADV Assist</button><button class="no" type="button">No thanks</button></div>',
      function (el, close) {
        el.querySelector("[data-ask]").onclick = function () {
          close(0);
          var btn = document.querySelector(".advc-btn"); if (btn) btn.click();
          setTimeout(function () {
            var ta = document.querySelector(".advc textarea");
            if (ta && !ta.value) { ta.value = "How much do I need for an area of "; ta.focus(); }
          }, 150);
        };
      });
  }

  /* ===== 3. Trade account — a big order or a tradie-sized cart ===== */
  function tradeCard(m3) {
    if (/trade\.html/.test(location.pathname)) return;
    show("trade",
      "<h4>Ordering for a job?</h4>" +
      "<p>" + (m3 ? "That's " + m3 + " m³ in your cart. " : "") + "Landscapers, builders and other trades get <b>trade prices</b> with an ADV Trade account. It takes a minute to apply.</p>" +
      '<div class="btns"><a class="go" href="/trade.html#apply">Apply for trade prices</a><button class="no" type="button">No thanks</button></div>');
  }

  /* ---------- triggers ---------- */
  var firstPage = views < 2;

  // Watch the product popup: count bulk products looked at without adding anything
  var modal = document.getElementById("modal");
  if (modal && "MutationObserver" in window) {
    var wasOpen = false;
    new MutationObserver(function () {
      var open = !modal.hidden;
      if (open && !wasOpen) {
        var price = (document.getElementById("mPrice") || {}).textContent || "";
        if (/m³|m3/i.test(price)) ss.set("bulkViews", ss.get("bulkViews", 0) + 1);
      }
      if (!open && wasOpen) setTimeout(check, 1200);   // popup just closed: good moment
      wasOpen = open;
    }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }
  var drawer = document.getElementById("drawer");
  if (drawer && "MutationObserver" in window) {
    var dWas = false;
    new MutationObserver(function () {
      var open = !drawer.hidden;
      if (open) ss.set("cartOpened", true);
      if (!open && dWas) setTimeout(check, 1500);
      dWas = open;
    }).observe(drawer, { attributes: true, attributeFilter: ["hidden"] });
  }

  function bulkInCart() {
    return catalog().then(function (cat) {
      var l = cartLines(cat), m3 = 0, n = 0;
      l.forEach(function (x) { if (x.bulk) { m3 += x.m3; n++; } });
      return { m3: Math.round(m3 * 100) / 100, n: n };
    });
  }

  function check() {
    if (card || ss.get("shown", false) || busy()) return;
    if (firstPage) return;
    var items = cart().length;
    if (items) {
      bulkInCart().then(function (b) {
        if (b.m3 >= 6 || b.n >= 3) tradeCard(b.m3);
      });
      return;
    }
    if (ss.get("bulkViews", 0) >= 3) helpCard();
  }

  // Leaving with a cart: desktop exit intent, or idle on a later page
  if (!firstPage) {
    document.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget && e.clientY <= 0 && cart().length) quoteCard();
    });
    var idle; function reset() { clearTimeout(idle); idle = setTimeout(function () { if (cart().length) quoteCard(); }, 60000); }
    ["scroll", "keydown", "pointerdown", "touchstart"].forEach(function (ev) { addEventListener(ev, reset, { passive: true }); });
    reset();
    setTimeout(check, 8000);
  }
})();
