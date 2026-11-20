# Builds the static pages from shared parts. Run: python3 tools/pages.py
import os, re, html, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
E = lambda s: html.escape(s, quote=True)

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Russo+One&family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,900&family=Barlow+Semi+Condensed:wght@600&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">'

def head(title, desc, extra=""):
    return f'''<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{E(desc)}">
<link rel="icon" href="/adv-logo.png">
{FONTS}
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/site.css">
{extra}</head>
'''

CART_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>'

def header(active="", roll=False, cart=True):
    links = [("/products.html", "Products", "products"), ("/#delivery", "Need delivery?", "delivery"), ("/#calculator", "Need measurements?", "calc"), ("/delivery.html", "Delivery map", "map"), ("#contact", "Contact", "contact")]
    nav = "".join(f'<a href="{h}"' + (' aria-current="page"' if k == active else "") + f'>{t}</a>' for h, t, k in links)
    cartbtn = f'<button class="sh-cart" id="cartBtn" type="button" aria-label="Open cart">{CART_SVG}<b id="cartCount">0</b></button>' if cart else f'<a class="sh-cart" href="/products.html" aria-label="Shop products">{CART_SVG}</a>'
    return f'''<header class="sh{' roll' if roll else ''}"><div class="sh-in">
  <a class="sh-logo" href="/" aria-label="ADV Supplies home"><span class="sh-curtain" aria-hidden="true"></span><img src="/adv-logo.png" alt="" width="56" height="56"><span class="sh-word">ADV</span></a>
  <nav class="sh-nav" aria-label="Main">{nav}</nav>
  <div class="sh-act"><a class="sh-call" href="tel:0397996399">Call us</a>{cartbtn}</div>
</div></header>
<div class="sh-strip"></div>
'''

FOOTER = '''<footer id="contact" class="sf"><div class="sf-in">
  <div class="sf-col">
    <div class="sf-brand">ADV Supplies <span>|</span> Garden &amp; Building</div>
    <p>Bulk landscape and building supplies for trade and home, delivered across Melbourne's south-east. It all starts from the ground UP.</p>
    <nav class="sf-nav" aria-label="Footer"><a href="/products.html">Products</a><a href="/#delivery">Need delivery?</a><a href="/#calculator">Need measurements?</a><a href="/delivery.html">Delivery map</a></nav>
  </div>
  <div class="sf-col"><h4>Visit the yard</h4><p>320 Hallam Rd<br>Hampton Park VIC 3976<br>Open 7 days, 8am to 4pm</p></div>
  <div class="sf-col"><h4>Talk to us</h4><p><a href="tel:0397996399">(03) 9799 6399</a><br><a href="mailto:sales@advsupplies.com.au">sales@advsupplies.com.au</a></p></div>
</div>
<div class="sf-bot"><span>© ADV Garden and Building Supplies Pty Ltd · Payments processed securely by Square</span><span class="sf-legal"><a href="/privacy.html">Privacy Policy</a><a href="/terms.html">Terms &amp; Conditions</a><a href="/refunds.html">Refunds &amp; Returns</a><a href="/gift-cards.html">Gift Card Terms</a></span></div>
</footer>
'''

def page(name, title, desc, body, active="", roll=False, scripts='<script src="/app.js"></script>', extra_head="", cart=True):
    doc = head(title, desc, extra_head) + "<body>\n" + header(active, roll, cart) + body + FOOTER + scripts + "\n</body>\n</html>\n"
    open(os.path.join(PUB, name), "w").write(doc)

