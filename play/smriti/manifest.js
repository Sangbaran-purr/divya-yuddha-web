/* lib/manifest.js — VFX-LAB-3. The ACTOR asset class (ruling A4), validated: real alpha (straight), normal blending, no
   vignette, trimmed rectangular cells with pivot data, cells at most 512 px, NO motion vectors. One manifest per card:
   { cardId, class:"actor", atlas, atlasSize{w,h}, alpha:"straight", blend:"normal", mv:false, vignette:false, cellMax:512,
     fps, facing:"left"|"right", mirror:true | variants:{left,right}, refHeight, cells:[{x,y,w,h,pivot{x,y}}],
     phases:{ emerge:[cell…], act:[cell…], fizzle:[cell…] }, contact? (index inside act), timing? "native"|"grammar",
     tempo? (the card's default, 0.25–4 — LAB-4d), phaseMs? { emerge, act } (phase lengths at tempo 1),
     rungs? [{ cellMax, atlas, atlasSize, refHeight, cells }] (LAB-5: the same cells packed smaller — the quality ladder),
     aim? "up" (LAB-6: the action points up its frame — descriptive only; every actor is drawn upright on both seats, owner ruling 2026-09-14),
     exit? "native" (LAB-8: the clip carries its own exit — no fizzle phase, ACT ends on the last cell), contactRule? (LAB-8, runtime: "nova" = a
     radial contact flash from the actor's centre), cellPx? (LAB-8: the real cell size when a pack needed cells below the 512 ceiling),
     contactStrength? { flash, impulse } (LAB-9: scales the contact's flash and the camera impulse — a self-cast is not a strike; absent = 1 and 1),
     travelScale? 0–1 (LAB-10: scales the actor's charge across the board — 0 performs where it stands; absent = 1, the charge as it always was) }
   validate(m) → { ok, errors[] }. defaultsFor({ manifest, registry, preset, override }) → the tempo and FIZZLE length a play starts
   from (LAB-4d). forRung(m, cellMax) → the manifest drawn from that rung's atlas; decodedBytes(m) → its RGBA size; pickRung({…})
   → which rung a device gets (LAB-5). Browser: window.ActorManifest. Node: require. */
