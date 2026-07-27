/* ============================================================================
   DYExplore — the card showcase (S6 / S6b). Four faction galleries, each split
   into THE LAUNCH SET and WAVE 1, captions FROM FILENAME ONLY. Data =
   js/cards-manifest.js (generated from masters; each entry {s, set}; counts
   DERIVED from length, never hardcoded). Fail-open (404 → placeholder); motion
   honors prefers-reduced-motion. No prices/purchase/dates/free-platform links.
   ========================================================================= */
window.DYExplore = (function () {
  var DATA = window.DY_EXPLORE || {};
  var FACTIONS = ["devas", "asuras", "nagas", "vanaras"];
  var LABEL = { devas: "Devas", asuras: "Asuras", nagas: "Nagas", vanaras: "Vanaras" };
  var TYPE_RANK = { Hero: 0, Unit: 1, Astra: 2, Mantra: 3, Artifact: 4, Token: 5 }; // Token band LAST

  // RULED COPY — verbatim, set via textContent (never reworded)
  var COPY_LAUNCH = "The founding cards. Every Access Card holds them all — one TORANA, the full launch set, playable.";
  var COPY_WAVE = "The expansion. Wave cards are individual NFTs — owned one by one. Claims are not yet open; the Rite will announce.";
  var COPY_FOOT = "Ownership never buys win-rate.";
  var BADGE = { launch: "ACCESS", wave1: "NFT", token: "IN-GAME TOKEN — NOT AN NFT" };

  var built = {}; // faction -> built node (cached)
  var combinedByFac = {}; // faction -> combined ordered card list (for the lightbox)
  var current = null;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) {
    return document.getElementById(id);
  }
  function el(t, c, h) {
    var e = document.createElement(t);
    if (c) e.className = c;
    if (h != null) e.innerHTML = h;
    return e;
  }
  function txt(t, c, s) {
    var e = document.createElement(t);
    if (c) e.className = c;
    e.textContent = s;
    return e;
  }

  // ---- filename → card fields (no transcription of frame text) ----
  function parse(stem) {
    var m = stem.match(/^(Devas|Asuras|Nagas|Vanaras)_(Hero|Unit|Astra|Mantra|Artifact|Token)_([A-Za-z0-9]+)(?:_P(\d+))?_r([A-Za-z]+)$/);
    if (!m) return null;
    return { faction: m[1].toLowerCase(), type: m[2], name: respace(m[3]), power: m[4] ? Number(m[4]) : null, rarity: m[5], stem: stem };
  }
  function respace(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  function caption(c) {
    var parts = [c.name, c.type];
    if (c.rarity && c.rarity !== c.type) parts.push(c.rarity); // Token's rarity==type → once ("Rakta · Token · P2")
    if (c.power != null) parts.push("P" + c.power);
    return parts.join(" · ");
  }
  function sortCards(a, b) {
    var ra = TYPE_RANK[a.type],
      rb = TYPE_RANK[b.type];
    if (ra !== rb) return ra - rb;
    if (a.type === "Unit") {
      var pa = a.power || 0,
        pb = b.power || 0;
      if (pa !== pb) return pb - pa; // Units by power desc
    }
    return a.name.localeCompare(b.name);
  }
  function thumbUrl(fac, stem) {
    return "assets/cards/" + fac + "/" + stem + "_320.jpg";
  }
  function displayUrl(fac, stem) {
    return "assets/cards/" + fac + "/" + stem + "_720.jpg";
  }

  // manifest entries {s,set} → parsed cards, split into launch / wave(+token last)
  function split(fac) {
    var all = (DATA[fac] || [])
      .map(function (entry) {
        var c = parse(entry.s);
        if (c) c.set = entry.set;
        return c;
      })
      .filter(Boolean);
    var launch = all.filter(function (c) {
      return c.set === "launch";
    }).sort(sortCards);
    var wave = all.filter(function (c) {
      return c.set === "wave1" || c.set === "token";
    }).sort(sortCards); // token (TYPE_RANK 5) lands last
    return { launch: launch, wave: wave };
  }

  function placeholder(c) {
    var d = el("div", "ex-ph");
    d.appendChild(txt("span", "ex-ph-name", c.name));
    d.appendChild(txt("span", "ex-ph-sub", c.type + (c.power != null ? " · P" + c.power : "")));
    return d;
  }

  function cell(fac, c, idx) {
    var fig = el("figure", "ex-card");
    fig.setAttribute("data-idx", idx);
    fig.setAttribute("role", "button");
    fig.setAttribute("tabindex", "0");
    fig.setAttribute("aria-label", caption(c) + " — " + BADGE[c.set]);
    var frame = el("div", "ex-frame");
    var img = new Image();
    img.className = "ex-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = caption(c);
    img.onerror = function () {
      frame.innerHTML = "";
      frame.appendChild(placeholder(c));
    };
    img.src = thumbUrl(fac, c.stem);
    frame.appendChild(img);
    fig.appendChild(frame);
    fig.appendChild(txt("figcaption", "ex-cap", c.name));
    fig.appendChild(txt("div", "ex-cap-sub", c.type + (c.rarity && c.rarity !== c.type ? " · " + c.rarity : "") + (c.power != null ? " · P" + c.power : "")));
    fig.appendChild(txt("span", "ex-badge ex-badge-" + c.set, BADGE[c.set]));
    var open = function () {
      openLightbox(fac, idx);
    };
    fig.addEventListener("click", open);
    fig.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    return fig;
  }

  function sectionHead(title, copy, count) {
    var wrap = el("div", "ex-section-head");
    var h = el("div", "ex-section-title");
    h.appendChild(txt("span", null, title));
    h.appendChild(txt("span", "ex-section-count", String(count)));
    wrap.appendChild(h);
    wrap.appendChild(txt("p", "ex-section-copy", copy)); // VERBATIM ruled copy
    return wrap;
  }

  function buildFaction(fac) {
    var s = split(fac);
    var combined = s.launch.concat(s.wave);
    combinedByFac[fac] = combined;
    var wrap = el("div", "ex-faction");

    // THE LAUNCH SET (count = launch cards)
    wrap.appendChild(sectionHead("The Launch Set", COPY_LAUNCH, s.launch.length));
    var g1 = el("div", "ex-grid");
    s.launch.forEach(function (c, i) {
      g1.appendChild(cell(fac, c, i));
    });
    wrap.appendChild(g1);

    // WAVE 1 (count = wave1 NFTs only; the Token band renders last, badged as not-an-NFT)
    var waveCount = s.wave.filter(function (c) {
      return c.set === "wave1";
    }).length;
    wrap.appendChild(sectionHead("Wave 1", COPY_WAVE, waveCount));
    var g2 = el("div", "ex-grid");
    s.wave.forEach(function (c, i) {
      g2.appendChild(cell(fac, c, s.launch.length + i));
    });
    wrap.appendChild(g2);

    wrap.appendChild(txt("p", "ex-foot", COPY_FOOT)); // shared footnote, once per tab
    return wrap;
  }

  // ---- tabs ----
  function renderTabs() {
    var strip = $("ex-tabs");
    strip.innerHTML = "";
    FACTIONS.forEach(function (fac) {
      var n = (DATA[fac] || []).length; // total, DERIVED from the manifest
      var b = el("button", "ex-tab" + (fac === current ? " on" : ""), LABEL[fac] + " <span class='ex-count'>" + n + "</span>");
      b.setAttribute("data-fac", fac);
      b.setAttribute("aria-pressed", fac === current ? "true" : "false");
      b.onclick = function () {
        show(fac);
      };
      strip.appendChild(b);
    });
  }

  function show(fac) {
    if (!DATA[fac]) return;
    current = fac;
    renderTabs();
    var host = $("ex-gallery");
    host.innerHTML = "";
    if (!built[fac]) built[fac] = buildFaction(fac);
    host.appendChild(built[fac]);
    try {
      history.replaceState(null, "", "?f=" + fac);
    } catch (e) {}
    document.body.setAttribute("data-fac", fac);
  }

  // ---- lightbox (720 + caption + badge; prev/next within the faction's combined order) ----
  var lb = { fac: null, idx: 0, list: null };
  function openLightbox(fac, idx) {
    lb.fac = fac;
    lb.list = combinedByFac[fac] || [];
    lb.idx = idx;
    var ov = $("ex-lightbox");
    ov.classList.add("show");
    if (reduce) ov.style.transition = "none";
    document.body.style.overflow = "hidden";
    paint();
  }
  function closeLightbox() {
    $("ex-lightbox").classList.remove("show");
    document.body.style.overflow = "";
  }
  function nav(d) {
    var n = lb.list.length;
    if (!n) return;
    lb.idx = (lb.idx + d + n) % n;
    paint();
  }
  function paint() {
    var c = lb.list[lb.idx];
    if (!c) return;
    var imgWrap = $("ex-lb-img");
    imgWrap.innerHTML = "";
    var img = new Image();
    img.className = "ex-lb-frame";
    img.alt = caption(c);
    img.onerror = function () {
      imgWrap.innerHTML = "";
      imgWrap.appendChild(placeholder(c));
    };
    img.src = displayUrl(lb.fac, c.stem);
    imgWrap.appendChild(img);
    $("ex-lb-cap").textContent = caption(c);
    var badge = $("ex-lb-badge");
    badge.textContent = BADGE[c.set];
    badge.className = "ex-badge ex-badge-" + c.set;
    $("ex-lb-count").textContent = lb.idx + 1 + " / " + lb.list.length;
  }

  function mount() {
    $("ex-lb-close").onclick = closeLightbox;
    $("ex-lb-prev").onclick = function (e) {
      e.stopPropagation();
      nav(-1);
    };
    $("ex-lb-next").onclick = function (e) {
      e.stopPropagation();
      nav(1);
    };
    var ov = $("ex-lightbox");
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeLightbox();
    });
    $("ex-lb-img").addEventListener("click", function () {
      nav(1);
    });
    document.addEventListener("keydown", function (e) {
      if (!ov.classList.contains("show")) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nav(1);
      else if (e.key === "ArrowLeft") nav(-1);
    });
    var tx = null;
    $("ex-lb-img").addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) tx = e.touches[0].clientX;
    }, { passive: true });
    $("ex-lb-img").addEventListener("touchend", function (e) {
      if (tx == null) return;
      var dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) >= 50) nav(dx < 0 ? 1 : -1);
      tx = null;
    });

    var q = (location.search.match(/[?&]f=([a-z]+)/) || [])[1];
    show(FACTIONS.indexOf(q) >= 0 ? q : FACTIONS[0]);
  }

  return { mount: mount };
})();