# ---------------- home ----------------
IC = {
 'leaf': '<path class="a-grow" d="M12 21v-8M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 15c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/>',
 'wilt': '<path class="a-wilt" d="M7 20c0-4 1-7 3-9M10 11c-2-1-4-1-5 1M10 11c1-2 3-3 5-2"/><path d="M3 21h18"/>',
 'drop': '<path class="a-drop" d="M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z"/>',
 'house': '<path class="a-pop" d="M4 11l8-6 8 6M6 10v9h12v-9M10 19v-5h4v5"/>',
 'path': '<path d="M8 21l3-18M16 21l-3-18"/><path class="a-flow" d="M12 20V4"/>',
 'lawn': '<path class="a-grow" d="M4 20l1-6M8 20l0-8M12 20l1-9M16 20l-1-7M20 20l-1-5"/><path d="M3 21h18"/>',
 'box': '<path class="a-pop" d="M4 10h16v9H4zM4 10l2-4h12l2 4"/><path class="a-grow" d="M12 10V6"/>',
 'pavers': '<g class="a-slide"><path d="M3 9h8v5H3zM13 9h8v5h-8zM7 15h8v5H7z"/></g>',
 'mix': '<path d="M4 15l3-8h10l3 8z"/><path class="a-flow" d="M8 18h8M12 15v6"/>',
 'pit': '<path d="M3 17h18M5 17c0-3 3-5 7-5s7 2 7 5"/><path class="a-pop" d="M15 8l3-3M15 5h3v3"/>',
 'car': '<g class="a-roll"><path d="M3 15l2-5h14l2 5v3H3z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></g>',
 'layers': '<path class="a-pop" d="M12 4l9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16l9 4 9-4"/>',
 'wall': '<path class="a-pop" d="M3 19h18M4 19v-4h6v4M10 19v-4h6v4M16 19v-4h4M6 15v-4h6v4M12 15v-4h6"/>',
 'rock': '<path class="a-pop" d="M4 18l2-7 5-3 6 2 3 8z"/><path d="M3 20h18"/>',
 'bag': '<path class="a-pop" d="M6 7h12l1 13H5zM9 7V5h6v2"/><path d="M9 12h6"/>',
 'shovel': '<g class="a-slide"><path d="M12 3v11M10 3h4"/><path d="M8 14h8v3a4 4 0 0 1-8 0z"/></g>',
 'barrow': '<g class="a-roll"><path d="M3 9h12l-2 6H6zM15 9l5-2M10 15l-2 3"/><circle cx="8" cy="19" r="1.6"/></g>',
 'cone': '<path class="a-pop" d="M10 5h4l4 14H6zM8.5 11h7M7.5 15h9"/><path d="M4 20h16"/>',
 'tape': '<path d="M3 15h14v4H3z"/><path class="a-flow" d="M17 17h4"/><path d="M6 15v-2M10 15v-2M14 15v-2"/>',
 'glove': '<path class="a-pop" d="M7 21V11l-2-3V4h3v4h2V4h3v4h2V4h3v4l-2 3v10z"/>',
 'edge': '<path class="a-grow" d="M12 21V9"/><path d="M8 21h8M6 9h12l-2-5H8z"/>',
}
CARDS = [
 ('pebbles', 'Pebbles', 'White pebbles edging a garden bed', 'Decorative ground cover that lifts the whole front of a property.', [('house', 'Lifts the look of the front yard'), ('path', 'Paths and garden edging'), ('drop', 'Free-draining, so water gets away')]),
 ('mulch', 'Mulch', 'Black mulch spread across a garden bed', 'Suppress weeds, retain moisture, finish the look.', [('wilt', 'Blocks the light weeds need'), ('drop', 'Holds moisture in the soil'), ('leaf', 'Keeps roots cool so plants thrive')]),
 ('soil', 'Compost &amp; Soil', 'Dark soil with a red shovel', 'Feed your garden from the ground up.', [('leaf', 'Feeds new garden beds'), ('lawn', 'Levels and tops up lawns'), ('box', 'Fills raised beds and planters')]),
 ('sand', 'Sand', 'White sand with a red shovel', 'Washed, graded and ready for any job.', [('pavers', 'Bedding under pavers'), ('mix', 'Concreting and bricklaying'), ('pit', 'Sandpits and play areas')]),
 ('toppings', 'Toppings &amp; Screenings', 'Red scoria packed around a drainage pipe', 'Gravel and screenings for driveways, paths and base layers.', [('car', 'Hard-wearing driveways'), ('layers', 'Compacted base under slabs and pavers'), ('drop', 'Drainage around pipes and walls')]),
 ('rocks', 'Rocks', 'Large grey boulders in a front garden bed', 'Bold, natural statement pieces for any landscape.', [('wall', 'Retaining walls and terraces'), ('rock', 'Feature boulders that stand out'), ('path', 'Garden edging and dry creek beds')]),
 ('bags', 'Bag Products', 'Pallet of red bagged soil improver', 'Quality products, conveniently bagged &amp; ready to go.', [('car', 'Fits in the boot or ute tray'), ('leaf', 'Potting mix, fertiliser and soil improver'), ('bag', 'Just right for small jobs and top-ups')]),
 ('hardware', 'Hardware &amp; Tools', 'Red shovels, rakes and witches hats on a tool wall', 'The right gear, when you need it.', [('shovel', 'Shovels, rakes and spades'), ('barrow', 'Barrows to move the load'), ('cone', 'Site safety gear')]),
 ('accessories', 'Accessories', 'Landscaper in red gloves measuring a garden bed', 'Everything else the job needs.', [('tape', 'Tape measures and string lines'), ('glove', 'Gloves and workwear'), ('edge', 'Edging, pegs and weed mat')]),
]
ANCHOR = {'pebbles': 'pebbles', 'mulch': 'mulch', 'soil': 'compost-soil', 'sand': 'sand', 'toppings': 'toppings-screenings', 'rocks': 'rocks', 'bags': 'bag-products', 'hardware': 'hardware-tools', 'accessories': 'accessories'}

