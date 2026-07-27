/* ============================================================================
   DYExplore — the card showcase (S6). Four faction galleries of the finalized
   frames, captions derived FROM FILENAME ONLY (no rules text / flavor / prices /
   mint language — the frame speaks for itself). Data = js/cards-manifest.js
   (generated from the masters; counts are DERIVED from array length, never
   hardcoded). Fail-open: a 404 thumb renders a neutral placeholder, never breaks
   the grid. All motion honors prefers-reduced-motion.
   ========================================================================= */
window.DYExplore = (function () {
  var DATA = window.DY_EXPLORE || {};
  var FACTIONS = ["devas", "asuras", "nagas", "vanaras"];
  var LABEL = { devas: "Devas", asuras: "Asuras", nagas: "Nagas", vanaras: "Vanaras" };
  // sort bands: Heroes, Units (power desc), Astras, Mantras, Artifacts, then Token LAST (owner ruling)
  var TYPE_RANK = { Hero: 0, Unit: 1, Astra: 2, Mantra: 3, Artifact: 4, Token: 5 };

  var built = {}; // faction -> built grid node (lazy, cached)
  var current = null; // active faction
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

  // ---- filename → card fields (no transcription; frame text is never read) ----
  function parse(stem) {
    var m = stem.match(/^(Devas|Asuras|Nagas|Vanaras)_(Hero|Unit|Astra|Mantra|Artifact|Token)_([A-Za-z0-9]+)(?:_P(\d+))?_r([A-Za-z]+)$/);
    if (!m) return null;
    return { faction: m[1].toLowerCase(), type: m[2], name: respace(m[3]), power: m[4] ? Number(m[4]) : null, rarity: m[5], stem: stem };
  }
  function respace(s) {
    // CamelCase → spaced words (apostrophes/spaces were stripped in the filename; not recoverable, and that's fine)
    return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  function caption(c) {
    var parts = [c.name, c.type];
    if (c.rarity && c.rarity !== c.type) parts.push(c.rarity); // Token's rarity==type → shown once ("Rakta · Token · P2")
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
    return a.name.localeCompare(b.name); // alpha within band
  }
  function thumbUrl(fac, stem) {
    return "assets/cards/" + fac + "/" + stem + "_320.jpg";
  }
  function displayUrl(fac, stem) {
    return "assets/cards/" + fac + "/" + stem + "_720.jpg";
  }

  function cards(fac) {
    return (DATA[fac] || [])
      .map(parse)
      .filter(Boolean)
      .sort(sortCards);
  }

  // ---- neutral placeholder for a 404 frame (fail-open) ----
  function placeholder(c) {
    return (
      '<div class="ex-ph"><span class="ex-ph-name">' +
      c.name +
      '</span><span class="ex-ph-sub">' +
      c.type +
      (c.power != null ? " · P" + c.power : "") +
      "</span></div>"
    );
  }

  // ---- one grid cell ----
  function cell(fac, c, idx) {
    var fig = el("figure", "ex-card");
    fig.setAttribute("data-idx", idx);
    fig.setAttribute("role", "button");
    fig.setAttribute("tabindex", "0");
    fig.setAttribute("aria-label", caption(c));
    var frame = el("div", "ex-frame");
    var img = new Image();
    img.className = "ex-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = caption(c);
    img.onerror = function () {
      frame.innerHTML = placeholder(c);
    };
    img.src = thumbUrl(fac, c.stem);
    frame.appendChild(img);
    fig.appendChild(frame);
    fig.appendChild(el("figcaption", "ex-cap", c.name));
    fig.appendChild(el("div", "ex-cap-sub", c.type + (c.rarity && c.rarity !== c.type ? " · " + c.rarity : "") + (c.power != null ? " · P" + c.power : "")));
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

  function buildGrid(fac) {
    var grid = el("div", "ex-grid");
    var list = cards(fac);
    list.forEach(function (c, i) {
      grid.appendChild(cell(fac, c, i));
    });
    return grid;
  }

  // ---- tabs ----
  function renderTabs() {
    var strip = $("ex-tabs");
    strip.innerHTML = "";
    FACTIONS.forEach(function (fac) {
      var n = (DATA[fac] || []).length; // count DERIVED from the shipped manifest
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
    if (!built[fac]) built[fac] = buildGrid(fac);
    host.appendChild(built[fac]);
    try {
      history.replaceState(null, "", "?f=" + fac);
    } catch (e) {}
    document.body.setAttribute("data-fac", fac);
  }

  // ---- lightbox (720 image + caption; prev/next/swipe/keyboard) ----
  var lb = { fac: null, idx: 0, list: null };
  function openLightbox(fac, idx) {
    lb.fac = fac;
    lb.list = cards(fac);
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
    lb.idx = (lb.idx + d + n) % n;
    paint();
  }
  function paint() {
    var c = lb.list[lb.idx];
    var imgWrap = $("ex-lb-img");
    imgWrap.innerHTML = "";
    var img = new Image();
    img.className = "ex-lb-frame";
    img.alt = caption(c);
    img.onerror = function () {
      imgWrap.innerHTML = placeholder(c);
    };
    img.src = displayUrl(lb.fac, c.stem);
    imgWrap.appendChild(img);
    $("ex-lb-cap").textContent = caption(c);
    $("ex-lb-count").textContent = lb.idx + 1 + " / " + lb.list.length;
  }

  // ---- wire ----
  function mount() {
    // lightbox controls
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
    // swipe
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

    // initial tab from ?f= (deep-link from the faction Explore buttons), else first
    var q = (location.search.match(/[?&]f=([a-z]+)/) || [])[1];
    show(FACTIONS.indexOf(q) >= 0 ? q : FACTIONS[0]);
  }

  return { mount: mount };
})();
