/* Website sign-ups: posts each form to Netlify Forms (backup copy + email notification) and /api/signup (HubSpot). */
(function () {
  "use strict";
  function data(form) {
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = v; });
    return o;
  }
  function toNetlify(form) {
    return fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)).toString(),
    }).catch(function () {});
  }
  function toHubSpot(kind, form) {
    var d = data(form); d.kind = kind;
    return fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); })
      .catch(function () { return {}; });
  }
  function wire(form, kind, done) {
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("[type=submit]"), msg = form.querySelector("[data-msg]");
      if (btn) { btn.disabled = true; btn.dataset.t = btn.dataset.t || btn.textContent; btn.textContent = "Sending…"; }
      Promise.all([toNetlify(form), toHubSpot(kind, form)]).then(function (r) {
        var res = r[1] || {};
        if (res.status === 400 && res.error) {
          if (msg) { msg.hidden = false; msg.textContent = res.error; }
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; }
          return;
        }
        done(form, msg);
      });
    });
  }
  wire(document.getElementById("trApply"), "trade", function () {
    location.href = "/trade.html?applied=1#apply";
  });
  [].forEach.call(document.querySelectorAll("form[name=email-signup]"), function (f) {
    wire(f, "news", function (form, msg) {
      form.reset();
      var btn = form.querySelector("[type=submit]"); if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; }
      if (msg) { msg.hidden = false; msg.textContent = "Thanks! You're on the list."; }
    });
  });
})();