def cards():
    out = []
    for i, (k, name, alt, desc, uses) in enumerate(CARDS):
        lis = "".join(f'<li><span class="mc-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{IC[a]}</svg></span>{t}</li>' for a, t in uses)
        out.append(f'''<article class="mc{' mc-more' if i >= 3 else ''}">
      <div class="mc-img"><img src="/img/cat-{k}.jpg" alt="{alt}" loading="lazy" width="640" height="640"></div>
      <div class="mc-b"><h3>{name}</h3><p>{desc}</p><ul>{lis}</ul><a class="mc-btn" href="/products.html#cat-{ANCHOR[k]}">View products</a></div>
    </article>''')
    return "\n    ".join(out)

def gift_block():
    old = subprocess.run(["git", "show", "a8ff5c5:public/index.html"], cwd=ROOT, capture_output=True, text=True).stdout
    a = old.index('<div class="promo-box promo-gift">'); b = old.index('<div class="promo-box promo-map">')
    return old[a:b].rstrip()

HOME = f'''
<section class="hero3d" aria-label="ADV delivers to homes, new estates and construction sites">
  <div class="m-hero"><div class="m-eye">We deliver to</div><h1>Homes · New estates <span>&amp;</span> construction sites</h1><p>Landscapers · Builders · Tradies · DIY</p><div class="m-cta"><a class="sx-btn" href="/products.html">Shop products</a><a class="sx-btn alt" href="tel:0397996399">(03) 9799 6399</a></div></div>
  <div class="hero3d-box" data-adv-hero="1"></div>
</section>

<section class="sx-intro"><div class="sx-wrap sx-center">
  <h2 class="sx-h2">Delivered from our yard to your site</h2>
  <p>Our six trucks run loads across Melbourne's south-east every day, from Hampton Park out to the Peninsula, Pakenham and the eastern suburbs. Every suburb has a flat rate per truck load, so you know the delivery cost before you order.</p>
</div></section>

<section class="sx-prods" id="products"><div class="sx-wrap">
  <div class="sx-head">
    <div><h2 class="sx-h2 red">Products</h2><span class="sx-bar"></span><p>Our main ranges, and what each one does for your project or property.</p></div>
    <a class="sx-btn dark" href="/products.html">See all products</a>
  </div>
  <div class="mc-grid" id="mcGrid">
    {cards()}
  </div>
  <div class="sx-center"><button class="sx-btn" id="mcMore" type="button" aria-expanded="false" aria-controls="mcGrid">Show more</button></div>
</div></section>

<section class="sx-deliv" id="delivery"><div class="sx-wrap sx-two">
  <div>
    <svg viewBox="0 0 930 330" width="100%" class="sx-arc" aria-hidden="true">
      <defs>
        <radialGradient id="advGlow" cx="0.08" cy="0.9" r="1.1"><stop offset="0" stop-color="#5a1a08"/><stop offset="0.55" stop-color="#2e0c0a"/><stop offset="1" stop-color="#160707"/></radialGradient>
        <pattern id="advDots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#5a2a2a"/></pattern>
        <radialGradient id="advYard" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F5C518" stop-opacity="0.55"/><stop offset="1" stop-color="#F5C518" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="930" height="330" fill="url(#advGlow)"/><rect width="930" height="285" fill="url(#advDots)"/>
      <path d="M72 285 Q 420 95 755 285 Z" fill="#C80000" fill-opacity="0.22"/><path d="M72 285 Q 320 140 560 285 Z" fill="#E8661A" fill-opacity="0.35"/><path d="M72 285 Q 220 190 370 285 Z" fill="#F5C518" fill-opacity="0.55"/>
      <path d="M72 285 Q 420 95 755 285" fill="none" stroke="#E8302A" stroke-width="4"/><path d="M72 285 Q 320 140 560 285" fill="none" stroke="#F08A24" stroke-width="4"/><path d="M72 285 Q 220 190 370 285" fill="none" stroke="#F5C518" stroke-width="5"/>
      <g fill="#FFFFFF" stroke="#1A1A1A" stroke-width="3"><circle cx="162" cy="219" r="7"/><circle cx="215" cy="172" r="7"/><circle cx="340" cy="118" r="7"/><circle cx="266" cy="255" r="7"/><circle cx="423" cy="184" r="7"/><circle cx="488" cy="252" r="7"/><circle cx="565" cy="101" r="7"/><circle cx="621" cy="172" r="7"/><circle cx="690" cy="250" r="7"/></g>
      <rect x="0" y="285" width="930" height="45" fill="#1C1C1C"/><line x1="0" y1="306" x2="930" y2="306" stroke="#F5C518" stroke-width="4" stroke-dasharray="22 18"/>
      <circle cx="72" cy="285" r="48" fill="url(#advYard)"/><circle cx="72" cy="285" r="20" fill="#FFFFFF"/><circle cx="72" cy="285" r="13" fill="#C80000"/>
      <g class="sx-truck" transform="translate(755 210)"><path d="M18 18 Q 42 -2 66 18 Z" fill="#8a5a2b"/><rect x="0" y="16" width="84" height="44" rx="4" fill="#F5C518"/><path d="M84 30 H108 L126 48 V62 H84 Z" fill="#C80000"/><path d="M90 34 H106 L118 46 H90 Z" fill="#9fd3ff"/><circle cx="22" cy="68" r="11" fill="#1A1A1A" stroke="#FFFFFF" stroke-width="4"/><circle cx="101" cy="68" r="11" fill="#1A1A1A" stroke="#FFFFFF" stroke-width="4"/></g>
    </svg>
    <div class="sx-legend"><span><i style="background:#F5C518"></i>Zones 1–4</span><span><i style="background:#F08A24"></i>5–7</span><span><i style="background:#E8302A"></i>8–10</span></div>
  </div>
  <div class="sx-check">
    <h2 class="sx-h1">Do we deliver <span>to you?</span></h2>
    <p>111 suburbs across 10 zones from our Hampton Park yard. Check your suburb and per-load rate.</p>
    <div class="ac"><input id="heroSuburb" type="text" placeholder="Type your suburb" autocomplete="off" aria-label="Your suburb"><div class="ac-list" id="heroList"></div></div>
    <div class="check-res" id="heroRes"></div>
    <div class="sx-zones" id="promoZones"></div>
    <a class="sx-btn block" href="/delivery.html">See all delivery areas on the map</a>
  </div>
</div></section>

<section class="sx-gift"><div class="sx-wrap">
  {gift_block()}
</div></section>

<section class="sx-calc" id="calculator"><div class="sx-wrap sx-two top">
  <div>
    <span class="sx-eye">Material calculator</span>
    <h2 class="sx-h1">Do you need <span>measurements?</span></h2>
    <p class="sx-lead">Tell us your measurements here and we'll tell you how much you need.</p>
    <p class="sx-small">Typical depths: mulch 75 mm, garden soil 100 mm, pebbles and sand 50 mm, toppings and crushed rock 75 to 100 mm.</p>
  </div>
  <div class="sx-calcbox">
    <label class="fl">Product<select id="hcProd"><option>Loading products…</option></select></label>
    <div class="fl3">
      <label class="fl">Length (m)<input id="hcL" type="number" min="0" step="0.1" inputmode="decimal" value="5"></label>
      <label class="fl">Width (m)<input id="hcW" type="number" min="0" step="0.1" inputmode="decimal" value="3"></label>
      <label class="fl">Depth (mm)<input id="hcD" type="number" min="0" step="10" inputmode="numeric" value="75"></label>
    </div>
    <div id="hcOut" class="hc-out" aria-live="polite"></div>
  </div>
</div></section>
'''

