/* ADV Assist — website chat bubble. Talks to /api/chat (Claude). */
(function () {
  "use strict";
  if (window.__advChat) return;
  window.__advChat = 1;

  var PHONE = "(03) 9799 6399", TEL = "tel:0397996399";
  var KEY = "adv_chat_v1";
  var GREET = "G'day! I'm ADV Assist. Ask me about products, prices, how much you need, or whether we deliver to your suburb.";
  var CHIPS = ["Do you deliver to my suburb?", "How much mulch do I need?", "What's the price of garden soil?", "Can I pick up?"];

  var css =
    ".advc-btn{position:fixed;right:20px;bottom:20px;z-index:90;width:62px;height:62px;border-radius:50%;border:0;background:#C80000;color:#fff;box-shadow:0 8px 24px rgba(80,0,0,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    ".advc-btn:hover{transform:scale(1.06);background:#A00000}.advc-btn:focus-visible{outline:3px solid #F5C518;outline-offset:3px}" +
    ".advc-btn .dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#F5C518;border:2px solid #C80000}" +
    ".advc{position:fixed;right:20px;bottom:94px;z-index:91;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;font-family:Barlow,system-ui,-apple-system,sans-serif;color:#1A1A1A}" +
    ".advc[hidden]{display:none}" +
    ".advc-h{background:#C80000;color:#fff;padding:14px 14px 12px;display:flex;align-items:center;gap:10px;border-bottom:5px solid #F5C518}" +
    ".advc-h img{width:38px;height:38px;border-radius:50%;background:#fff;padding:3px}" +
    ".advc-h b{display:block;font:800 21px 'Barlow Condensed',Impact,sans-serif;letter-spacing:.02em}" +
    ".advc-h small{display:block;font-size:12.5px;opacity:.9}" +
    ".advc-h .x{margin-left:auto;background:none;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:4px 6px}" +
    ".advc-m{flex:1;overflow-y:auto;padding:14px;background:#F7F4F2;display:flex;flex-direction:column;gap:10px}" +
    ".advc-b{max-width:86%;padding:10px 13px;border-radius:14px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".advc-b.bot{background:#fff;border:1px solid #ECE6E2;border-bottom-left-radius:4px;align-self:flex-start}" +
    ".advc-b.me{background:#C80000;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}" +
    ".advc-b a{color:#C80000;font-weight:600}.advc-b.me a{color:#fff}" +
    ".advc-chips{display:flex;flex-wrap:wrap;gap:6px}" +
    ".advc-chips button{background:#fff;border:1.5px solid #C80000;color:#C80000;border-radius:999px;padding:6px 11px;font:600 13px Barlow,sans-serif;cursor:pointer}" +
    ".advc-chips button:hover{background:#C80000;color:#fff}" +
    ".advc-typing{display:inline-flex;gap:4px;padding:12px 14px}.advc-typing i{width:7px;height:7px;border-radius:50%;background:#bbb;animation:advcB 1s infinite}" +
    ".advc-typing i:nth-child(2){animation-delay:.15s}.advc-typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes advcB{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    ".advc-f{display:flex;gap:8px;padding:10px;border-top:1px solid #ECE6E2;background:#fff}" +
    ".advc-f textarea{flex:1;resize:none;border:1.5px solid #E2DAD5;border-radius:12px;padding:10px 12px;font:500 15px Barlow,sans-serif;max-height:96px;min-height:42px}" +
    ".advc-f textarea:focus{outline:none;border-color:#C80000}" +
    ".advc-f button{border:0;border-radius:12px;background:#C80000;color:#fff;width:46px;cursor:pointer}.advc-f button:disabled{opacity:.5;cursor:default}" +
    ".advc-foot{font-size:11.5px;color:#857A75;text-align:center;padding:0 10px 8px;background:#fff}.advc-foot a{color:#857A75}" +
    "@media(max-width:520px){.advc{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.advc-btn{right:14px;bottom:14px}}";

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // Light markdown: **bold**, [text](link) for site links / tel / mailto, bare phone number -> tel link
  function render(t) {
    var h = esc(t);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
      var u = url.replace(/&amp;/g, "&");
      var ok = /^\/(?!\/)/.test(u) || /^(tel:|mailto:)/.test(u) || /^https:\/\/(www\.)?advsupplies\.com\.au\//.test(u);
      return ok ? '<a href="' + esc(u) + '">' + txt + "</a>" : txt;
    });
    h = h.replace(/\(03\) 9799 6399(?![^<]*<\/a>)/g, '<a href="' + TEL + '">' + PHONE + "</a>");
    return h;
  }

  var state = { msgs: [], open: false };
  try { var s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (s && Array.isArray(s.msgs)) state = s; } catch (e) {}
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: state.msgs.slice(-40), open: state.open })); } catch (e) {} }

  var btn = document.createElement("button");
  btn.className = "advc-btn";
  btn.setAttribute("aria-label", "Chat with ADV");
  btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="dot"></span>';

  var box = document.createElement("div");
  box.className = "advc";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "ADV Assist chat");
  box.innerHTML =
    '<div class="advc-h"><img src="/adv-logo.png" alt=""><div><b>ADV ASSIST</b><small>Products, prices &amp; delivery help</small></div><button class="x" aria-label="Close chat">×</button></div>' +
    '<div class="advc-m" aria-live="polite"></div>' +
    '<form class="advc-f"><textarea rows="1" placeholder="Type your question…" aria-label="Your message" maxlength="1500"></textarea><button type="submit" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>' +
    '<div class="advc-foot">AI helper, answers may not be perfect. Call <a href="' + TEL + '">' + PHONE + "</a> to confirm.</div>";

  document.body.appendChild(box);
  document.body.appendChild(btn);

  var list = box.querySelector(".advc-m"), form = box.querySelector("form"), ta = box.querySelector("textarea"), send = form.querySelector("button");
  var busy = false;

  function bubble(role, text) {
    var d = document.createElement("div");
    d.className = "advc-b " + (role === "user" ? "me" : "bot");
    d.innerHTML = render(text);
    list.appendChild(d);
    return d;
  }
  function draw() {
    list.innerHTML = "";
    bubble("assistant", GREET);
    if (!state.msgs.length) {
      var c = document.createElement("div");
      c.className = "advc-chips";
      CHIPS.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = function () { ask(t); }; c.appendChild(b); });
      list.appendChild(c);
    }
    state.msgs.forEach(function (m) { bubble(m.role, m.content); });
    list.scrollTop = list.scrollHeight;
  }

  function setOpen(o) {
    state.open = o; box.hidden = !o; btn.querySelector(".dot").style.display = "none";
    btn.setAttribute("aria-expanded", o ? "true" : "false");
    if (o) { draw(); setTimeout(function () { ta.focus(); }, 50); }
    persist();
  }

  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    var chips = list.querySelector(".advc-chips"); if (chips) chips.remove();
    state.msgs.push({ role: "user", content: text });
    bubble("user", text);
    ta.value = ""; ta.style.height = "";
    busy = true; send.disabled = true;
    var t = document.createElement("div"); t.className = "advc-b bot advc-typing"; t.innerHTML = "<i></i><i></i><i></i>";
    list.appendChild(t); list.scrollTop = list.scrollHeight;
    persist();
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: state.msgs, page: location.pathname }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { return d.reply || "Sorry, something went wrong. Please call us on " + PHONE + "."; })
      .catch(function () { return "Sorry, I couldn't connect. Please call us on " + PHONE + "."; })
      .then(function (reply) {
        t.remove();
        state.msgs.push({ role: "assistant", content: reply });
        bubble("assistant", reply);
        list.scrollTop = list.scrollHeight;
        busy = false; send.disabled = false;
        persist();
      });
  }

  btn.addEventListener("click", function () { setOpen(box.hidden); });
  box.querySelector(".x").addEventListener("click", function () { setOpen(false); btn.focus(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(ta.value); });
  ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(ta.value); } });
  ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 96) + "px"; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) setOpen(false); });

  if (state.open) setOpen(true);
})();