(function (root) {
  'use strict';
  var PHASES = ['emerge', 'act', 'fizzle'];
  function validate(m) {
    var e = [];
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (!m || typeof m !== 'object') return { ok: false, errors: ['not an object'] };
    if (typeof m.cardId !== 'string' || !m.cardId) e.push('cardId missing');
    if (m.class !== 'actor') e.push('class must be "actor"');
    if (typeof m.atlas !== 'string' || !m.atlas) e.push('atlas missing');
    if (!m.atlasSize || !num(m.atlasSize.w) || !num(m.atlasSize.h) || m.atlasSize.w <= 0 || m.atlasSize.h <= 0) e.push('atlasSize missing');
    if (m.alpha !== 'straight') e.push('alpha must be "straight" (real alpha — A4; not brightness-to-alpha)');
    if (m.blend !== 'normal') e.push('blend must be "normal" (source-over — A4)');
    if (m.mv !== false) e.push('mv must be false (no motion vectors for actors — A4)');
    if (m.vignette !== false) e.push('vignette must be false (A4)');
    if (m.cellMax !== 512) e.push('cellMax must be 512 (A4)');
    if (!num(m.fps) || m.fps < 1 || m.fps > 60) e.push('fps must be 1–60');
    if (m.facing !== 'left' && m.facing !== 'right') e.push('facing must be "left" or "right"');
    if (m.mirror !== true && !(m.variants && m.variants.left && m.variants.right)) e.push('needs mirror:true or variants {left, right}');
    var cells = Array.isArray(m.cells) ? m.cells : null;
    if (!cells || !cells.length) e.push('cells missing');
    (cells || []).forEach(function (c, i) {
      if (!c || !num(c.x) || !num(c.y) || !num(c.w) || !num(c.h) || c.w <= 0 || c.h <= 0) { e.push('cell ' + i + ' rect invalid'); return; }
      if (c.w > 512 || c.h > 512) e.push('cell ' + i + ' exceeds 512 px (' + c.w + '×' + c.h + ')');
      if (m.atlasSize && (c.x < 0 || c.y < 0 || c.x + c.w > m.atlasSize.w || c.y + c.h > m.atlasSize.h)) e.push('cell ' + i + ' outside the atlas');
      if (!c.pivot || !num(c.pivot.x) || !num(c.pivot.y) || c.pivot.x < 0 || c.pivot.y < 0 || c.pivot.x > c.w || c.pivot.y > c.h) e.push('cell ' + i + ' pivot missing or outside its cell');
    });
    if (!num(m.refHeight) || m.refHeight <= 0) e.push('refHeight missing');
    PHASES.forEach(function (p) {
      var list = m.phases && m.phases[p];
      if (p === 'fizzle' && m.exit === 'native') { if (list != null) e.push('a native-exit actor has no fizzle phase (the clip carries its own exit)'); return; }   // LAB-8
      if (!Array.isArray(list) || !list.length) { e.push('phase ' + p + ' missing'); return; }
      list.forEach(function (ix) { if (!(Number.isInteger(ix) && cells && ix >= 0 && ix < cells.length)) e.push('phase ' + p + ' names cell ' + ix + ', which does not exist'); });
    });
    if (m.timing != null && m.timing !== 'native' && m.timing !== 'grammar') e.push('timing must be "native" or "grammar"');
    if (m.aim != null && m.aim !== 'up') e.push('aim must be "up" or absent');
    if (m.tempo != null && !(num(m.tempo) && m.tempo >= 0.25 && m.tempo <= 4)) e.push('tempo must be a number 0.25–4');
    if (m.phaseMs != null && !(m.phaseMs && num(m.phaseMs.emerge) && num(m.phaseMs.act) && m.phaseMs.emerge > 0 && m.phaseMs.act > 0)) e.push('phaseMs must give emerge and act lengths in ms');
    if (m.rungs != null) {
      if (!Array.isArray(m.rungs)) e.push('rungs must be a list');
      else m.rungs.forEach(function (r, k) {
        var tag = 'rung ' + k;
        if (!r || !num(r.cellMax) || !(r.cellMax < 512) || r.cellMax < 64) { e.push(tag + ' cellMax must be below 512'); return; }
        if (typeof r.atlas !== 'string' || !r.atlas) e.push(tag + ' atlas missing');
        if (!r.atlasSize || !num(r.atlasSize.w) || !num(r.atlasSize.h)) e.push(tag + ' atlasSize missing');
        if (!num(r.refHeight) || r.refHeight <= 0) e.push(tag + ' refHeight missing');
        if (!Array.isArray(r.cells) || !cells || r.cells.length !== cells.length) { e.push(tag + ' must hold every cell, in order'); return; }
        r.cells.forEach(function (c, i) {
          if (!c || !num(c.x) || !num(c.y) || !num(c.w) || !num(c.h) || c.w <= 0 || c.h <= 0) { e.push(tag + ' cell ' + i + ' rect invalid'); return; }
          if (c.w > r.cellMax || c.h > r.cellMax) e.push(tag + ' cell ' + i + ' exceeds ' + r.cellMax + ' px');
          if (r.atlasSize && (c.x < 0 || c.y < 0 || c.x + c.w > r.atlasSize.w || c.y + c.h > r.atlasSize.h)) e.push(tag + ' cell ' + i + ' outside its atlas');
          if (!c.pivot || !num(c.pivot.x) || !num(c.pivot.y) || c.pivot.x < 0 || c.pivot.y < 0 || c.pivot.x > c.w || c.pivot.y > c.h) e.push(tag + ' cell ' + i + ' pivot missing or outside its cell');
        });
      });
    }
    if (m.contact != null) { var act = m.phases && m.phases.act; if (!(Number.isInteger(m.contact) && Array.isArray(act) && m.contact >= 0 && m.contact < act.length)) e.push('contact must be a cell index inside the act phase'); }
    // LAB-8 · the native exit guard, the contact rule, the real cell size
    if (m.exit != null && m.exit !== 'native') e.push('exit must be "native" or absent (absent = the procedural faction dissolve)');
    if (m.exit === 'native') { var actL = m.phases && m.phases.act; if (!(Array.isArray(actL) && cells && actL.length && actL[actL.length - 1] === cells.length - 1)) e.push('a native-exit actor must end ACT on its last cell'); }
    if (m.contactRule != null && ['spear-tip', 'bolt-edge', 'ground-impact', 'nova'].indexOf(m.contactRule) < 0) e.push('contactRule must be spear-tip, bolt-edge, ground-impact or nova');
    if (m.contactStrength != null && !(typeof m.contactStrength === 'object' && ['flash', 'impulse'].every(function (k) { var v = m.contactStrength[k]; return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 4; })))
      e.push('contactStrength must give flash and impulse, each a number 0–4');
    if (m.travelScale != null && !(typeof m.travelScale === 'number' && isFinite(m.travelScale) && m.travelScale >= 0 && m.travelScale <= 1)) e.push('travelScale must be a number 0–1');
    if (m.cellPx != null && !(Number.isInteger(m.cellPx) && m.cellPx >= 256 && m.cellPx <= 512 && (cells || []).every(function (c) { return !c || (c.w <= m.cellPx && c.h <= m.cellPx); }))) e.push('cellPx must be the real cell size, 256–512, holding every cell');
    return { ok: e.length === 0, errors: e };
  }
  // LAB-8 · THE EXIT A PLAY TAKES: "native" only when the registry entry asks for it AND the manifest is a valid native-exit pack; the lab's
  // Exit preset preview (override) still plays the procedural dissolve, so the fallback can be compared; anything else is procedural.
  function exitMode(o) {
    o = o || {}; var m = o.manifest;
    if (!(o.entry && o.entry.exit === 'native')) return { exit: 'procedural', why: 'the registry names no native exit' };
    if (o.override) return { exit: 'procedural', why: 'Exit preset preview: ' + o.override };
    if (m && m.exit === 'native' && validate(m).ok) return { exit: 'native', why: 'the registry asks for it and the manifest is a native-exit pack' };
    return { exit: 'procedural', why: 'the registry asks for a native exit but the manifest is not a native-exit pack', error: true };
  }
  // LAB-4d · THE DEFAULTS A PLAY STARTS FROM, card-agnostic: tempo = the card's manifest tempo, else the registry's defaults block
  // (data/manifestations.json), else 1; FIZZLE = the exit preset's fizzle_ms, else the registry's defaults, else 600 ms. A session
  // override (the lab's sliders) wins over both. `base` is the default without the override; `from` says where each value came from.
  function defaultsFor(o) {
    o = o || {};
    var m = o.manifest || {}, d = (o.registry && o.registry.defaults) || {}, pr = o.preset || {}, ov = o.override || {};
    var pos = function (v) { return typeof v === 'number' && isFinite(v) && v > 0; };
    var t = pos(m.tempo) ? [m.tempo, 'manifest'] : pos(d.tempo) ? [d.tempo, 'defaults'] : [1, 'built-in'];
    var z = pos(pr.fizzle_ms) ? [pr.fizzle_ms, 'preset'] : pos(d.fizzle_ms) ? [d.fizzle_ms, 'defaults'] : [600, 'built-in'];
    return { tempo: pos(ov.tempo) ? ov.tempo : t[0], fizzleMs: pos(ov.fizzleMs) ? ov.fizzleMs : z[0], base: { tempo: t[0], fizzleMs: z[0] },
             from: { tempo: pos(ov.tempo) ? 'slider' : t[1], fizzleMs: pos(ov.fizzleMs) ? 'slider' : z[1] } };
  }
  // LAB-5 · THE QUALITY LADDER. forRung: the manifest as drawn from one rung (512 = the manifest itself). Cells shrink with the rung and
  // refHeight with them, so placement keeps the actor the same size on the board.
  function forRung(m, cellMax) {
    if (!m || !(cellMax < (m.cellMax || 512)) || !Array.isArray(m.rungs)) return m;
    var r = m.rungs.filter(function (x) { return x && x.cellMax === cellMax; })[0]; if (!r) return m;
    var out = {}; for (var k in m) out[k] = m[k];
    out.atlas = r.atlas; out.atlasSize = r.atlasSize; out.cells = r.cells; out.refHeight = r.refHeight; out.cellMax = r.cellMax; out.rung = r.cellMax;
    return out;
  }
  function rungsOf(m) { return [m && m.cellMax || 512].concat(((m && m.rungs) || []).map(function (r) { return r.cellMax; })); }
  function decodedBytes(m) { return m && m.atlasSize ? m.atlasSize.w * m.atlasSize.h * 4 : 0; }
  // which rung a device gets. 512 only for a GPU renderer on a high-density screen with no low-memory hint; 256 otherwise — a DPR-1
  // screen draws the actor at ~175 px, which 256 px cells already cover, and Canvas 2D takes 256 until a phone proves 512 holds 30 fps.
  function pickRung(o) {
    o = o || {}; var avail = o.available || [512], has = function (r) { return avail.indexOf(r) >= 0; };
    var ov = +o.override;
    if ((ov === 512 || ov === 256) && has(ov)) return { rung: ov, why: 'lab override' };
    if (!has(256)) return { rung: 512, why: 'only the 512 rung is packed' };
    if (o.backend === 'canvas2d' || !o.backend) return { rung: 256, why: 'Canvas 2D — the 256 rung is its default until a phone measures 512 at 30 fps or more' };
    if (typeof o.deviceMemory === 'number' && o.deviceMemory < 4) return { rung: 256, why: 'memory hint ' + o.deviceMemory + ' GB' };
    if (!(o.dpr >= 2)) return { rung: 256, why: 'devicePixelRatio ' + (o.dpr || 1) + ' — 256 px cells cover the drawn size' };
    return { rung: 512, why: 'GPU (' + o.backend + ') · devicePixelRatio ' + o.dpr + (typeof o.deviceMemory === 'number' ? ' · ' + o.deviceMemory + ' GB' : ' · no memory hint') };
  }
  // LAB-9 · how hard a contact lands: a card may soften (or sharpen) its flash and impulse; a card that names nothing lands as it always did
  // LAB-10 · how far the actor charges: a card may perform where it stands (0) or charge as it always did (absent, or 1)
  function travelScale(m) { return m && typeof m.travelScale === 'number' ? m.travelScale : 1; }
  function contactStrength(m) { var s = m && m.contactStrength; return { flash: s && typeof s.flash === 'number' ? s.flash : 1, impulse: s && typeof s.impulse === 'number' ? s.impulse : 1 }; }
  var OUT = { validate: validate, exitMode: exitMode, contactStrength: contactStrength, travelScale: travelScale, defaultsFor: defaultsFor, forRung: forRung, rungsOf: rungsOf, decodedBytes: decodedBytes, pickRung: pickRung, PHASES: PHASES };
  root.ActorManifest = OUT;
  if (typeof module !== 'undefined' && module.exports) module.exports = OUT;
})(typeof window !== 'undefined' ? window : this);