HOME_JS = '''<script src="/app.js"></script>
<script>
(function(){var b=document.getElementById('mcMore'),g=document.getElementById('mcGrid');if(b)b.addEventListener('click',function(){var o=g.classList.toggle('open');b.textContent=o?'Show less':'Show more';b.setAttribute('aria-expanded',o);});})();
(function(){var el=document.querySelector('[data-adv-hero]');if(!el)return;var go=function(){if(go.d)return;go.d=1;var s=document.createElement('script');s.src='/hero/hero3d.js';document.body.appendChild(s);};
if('IntersectionObserver' in window){new IntersectionObserver(function(es,o){if(es.some(function(e){return e.isIntersecting})){o.disconnect();go();}},{rootMargin:'200px'}).observe(el);}else go();})();
</script>'''

page("index.html", "ADV Supplies | Soil, Mulch, Sand &amp; Rock Delivered | Hampton Park",
     "Bulk landscape and building supplies delivered across Melbourne's south-east from our Hampton Park yard. Order online with your exact delivery price for your suburb.",
     HOME, roll=True, scripts=HOME_JS)

# ---------------- products ----------------
PRODUCTS = '''
<section class="ps-top"><div class="sx-wrap">
  <div class="sx-head">
    <div><h1 class="sx-h2 red big">Products</h1><span class="sx-bar"></span><p>Everything we stock at the Hampton Park yard, with today's prices. Bulk materials are priced per m³ and delivered by the truck load.</p></div>
    <div class="ps-search"><label class="sr" for="psQ">Search products</label><input id="psQ" type="search" placeholder="Search products" autocomplete="off"></div>
  </div>
  <nav class="ps-chips" id="psChips" aria-label="Product categories"></nav>
  <p class="ps-none" id="psNone" hidden></p>
</div></section>
<div id="psSections"><div class="ps-loading">Loading products…</div></div>
'''
page("products.html", "Products &amp; Prices | ADV Supplies | Hampton Park",
     "Every product ADV Supplies stocks, with today's prices: mulch, pebbles, soil, sand, rocks, toppings, bagged products, hardware, water tanks and more.",
     PRODUCTS, active="products")

