(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (c) { return "$" + (c / 100).toFixed(2).replace(/\.00$/, ""); };
  var money2 = function (c) { return "$" + (c / 100).toFixed(2); };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var fmtM3 = function (q) { return (+q).toFixed(2).replace(/\.?0+$/, "") + " m³"; };

  var DATA = null, BYID = {}, ZONES = {};
  var S = { cat: "All", q: "", shown: 48 };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("adv_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("adv_" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var cart = store.get("cart", []);
  var co = store.get("checkout", { mode: "delivery", suburb: "", contact: {}, address: {}, date: "", notes: "" });
  var step = "cart";

  function save() { store.set("cart", cart); store.set("checkout", co); $("#cartCount").textContent = cart.length; }

  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- suburbs ---------- */
  function findSuburb(name) { var k = String(name || "").trim().toLowerCase(); return DATA.suburbs.filter(function (s) { return s.s.toLowerCase() === k; })[0] || null; }
  function matchSuburbs(v) {
    v = v.trim().toLowerCase(); if (v.length < 2) return [];
    var a = DATA.suburbs.filter(function (s) { return s.s.toLowerCase().indexOf(v) === 0 || s.pc.indexOf(v) === 0; });
    var b = DATA.suburbs.filter(function (s) { return s.s.toLowerCase().indexOf(v) > 0 && a.indexOf(s) < 0; });
    return a.concat(b).slice(0, 8);
  }
  function outsideMsg() {
    return '<div class="res no"><b>Outside our standard area</b>We don\'t have a set online rate for that suburb, but we can often still get a load to you. <a href="tel:0397996399">Call (03) 9799 6399</a> and we\'ll quote it.</div>';
  }
  function zoneMsg(s) {
    var z = ZONES[s.z];
    return '<div class="res ok"><b>Yes, we deliver to ' + esc(s.s) + '</b>Zone ' + s.z + (z ? ' · <span class="price">' + money(z.price) + ' per load</span>' : "") + "</div>";
  }
  // Generic autocomplete; onPick(suburb|null)
  function autocomplete(input, list, onPick) {
    var hits = [], ai = -1;
    function close() { list.style.display = "none"; ai = -1; }
    function pick(s) { input.value = s.s; close(); onPick(s); }
    input.addEventListener("input", function () {
      hits = matchSuburbs(input.value); ai = -1;
      if (!hits.length) { close(); onPick(input.value.trim().length > 3 ? null : undefined); return; }
      list.innerHTML = hits.map(function (s, i) { return '<div data-i="' + i + '">' + esc(s.s) + " " + s.pc + " <small>Zone " + s.z + "</small></div>"; }).join("");
      list.style.display = "block";
      var exact = findSuburb(input.value); onPick(exact || undefined);
    });
    list.addEventListener("mousedown", function (e) { var t = e.target.closest("[data-i]"); if (t) { e.preventDefault(); pick(hits[+t.dataset.i]); } });
    input.addEventListener("keydown", function (e) {
      if (list.style.display !== "block") return;
      var items = list.children;
      if (e.key === "ArrowDown") ai = Math.min(ai + 1, items.length - 1);
      else if (e.key === "ArrowUp") ai = Math.max(ai - 1, 0);
      else if (e.key === "Enter") { e.preventDefault(); pick(hits[ai < 0 ? 0 : ai]); return; }
      else if (e.key === "Escape") { close(); return; } else return;
      e.preventDefault();
      [].forEach.call(items, function (x, i) { x.classList.toggle("on", i === ai); });
    });
    input.addEventListener("blur", function () { setTimeout(function () { close(); var s = findSuburb(input.value); if (s) onPick(s); else if (input.value.trim().length > 3) onPick(null); }, 150); });
  }

  /* ---------- pricing ---------- */
  function bulkPrice(p, q) {
    q = r2(q);
    if (q < 1 && p.fractions && p.fractions[String(q)] != null) return p.fractions[String(q)];
    return Math.round(q * p.price);
  }
  function linePrice(l) {
    var p = BYID[l.id]; if (!p) return 0;
    if (p.bulk) return bulkPrice(p, l.qty);
    var v = p.variations.filter(function (x) { return x.id === l.variationId; })[0] || p.variations[0];
    return v.price * l.qty;
  }
  // Truck loads: same rules as the server (netlify/functions/lib/order.mjs loadsFor)
  function fitsTogether(x, y) {
    var hi = Math.max(x, y), lo = Math.min(x, y);
    return DATA.settings.fleet.some(function (t) { return t.splits.some(function (sp) { return hi <= sp[0] && lo <= sp[1]; }); });
  }
  function loadsFor(vols) {
    var v = vols.filter(function (x) { return x > 0; });
    if (!v.length) return 1;
    var maxSingle = Math.max.apply(null, DATA.settings.fleet.map(function (t) { return t.single; }));
    var n = 0, left = [];
    v.forEach(function (q) { n += Math.floor(q / maxSingle); var r = r2(q % maxSingle); if (r > 0) left.push(r); });
    left.sort(function (x, y) { return y - x; });
    if (left.length > 10) return n + left.length;
    function best(list) {
      if (!list.length) return 0;
      var first = list[0], rest = list.slice(1), m = 1 + best(rest);
      rest.forEach(function (q, j) { if (fitsTogether(first, q)) m = Math.min(m, 1 + best(rest.filter(function (_, i) { return i !== j; }))); });
      return m;
    }
    return n + best(left);
  }
  function bulkVols() { return cart.filter(function (l) { return BYID[l.id] && BYID[l.id].bulk; }).map(function (l) { return +l.qty; }); }
  function loads() { return loadsFor(bulkVols()); }
  function deliveryProblem() {
    if (co.mode !== "delivery") return null;
    var st = DATA.settings;
    var nz = cart.filter(function (l) { var p = BYID[l.id]; return p && !p.deliver; }).map(function (l) { return BYID[l.id].name; });
    if (nz.length) return "Pick up only: " + esc(nz.join(", ")) + ". We deliver bulk materials and timber sleepers. Remove " + (nz.length > 1 ? "these items" : "this item") + " or choose pick up.";
    var vols = bulkVols(), tot = vols.reduce(function (a, b) { return a + b; }, 0);
    if (vols.length && tot < st.minBulkForDelivery) return 'We deliver ' + st.minBulkForDelivery + ' m³ or more. For less, please <a href="tel:0397996399">call (03) 9799 6399</a> to organise a pick up.';
    if (loadsFor(vols) > st.maxLoads) return 'That order needs more than ' + st.maxLoads + ' truck loads. Please <a href="tel:0397996399">call us</a> and we\'ll organise it.';
    return null;
  }
  function deliveryFee() {
    if (co.mode !== "delivery") return 0;
    var s = findSuburb(co.suburb); if (!s || !ZONES[s.z]) return null;
    return ZONES[s.z].price * loads();
  }

  /* ---------- shop ---------- */
  function renderChips() {
    var cats = ["All"].concat(DATA.categories);
    $("#chips").innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === S.cat ? " on" : "") + '" data-c="' + esc(c) + '">' + esc(niceCat(c)) + "</button>";
    }).join("");
  }
  function niceCat(c) { return c === "All" ? "All products" : c.toLowerCase().replace(/(^|[\s\/&])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function filtered() {
    var q = S.q.toLowerCase();
    return DATA.products.filter(function (p) {
      return (S.cat === "All" || p.category === S.cat) && (!q || (p.name + " " + p.category).toLowerCase().indexOf(q) > -1);
    });
  }
  function renderGrid() {
    var list = filtered();
    var shown = list.slice(0, S.shown);
    $("#grid").innerHTML = shown.length ? shown.map(function (p) {
      var img = p.image ? '<div class="p-img" style="background-image:url(\'' + esc(p.image) + '\')">' : '<div class="p-img none">ADV';
      return '<button class="p" data-id="' + p.id + '">' + img + (p.out ? '<span class="p-tag out">Out of stock</span>' : p.bulk ? '<span class="p-tag">Bulk m³</span>' : !p.deliver ? '<span class="p-tag out">Pick up only</span>' : "") + "</div>" +
        '<div class="p-b"><div class="p-cat">' + esc(niceCat(p.category)) + '</div><div class="p-n">' + esc(p.name) + "</div>" +
        '<div class="p-pr">' + (p.bulk ? money(p.price) + " <small>per m³</small>" : (p.variations.length > 1 ? "<small>from</small> " : "") + money(p.price)) + "</div></div></button>";
    }).join("") : '<div class="empty">No products match that search.</div>';
    $("#moreBtn").hidden = list.length <= S.shown;
  }

  /* ---------- product modal ---------- */
  var M = { p: null, qty: 1, variationId: null };
  function openProduct(id) {
    var p = BYID[id]; if (!p) return;
    var firstIn = p.bulk ? null : (p.variations.filter(function (v) { return v.stock !== 0; })[0] || p.variations[0]);
    M = { p: p, qty: 1, variationId: p.bulk ? null : firstIn.id };
    $("#mImg").style.backgroundImage = p.image ? "url('" + p.image + "')" : "none";
    $("#mCat").textContent = niceCat(p.category);
    $("#mName").textContent = p.name;
    $("#mPrice").innerHTML = p.bulk ? money2(p.price) + " <small>per m³</small>" : (p.variations.length > 1 ? "<small>from</small> " : "") + money2(p.price);
    $("#mDesc").textContent = p.desc || "";
    $("#mDesc").style.display = p.desc ? "" : "none";
    var h = "";
    if (p.bulk) {
      h += '<details class="calc"><summary>Not sure how much you need? Work it out</summary>' +
        '<div class="row3"><div class="field"><label>Length (m)</label><input id="cL" type="number" min="0" step="0.1" inputmode="decimal"></div>' +
        '<div class="field"><label>Width (m)</label><input id="cW" type="number" min="0" step="0.1" inputmode="decimal"></div>' +
        '<div class="field"><label>Depth (mm)</label><input id="cD" type="number" min="0" step="10" value="75" inputmode="numeric"></div></div>' +
        '<div class="calc-out" id="cOut">Enter your area to calculate.</div></details>';
      h += '<div class="field"><label>Quantity (cubic metres)</label><div class="qty"><button type="button" data-q="-1" aria-label="Less">−</button><input id="mQty" type="number" step="' + DATA.settings.bulkStep + '" min="' + DATA.settings.bulkStep + '" max="' + DATA.settings.bulkMaxPerProduct + '" value="1"><button type="button" data-q="1" aria-label="More">+</button></div>' +
        '<div class="hint">Delivery is 1 m³ or more. For less, call <a href="tel:0397996399">(03) 9799 6399</a> to organise a pick up. 10 m³ or more? <a href="tel:0397996399">Call for bulk pricing</a>.</div></div>';
    } else {
      if (p.variations.length > 1) {
        h += '<div class="field"><label>Option</label><select id="mVar">' + p.variations.map(function (v) { return '<option value="' + v.id + '"' + (v.stock === 0 ? " disabled" : "") + (v.id === M.variationId ? " selected" : "") + ">" + esc(v.name) + " — " + money2(v.price) + (v.stock === 0 ? " (out of stock)" : "") + "</option>"; }).join("") + "</select></div>";
      }
      h += '<div class="field"><label>Quantity</label><div class="qty"><button type="button" data-q="-1" aria-label="Less">−</button><input id="mQty" type="number" step="1" min="1" max="999" value="1"><button type="button" data-q="1" aria-label="More">+</button></div></div>';
    }
    $("#mOpts").innerHTML = h;
    updModal();
    $("#modal").hidden = false; document.body.style.overflow = "hidden";
  }
  function maxQty(p, vid) {
    var st = DATA.settings;
    if (p.bulk) return p.stock == null ? st.bulkMaxPerProduct : Math.min(st.bulkMaxPerProduct, Math.floor(p.stock / st.bulkStep + 1e-9) * st.bulkStep);
    var v = p.variations.filter(function (x) { return x.id === vid; })[0] || p.variations[0];
    return v.stock == null ? 999 : Math.min(999, v.stock);
  }
  function clampQty(p, q, vid) {
    var mx = maxQty(p, vid);
    if (p.bulk) { var st = DATA.settings.bulkStep; q = Math.round(q / st) * st; return r2(Math.min(mx, Math.max(st, q || st))); }
    return Math.min(mx, Math.max(1, Math.floor(q) || 1));
  }
  function updModal() {
    var p = M.p, qi = $("#mQty");
    M.qty = clampQty(p, parseFloat(qi.value), M.variationId);
    var t = p.bulk ? bulkPrice(p, M.qty) : (p.variations.filter(function (v) { return v.id === M.variationId; })[0] || p.variations[0]).price * M.qty;
    $("#mTotal").textContent = money2(t);
    var none = maxQty(p, M.variationId) <= 0;
    $("#mAdd").disabled = none;
    $("#mAdd").textContent = none ? "Out of stock — call (03) 9799 6399" : "Add to cart";
  }
  function calc() {
    var L = parseFloat($("#cL").value), W = parseFloat($("#cW").value), D = parseFloat($("#cD").value);
    if (!(L > 0 && W > 0 && D > 0)) { $("#cOut").textContent = "Enter your area to calculate."; return; }
    var m3 = L * W * D / 1000, st = DATA.settings.bulkStep, up = Math.ceil(m3 / st - 1e-9) * st;
    up = r2(Math.max(st, up));
    if (up > DATA.settings.bulkMaxPerProduct) { $("#cOut").innerHTML = "You need about <b>" + m3.toFixed(2) + " m³</b>. That's a bulk order, so please <a href=\"tel:0397996399\">call us</a> for pricing."; return; }
    $("#cOut").innerHTML = "You need about <b>" + m3.toFixed(2) + " m³</b>. We've set the quantity to <b>" + fmtM3(up) + "</b>.";
    $("#mQty").value = up; updModal();
  }
  function addToCart() {
    var p = M.p, q = M.qty;
    if (maxQty(p, M.variationId) <= 0) return;
    var existing = cart.filter(function (l) { return l.id === p.id && (p.bulk || l.variationId === M.variationId); })[0];
    if (existing) {
      existing.qty = clampQty(p, existing.qty + q, M.variationId);
    } else {
      cart.push({ id: p.id, variationId: M.variationId, qty: q });
    }
    save(); closeAll(); toast("Added to cart: " + p.name); openCart();
  }

  /* ---------- cart / checkout ---------- */
  function openCart() { step = "cart"; renderCart(); $("#drawer").hidden = false; document.body.style.overflow = "hidden"; }
  function closeAll() { $("#modal").hidden = true; $("#drawer").hidden = true; document.body.style.overflow = ""; }

  function variationName(l) { var p = BYID[l.id]; if (!p || p.bulk) return ""; var v = p.variations.filter(function (x) { return x.id === l.variationId; })[0]; return v && p.variations.length > 1 ? v.name : ""; }

  function totalsHtml() {
    var sub = cart.reduce(function (a, l) { return a + linePrice(l); }, 0);
    var fee = deliveryFee();
    var h = '<div class="sum"><span>Products</span><span>' + money2(sub) + "</span></div>";
    if (co.mode === "delivery") {
      var s = findSuburb(co.suburb);
      h += '<div class="sum"><span>Delivery' + (s ? " · Zone " + s.z + (loads() > 1 ? " × " + loads() + " loads" : "") : "") + "</span><span>" + (fee == null ? "Choose suburb" : money2(fee)) + "</span></div>";
    } else h += '<div class="sum"><span>Pick up from yard</span><span>Free</span></div>';
    h += '<div class="sum t"><span>Total (incl. GST)</span><span>' + money2(sub + (fee || 0)) + "</span></div>";
    return h;
  }

  function renderCart() {
    var body = $("#dBody"), foot = $("#dFoot");
    $("#dTitle").textContent = step === "cart" ? "Your cart" : "Your details";
    if (!cart.length) {
      body.innerHTML = '<div class="empty-cart"><p>Your cart is empty.</p><button class="btn" data-close>Start shopping</button></div>';
      foot.innerHTML = ""; return;
    }
    if (step === "cart") {
      var h = cart.map(function (l, i) {
        var p = BYID[l.id]; if (!p) return "";
        var qty = '<div class="qty sm"><button data-li="' + i + '" data-d="-1" aria-label="Less">−</button><input data-li="' + i + '" type="number" value="' + l.qty + '" step="' + (p.bulk ? DATA.settings.bulkStep : 1) + '"><button data-li="' + i + '" data-d="1" aria-label="More">+</button></div>';
        return '<div class="li"><div class="li-img" style="background-image:url(\'' + esc(p.image || "") + '\')"></div><div><div class="li-n">' + esc(p.name) + '</div><div class="li-s">' +
          (p.bulk ? fmtM3(l.qty) + " · " + money2(p.price) + " per m³" : esc(variationName(l))) + "</div>" + qty + '</div><div class="li-r"><b>' + money2(linePrice(l)) + '</b><button class="li-rm" data-rm="' + i + '">Remove</button></div></div>';
      }).join("");
      h += '<div class="seg"><button data-mode="delivery" class="' + (co.mode === "delivery" ? "on" : "") + '">Delivery</button><button data-mode="pickup" class="' + (co.mode === "pickup" ? "on" : "") + '">Pick up</button></div>';
      if (co.mode === "delivery") {
        var s = findSuburb(co.suburb);
        h += '<div class="field"><label for="cSub">Delivery suburb</label><div class="ac"><input id="cSub" type="text" autocomplete="off" placeholder="Start typing your suburb" value="' + esc(co.suburb) + '"><div class="ac-list" id="cSubList"></div></div></div>' +
          '<div id="cSubRes">' + (s ? zoneMsg(s) : (co.suburb.length > 3 ? outsideMsg() : "")) + "</div>" +
          '<p class="note">Delivery is charged per truck load. One truck carries one material up to 10 m³, or two materials side by side (up to 4 m³ + 2 m³, or 3 m³ + 3 m³). Sleepers ride along free. Everything else is pick up only.</p>' +
          (deliveryProblem() ? '<div class="err" style="margin-top:10px">' + deliveryProblem() + "</div>" : "");
      } else {
        h += '<p class="note">Collect from our yard at 320 Hallam Rd, Hampton Park. Open 7 days, 8am to 4pm.</p>';
      }
      body.innerHTML = h;
      var ok = co.mode === "pickup" || (deliveryFee() != null && !deliveryProblem());
      foot.innerHTML = totalsHtml() + '<button class="btn block" id="toDetails" style="margin-top:12px"' + (ok ? "" : " disabled") + ">Continue</button>";
      if (co.mode === "delivery") {
        autocomplete($("#cSub"), $("#cSubList"), function (s) {
          if (s === undefined) return;
          co.suburb = s ? s.s : $("#cSub").value.trim();
          if (s && !co.address.postcode) co.address.postcode = s.pc;
          if (s) co.address.postcode = s.pc;
          save();
          $("#cSubRes").innerHTML = s ? zoneMsg(s) : outsideMsg();
          $("#dFoot").innerHTML = totalsHtml() + '<button class="btn block" id="toDetails" style="margin-top:12px"' + (s && !deliveryProblem() ? "" : " disabled") + ">Continue</button>";
        });
      }
    } else {
      var c = co.contact || {}, a = co.address || {}, dl = co.mode === "delivery";
      var dmin = dateAdd(DATA.settings.firstDayOffset), dmax = dateAdd(DATA.settings.maxDaysAhead);
      var f = '<button class="back" id="toCart">← Back to cart</button><div id="coErr"></div>' +
        '<div class="row2"><div class="field"><label for="fFirst">First name</label><input id="fFirst" autocomplete="given-name" value="' + esc(c.first) + '"></div>' +
        '<div class="field"><label for="fLast">Last name</label><input id="fLast" autocomplete="family-name" value="' + esc(c.last) + '"></div></div>' +
        '<div class="field"><label for="fPhone">Mobile</label><input id="fPhone" type="tel" autocomplete="tel" placeholder="04xx xxx xxx" value="' + esc(c.phone) + '"><div class="hint">' + (dl ? "Our driver will call this number on the day." : "We'll call if there's a problem with your order.") + "</div></div>" +
        '<div class="field"><label for="fEmail">Email</label><input id="fEmail" type="email" autocomplete="email" value="' + esc(c.email) + '"></div>';
      if (dl) {
        var s2 = findSuburb(co.suburb);
        f += '<div class="field"><label for="fLine1">Delivery street address</label><input id="fLine1" autocomplete="address-line1" placeholder="e.g. 12 Smith Street" value="' + esc(a.line1) + '"></div>' +
          '<div class="field"><label for="fLine2">Unit, lot or site name (optional)</label><input id="fLine2" autocomplete="address-line2" value="' + esc(a.line2) + '"></div>' +
          '<div class="row2"><div class="field"><label>Suburb</label><input value="' + esc(s2 ? s2.s : "") + '" disabled></div>' +
          '<div class="field"><label for="fPc">Postcode</label><input id="fPc" inputmode="numeric" maxlength="4" value="' + esc(a.postcode || (s2 && s2.pc) || "") + '"></div></div>';
      }
      f += '<div class="field"><label for="fDate">' + (dl ? "Delivery date" : "Pick-up date") + '</label><input id="fDate" type="date" min="' + dmin + '" max="' + dmax + '" value="' + esc(co.date && co.date >= dmin ? co.date : "") + '"><div class="hint">Monday to Saturday. We\'ll call to confirm a time.</div></div>' +
        (dl ? '<div class="field"><label>Where should we tip it?</label><div class="seg3">' + DATA.settings.tipLocations.map(function (t) { return '<button type="button" data-tip="' + esc(t) + '" aria-pressed="' + (co.tip === t) + '" class="' + (co.tip === t ? "on" : "") + '">' + esc(t) + "</button>"; }).join("") + '</div><div class="hint">Our trucks stay on the road, so we can\'t tip in backyards or on lawns past the nature strip.</div></div>' : "") +
        '<div class="field"><label for="fNotes">' + (dl ? "Access notes (optional)" : "Notes (optional)") + '</label><textarea id="fNotes" rows="2" maxlength="400" placeholder="' + (dl ? "e.g. Gate code, steep street, call when 10 minutes away." : "") + '">' + esc(co.notes) + "</textarea></div>";
      body.innerHTML = f;
      foot.innerHTML = totalsHtml() + '<button class="btn block" id="pay" style="margin-top:12px">Pay securely with Square</button><p class="note" style="text-align:center">You\'ll pay on Square\'s secure checkout page.</p>';
    }
  }

  function dateAdd(n) {
    var d = new Date(Date.now() + n * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }

  function readForm() {
    co.contact = { first: $("#fFirst").value.trim(), last: $("#fLast").value.trim(), phone: $("#fPhone").value.trim(), email: $("#fEmail").value.trim() };
    if (co.mode === "delivery") co.address = { line1: $("#fLine1").value.trim(), line2: $("#fLine2").value.trim(), postcode: $("#fPc").value.trim() };
    co.date = $("#fDate").value; co.notes = $("#fNotes").value.trim();
    save();
  }
  function formError() {
    var c = co.contact;
    if (!c.first || !c.last) return "Please enter your first and last name.";
    if (!/^(\+?61|0)4\d{8}$|^(\+?61|0)[2378]\d{8}$/.test(c.phone.replace(/[\s()-]/g, ""))) return "Please enter a valid Australian phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return "Please enter a valid email address.";
    if (co.mode === "delivery") {
      if ((co.address.line1 || "").length < 4) return "Please enter the street address for delivery.";
      if (!/^\d{4}$/.test(co.address.postcode || "")) return "Please enter a 4-digit postcode.";
    }
    if (co.mode === "delivery" && DATA.settings.tipLocations.indexOf(co.tip) < 0) return "Please choose where to tip it: driveway, crossover or nature strip.";
    if (!co.date) return "Please choose a date.";
    var wd = new Date(co.date + "T12:00:00Z").getUTCDay();
    if (DATA.settings.closedWeekdays.indexOf(wd) > -1) return "We don't deliver on Sundays. Please choose Monday to Saturday.";
    return null;
  }
  function pay(btn) {
    readForm();
    var e = formError();
    if (e) { $("#coErr").innerHTML = '<div class="err">' + esc(e) + "</div>"; $("#dBody").scrollTop = 0; return; }
    btn.disabled = true; btn.textContent = "Opening secure checkout…";
    fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart, mode: co.mode, suburb: co.suburb, address: co.address, contact: co.contact, date: co.date, tip: co.tip, notes: co.notes })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.url) throw new Error(res.j.error || "Checkout failed");
        store.set("pending", { ref: res.j.ref, at: Date.now() });
        window.location.href = res.j.url;
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = "Pay securely with Square";
        $("#coErr").innerHTML = '<div class="err">' + esc(err.message) + "</div>"; $("#dBody").scrollTop = 0;
      });
  }

  /* ---------- zones section ---------- */
  function renderZones() {
    var by = {};
    DATA.suburbs.forEach(function (s) { (by[s.z] = by[s.z] || []).push(s.s); });
    $("#zones").innerHTML = DATA.zones.sort(function (a, b) { return a.zone - b.zone; }).map(function (z) {
      return '<div class="zone"><h4><span>Zone ' + z.zone + ' <small>' + (by[z.zone] || []).length + " suburbs</small></span><b>" + money(z.price) + "</b></h4><p>" + (by[z.zone] || []).sort().map(esc).join(", ") + "</p></div>";
    }).join("");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-close]")) { closeAll(); return; }
    var c = t.closest(".chip"); if (c) { S.cat = c.dataset.c; S.shown = 48; renderChips(); renderGrid(); return; }
    var pc = t.closest(".p"); if (pc) { openProduct(pc.dataset.id); return; }
    if (t.closest("#moreBtn")) { S.shown += 48; renderGrid(); return; }
    if (t.closest("#cartBtn")) { openCart(); return; }
    var q = t.closest("[data-q]"); if (q) { var st = M.p.bulk ? DATA.settings.bulkStep : 1; $("#mQty").value = clampQty(M.p, M.qty + st * +q.dataset.q, M.variationId); updModal(); return; }
    if (t.closest("#mAdd")) { updModal(); addToCart(); return; }
    var d = t.closest("[data-d]"); if (d) {
      var l = cart[+d.dataset.li], p = BYID[l.id], s2 = p.bulk ? DATA.settings.bulkStep : 1;
      l.qty = clampQty(p, l.qty + s2 * +d.dataset.d, l.variationId); save(); renderCart(); return;
    }
    var rm = t.closest("[data-rm]"); if (rm) { cart.splice(+rm.dataset.rm, 1); save(); renderCart(); return; }
    var md = t.closest("[data-mode]"); if (md) { co.mode = md.dataset.mode; save(); renderCart(); return; }
    if (t.closest("#toDetails")) { step = "details"; renderCart(); return; }
    if (t.closest("#toCart")) { readForm(); step = "cart"; renderCart(); return; }
    var tp = t.closest("[data-tip]"); if (tp) { readForm(); co.tip = tp.dataset.tip; save(); [].forEach.call(document.querySelectorAll("[data-tip]"), function (b) { var on = b.dataset.tip === co.tip; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); return; }
    var pb = t.closest("#pay"); if (pb) { pay(pb); return; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "mQty") { t.value = clampQty(M.p, parseFloat(t.value), M.variationId); updModal(); }
    if (t.id === "mVar") { M.variationId = t.value; updModal(); }
    if (t.dataset && t.dataset.li != null && t.tagName === "INPUT") { var l = cart[+t.dataset.li]; l.qty = clampQty(BYID[l.id], parseFloat(t.value), l.variationId); save(); renderCart(); }
  });
  document.addEventListener("input", function (e) {
    if (["cL", "cW", "cD"].indexOf(e.target.id) > -1) calc();
    if (e.target.id === "mQty") { var v = parseFloat(e.target.value); if (v > 0) { M.qty = clampQty(M.p, v, M.variationId); $("#mTotal").textContent = money2(M.p.bulk ? bulkPrice(M.p, M.qty) : (M.p.variations.filter(function (x) { return x.id === M.variationId; })[0] || M.p.variations[0]).price * M.qty); } }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
  var qt; $("#q").addEventListener("input", function (e) { clearTimeout(qt); qt = setTimeout(function () { S.q = e.target.value.trim(); S.shown = 48; renderGrid(); }, 150); });

  /* ---------- boot ---------- */
  fetch("/api/catalog").then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) throw new Error(d.error);
    DATA = d;
    d.products.forEach(function (p) { BYID[p.id] = p; });
    d.zones.forEach(function (z) { ZONES[z.zone] = z; });
    cart = cart.filter(function (l) { return BYID[l.id] && maxQty(BYID[l.id], l.variationId) > 0; });
    cart.forEach(function (l) { l.qty = clampQty(BYID[l.id], l.qty, l.variationId); });
    save(); renderChips(); renderGrid(); renderZones();
    autocomplete($("#heroSuburb"), $("#heroList"), function (s) {
      if (s === undefined) { $("#heroRes").innerHTML = ""; return; }
      $("#heroRes").innerHTML = s ? zoneMsg(s) : outsideMsg();
      if (s) { co.suburb = s.s; co.address = co.address || {}; co.address.postcode = s.pc; co.mode = "delivery"; save(); }
    });
    if (co.suburb && findSuburb(co.suburb)) { $("#heroSuburb").value = co.suburb; }
  }).catch(function (e) {
    $("#grid").innerHTML = '<div class="empty">' + esc(e.message || "Products couldn't be loaded.") + ' Please call <a href="tel:0397996399">(03) 9799 6399</a>.</div>';
  });
  save();
})();
