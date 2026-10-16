/* MINI-GAMES-2 · SMRITI — THE BOARD LAYOUT. UMD: browser `window.DY_SMRITI_LAYOUT`, Node `require`. Pure: numbers in,
 * numbers out (CSS px), so the page and the tests place everything by the same rule.
 *
 * THE ART: wider-than-tall screens get the landscape board; taller-than-wide screens (phones) get the portrait board.
 * The board is scaled to fit the screen whole (no scrolling during play), leaving room below it for the line and the
 * button. Every edge is the one measured on the art (play/smriti/art/geometry.js, written by scripts/smriti_art.py).
 * THE CARDS sit inside the art's inner navy field only — in its SAFE area (the field inset clear of the corner
 * ornaments) — never over the frame, the banners or the emblems.
 * THE GRIDS: desktop is ruled (Easy 6×2, Medium 8×2, Hard 8×3); on phones each level takes, of every exact grid, the
 * one that gives the LARGEST cards inside the safe area (cards keep the frame's 5:7).
 * THE BANNERS: each has a medallion at its centre, so text sits in the zone left of it and the zone right of it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./art/geometry.js"));
  else root.DY_SMRITI_LAYOUT = factory(root.DY_SMRITI_ART);
})(typeof self !== "undefined" ? self : this, function (ART) {
  "use strict";
  var CARD_RATIO = 1.4;                                   // height / width (the card frame is 5:7)
  var DESKTOP = { easy: [6, 2], medium: [8, 2], hard: [8, 3] };
  var CHROME = { port: { side: 6, top: 6, below: 92 }, land: { side: 16, top: 12, below: 72 } };   // room for the line + the button

  function artFor(vw, vh) { return vw >= vh ? "land" : "port"; }
  function rect(a, s, ox, oy) { return { x: ox + a[0] * s, y: oy + a[1] * s, w: (a[2] - a[0]) * s, h: (a[3] - a[1]) * s }; }
  // the largest cards for n tiles in a box (cols × rows exact, 2..8 columns)
  function bestGrid(n, W, H, gap) {
    var best = null;
    for (var c = 2; c <= 8; c++) {
      if (n % c) continue;
      var r = n / c, w = Math.min((W - (c - 1) * gap) / c, ((H - (r - 1) * gap) / r) / CARD_RATIO);
      if (!best || w > best.cardW + 1e-9) best = { cols: c, rows: r, cardW: w };
    }
    return best;
  }
  function gridIn(safe, cols, rows, gap, cardW) {
    var w = cardW * cols + gap * (cols - 1), h = cardW * CARD_RATIO * rows + gap * (rows - 1);
    return { cols: cols, rows: rows, gap: gap, cardW: cardW, cardH: cardW * CARD_RATIO, w: w, h: h,
             x: safe.x + (safe.w - w) / 2, y: safe.y + (safe.h - h) / 2 };
  }
  // layout({vw, vh, pairs}) → { art, scale, board, field, safe, grid, bannerTop, bannerBottom, zonesTop, zonesBottom,
  //   epithetInBanner, rings? } — every rect in CSS px relative to the BOARD's top-left (board itself in page px)
  function layout(o) {
    var kind = artFor(o.vw, o.vh), G = ART[kind], ch = CHROME[kind], aw = G.size[0], ah = G.size[1];
    var s = Math.min((o.vw - 2 * ch.side) / aw, (o.vh - ch.top - ch.below) / ah);
    var board = { x: (o.vw - aw * s) / 2, y: ch.top, w: aw * s, h: ah * s };
    var field = rect(G.field, s, 0, 0), safe = rect(G.safe, s, 0, 0);
    var n = 2 * o.pairs, gap = Math.max(4, Math.round(safe.w * (kind === "port" ? 0.022 : 0.012)));
    var pick;
    if (kind === "land") {
      var lv = n === 12 ? "easy" : n === 16 ? "medium" : "hard", cr = DESKTOP[lv];
      pick = { cols: cr[0], rows: cr[1], cardW: Math.min((safe.w - (cr[0] - 1) * gap) / cr[0], ((safe.h - (cr[1] - 1) * gap) / cr[1]) / CARD_RATIO) };
    } else pick = bestGrid(n, safe.w, safe.h, gap);
    var out = { art: kind, scale: s, board: board, field: field, safe: safe, grid: gridIn(safe, pick.cols, pick.rows, gap, Math.floor(pick.cardW)),
                bannerTop: rect(G.bannerTop, s, 0, 0), bannerBottom: rect(G.bannerBottom, s, 0, 0),
                zonesTop: G.zonesTop.map(function (z) { return rect(z, s, 0, 0); }), zonesBottom: G.zonesBottom.map(function (z) { return rect(z, s, 0, 0); }) };
    // banner type: 38% of the banner's height; the epithet rides the top banner's right zone on desktop, below the board on phones
    out.bannerFont = Math.max(11, Math.round(Math.min(out.bannerTop.h * 0.46, out.zonesBottom[0].w / (9 * 0.66), 30)));   // fits "Tries: 99" in its zone
    out.epithetInBanner = kind === "land";
    out.epithetFont = Math.max(11, Math.min(Math.round(out.bannerTop.h * 0.3), Math.floor(out.zonesTop[1].w / (32 * 0.5))));
    if (kind === "port") out.rings = Object.keys(G.rings).map(function (k) { var r = G.rings[k]; return { k: k, x: r[0] * s, y: r[1] * s, r: r[2] * s, emblemR: G.emblems[k].to[2] * s }; });
    return out;
  }
  // the art file for this board (the narrowest that covers the drawn width at this device's pixel density)
  function artSrc(kind, drawnW, dpr) {
    var list = Object.keys(ART.files).filter(function (f) { return f.indexOf("board-" + kind + "-") === 0; })
      .map(function (f) { return { f: f, w: ART.files[f].w }; }).sort(function (a, b) { return a.w - b.w; });
    var need = drawnW * Math.min(3, dpr || 1);
    for (var i = 0; i < list.length; i++) if (list[i].w >= need) return list[i].f;
    return list[list.length - 1].f;
  }
  return { layout: layout, artFor: artFor, artSrc: artSrc, bestGrid: bestGrid, CARD_RATIO: CARD_RATIO, DESKTOP: DESKTOP, CHROME: CHROME, ART: ART };
});