# ---------------- policies ----------------
def mark(t): return re.sub(r'\[([^\]]+)\]', r'<mark>[\1]</mark>', t)
def render(blocks):
    out = []
    for b in blocks:
        if b[0] == 'h': out.append(f'<h2>{b[1]}</h2>')
        elif b[0] == 'p': out.append(f'<p>{mark(b[1])}</p>')
        else: out.append('<ul>' + ''.join(f'<li>{mark(x)}</li>' for x in b[1]) + '</ul>')
    return "\n    ".join(out)
from policies import POLICIES
for fname, title, lead, blocks, desc in POLICIES:
    body = f'''
<section class="pol-top"><div class="pol-wrap"><h1>{title}</h1><p>{lead}</p></div></section>
<main class="pol"><div class="pol-wrap">
    {render(blocks)}
</div></main>
'''
    page(fname, f"{title} | ADV Supplies", desc, body)

# ---------------- delivery map page: swap in the shared header/footer ----------------
p = os.path.join(PUB, "delivery.html"); s = open(p).read()
if '<header class="sh' not in s:
    a = s.index('<div class="topbar">'); b = s.index('</header>') + len('</header>')
    s = s[:a] + header("map", cart=False) + s[b:]
    s = s.replace('<link rel="stylesheet" href="/styles.css">', '<link rel="stylesheet" href="/styles.css">\n<link rel="stylesheet" href="/site.css">', 1)
    s = s.replace('family=Barlow+Condensed:wght@600;700;800&family=Barlow', 'family=Russo+One&family=Barlow+Condensed:wght@600;700;800&family=Barlow+Semi+Condensed:wght@600&family=Barlow', 1)
    fa = s.index('<footer'); fb = s.index('</footer>') + len('</footer>')
    s = s[:fa] + FOOTER.rstrip() + s[fb:]
    open(p, "w").write(s)
print("pages built")
