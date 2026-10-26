#!/usr/bin/env bash
#
# sync_game.sh — refresh the gated game copy under game/ from the free-game repo.
#
# The free-game repo is READ-ONLY: this only reads it (git archive of the
# recorded commit — working-tree dirt is ignored, so the copy is reproducible
# and complete against that commit). It copies the built index.html + the
# referenced asset dirs + the Story data, cross-links the intro video to the
# free game's live same-origin URL (no 47MB in this repo), and injects the
# honest-door gate preamble. Idempotent: a clean rebuild each run.
#
# Runbook: README "Updating the gated game".

set -euo pipefail

GAME_REPO="${GAME_REPO:-$HOME/Projects/divya-yuddha}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$SITE_REPO/game"
VIDEO_URL="https://sangbaran-purr.github.io/divya-yuddha/assets/video/"
VFX_URL="https://sangbaran-purr.github.io/divya-yuddha/assets/vfx/"
ASSET_URL="https://sangbaran-purr.github.io/divya-yuddha/assets/" # M-F4e: base for the heavy-dir cross-links
NS_PREFIX="dyw::"
# M-F4e (deploy-weight fix): the heavy asset dirs are NO LONGER copied. 184MB of card/img/audio/board/story/thumb
# copies pushed the Pages artifact to 262MB and timed the deploy out at ~11min. Same proven pattern as video (47MB)
# + vfx (285MB): each heavy dir's base path is cross-linked to the free game's live Pages origin (they stream
# same-origin from there). ONLY assets/vendor (the ~780KB pixi runtime) is still copied. See the cross-link block.
# M-P2 (owner-ruled D1): src/engine.js is archived as a STANDALONE byte-identical copy (game/src/engine.js) — the
# multiplayer wrapper in mp/ (which lives OUTSIDE game/ and survives this sync) loads it. Same archive commit as the
# inlined engine in index.html, so the two are byte-identical; refreshed every sync; guarded below (never silently skip).
# HALL-SYNC-1: assets/manifest/ (~73MB — the export premium effects + the 20 Hero actors at both rungs, registry.json,
# factionfx.json) joins the heavy-dir cross-link loop, NOT the archive. The game builds every manifest URL from ONE base
# (FX.base) via new URL(rel, base), so rewriting that base cross-links the whole tree; asserted exactly once below.
# SYNC-NARRATOR-1: src/narrator.js is archived too — the battle-log narrator (game GL-1..3). index.html loads it; without it
# the recorder switches itself off and the Hall's wire faces carry no VIEW BATTLE LOG. Guarded below, like the engine copy.
ARCHIVE_PATHS="index.html src/chapters.js src/engine.js src/narrator.js assets/vendor"

if [ ! -f "$GAME_REPO/index.html" ] || [ ! -d "$GAME_REPO/assets/cards" ]; then
  echo "error: GAME_REPO does not look like the game ($GAME_REPO)" >&2
  exit 1
fi

# SITE-AUDIT-1 — GAME_REF pins the archived commit (default HEAD, unchanged). Used to re-apply an injection change
# without moving the game copy off the ruled export commit (e.g. GAME_REF=07c3530 bash scripts/sync_game.sh).
GAME_REF="${GAME_REF:-HEAD}"
SRC_COMMIT="$(git -C "$GAME_REPO" rev-parse "$GAME_REF")"
SRC_SHORT="$(git -C "$GAME_REPO" rev-parse --short "$GAME_REF")"
SRC_DATE="$(git -C "$GAME_REPO" show -s --format=%ci "$SRC_COMMIT")"
SRC_DIRTY="$(git -C "$GAME_REPO" status --short | wc -l | tr -d ' ')"

echo "sync_game: source $SRC_SHORT ($SRC_DATE)"

rm -rf "$DEST"
mkdir -p "$DEST"

git -C "$GAME_REPO" archive --format=tar "$SRC_COMMIT" $ARCHIVE_PATHS | tar -x -C "$DEST"

if [ ! -f "$DEST/index.html" ]; then
  echo "error: archive did not produce index.html" >&2
  exit 1
fi
# M-P2 (owner-ruled D1) — the standalone engine copy for the mp/ wrapper MUST be present. Fail loudly, never skip.
if [ ! -f "$DEST/src/engine.js" ]; then
  echo "error: archive did not produce src/engine.js (the M-P2 wrapper engine copy) — aborting" >&2
  exit 1
fi
# SYNC-NARRATOR-1 — the battle log's narrator MUST be present: the page would still boot without it, but its recorder
# would switch off in silence and every wire result face would lose VIEW BATTLE LOG. Fail loudly, never skip.
if [ ! -f "$DEST/src/narrator.js" ]; then
  echo "error: archive did not produce src/narrator.js (the battle-log narrator) — aborting" >&2
  exit 1
fi
# S-HALL-FREE-1 (R2) — THE PIN, beside the copy. The Hall lazy-loads this engine to play a FREE (mirror) match, and
# an engine it cannot vouch for is an engine it must not play. The web3 match server has carried such a pin since
# M-P3 (engineguard); the site had none. Written here, by the one road that produces the copy, so the pin can never
# drift from the bytes it names.
shasum -a 256 "$DEST/src/engine.js" | cut -d" " -f1 > "$DEST/src/engine.sha256"
echo "engine pin: $(cat "$DEST/src/engine.sha256")"

BEFORE="$(grep -c ": 'assets/video/';" "$DEST/index.html" || true)"
if [ "$BEFORE" != "1" ]; then
  echo "error: expected exactly one VIDEO_BASE web branch, found $BEFORE (game changed its video wiring)" >&2
  exit 1
fi
sed "s#: 'assets/video/';#: '$VIDEO_URL';#" "$DEST/index.html" > "$DEST/index.html.v"
mv "$DEST/index.html.v" "$DEST/index.html"
if [ "$(grep -c "$VIDEO_URL';" "$DEST/index.html")" -lt "1" ]; then
  echo "error: video cross-link rewrite failed" >&2
  exit 1
fi

# VFX cross-link (S8 WORD 1): the sheet-URL builders anchor on 'assets/vfx/ — rewrite the base to the free game's
# live Pages origin so the 285MB sheet set streams same-origin instead of being copied. Same guard style as the
# video: assert the EXACT match count and fail loudly if the pattern drifts. There are FIVE refs (3 sheet builders
# mvURL / sheetURL / stillURL + 2 reduced-motion layer PNGs 'assets/vfx/layers/ — ramanaam_wash, kishkindhaoath_ring;
# the sed base-rewrite cross-links all five to the free game's live Pages, so the count is 5. (Recalibrated 3->5 after
# the guard correctly fired on the Rama Naam + Kishkindha Oath reduced-motion additions — both verified 200 on Pages.)
VFX_BEFORE="$(grep -o "'assets/vfx/" "$DEST/index.html" | wc -l | tr -d ' ')"
if [ "$VFX_BEFORE" != "5" ]; then
  echo "error: expected exactly five 'assets/vfx/ refs (3 sheet builders + 2 reduced-motion layer PNGs), found $VFX_BEFORE (game changed its VFX wiring)" >&2
  exit 1
fi
sed "s#'assets/vfx/#'$VFX_URL#g" "$DEST/index.html" > "$DEST/index.html.v"
mv "$DEST/index.html.v" "$DEST/index.html"
if [ "$(grep -o "'$VFX_URL" "$DEST/index.html" | wc -l | tr -d ' ')" != "5" ]; then
  echo "error: VFX cross-link rewrite did not produce 5 absolute refs" >&2
  exit 1
fi
if [ "$(grep -c "'assets/vfx/" "$DEST/index.html")" != "0" ]; then
  echo "error: VFX cross-link left a relative 'assets/vfx/ reference behind" >&2
  exit 1
fi

# ── M-F4e HEAVY-DIR CROSS-LINK (cards/img/audio/thumbs/board/story + manifest, HALL-SYNC-1) ──
# These dirs are no longer archived; their base paths are rewritten to the free game's live Pages origin so they
# stream same-origin. The bases appear in mixed contexts (single/double quotes AND backtick templates, e.g.
# cardArtSrc and cutImgUrl), so we rewrite the BARE substring "assets/<dir>/" — catching every context. The
# trailing slash + the "assets/" prefix keep the rewrites disjoint (assets/img/board_x.jpg is NOT assets/board/).
# Each is guarded: at least one relative ref must exist and EVERY one must become absolute, else fail loudly.
for B in cards img audio thumbs board story manifest; do
  REL="$(grep -oF "assets/$B/" "$DEST/index.html" | wc -l | tr -d ' ')"
  if [ "$REL" = "0" ]; then
    echo "error: no relative assets/$B/ references to cross-link (game asset wiring changed)" >&2
    exit 1
  fi
  sed "s#assets/$B/#${ASSET_URL}$B/#g" "$DEST/index.html" > "$DEST/index.html.x"
  mv "$DEST/index.html.x" "$DEST/index.html"
  ABS="$(grep -oF "${ASSET_URL}$B/" "$DEST/index.html" | wc -l | tr -d ' ')"
  if [ "$ABS" != "$REL" ]; then
    echo "error: assets/$B/ cross-link — expected $REL absolute refs, got $ABS" >&2
    exit 1
  fi
  echo "sync_game: cross-linked assets/$B/ -> ${ASSET_URL}$B/ ($REL refs)"
done
# HALL-SYNC-1 — THE MANIFEST BASE: every export URL (registry, faction effects, effect + actor specs and atlases) resolves
# against the ONE FX.base declaration. Assert it is exactly one and absolute to the free game's origin; if the game ever
# moves or renames the base, fail loudly rather than ship a base that 404s into the classic fallback in silence.
if [ "$(grep -oF "base:'${ASSET_URL}manifest/'" "$DEST/index.html" | wc -l | tr -d ' ')" != "1" ]; then
  echo "error: expected exactly one base:'${ASSET_URL}manifest/' after the rewrite (game moved its manifest base)" >&2
  exit 1
fi
echo "sync_game: manifest base -> ${ASSET_URL}manifest/ (exactly one)"
# re-run / nesting safety: no doubled origin anywhere
if [ "$(grep -c "${ASSET_URL}${ASSET_URL}" "$DEST/index.html")" != "0" ]; then
  echo "error: an asset base was double-prefixed (URL nesting) — aborting" >&2
  exit 1
fi

PRE="$(mktemp)"
cat > "$PRE" <<'PREAMBLE'
<!-- DYW-GATE-START (injected by scripts/sync_game.sh; re-sync replaces this block) -->
<script>
(function(){
  var dailyFrame = false; /* MINI-GAMES-1 Daily Puzzle Effects R2: the free Daily Puzzle frames this copy in puzzle mode (?puzzle=1) from /play/daily/ on THIS origin. That frame alone skips the pass; nothing else does (a direct visit, any other frame, any other page). */
  try { dailyFrame = window.top !== window && /[?&]puzzle=1(&|$)/.test(location.search) && window.parent.location.origin === location.origin && /^\/play\/daily\//.test(window.parent.location.pathname); } catch (e) { dailyFrame = false; }
  /* GUEST-PLAY-1 (owner ruling 2026-10-26): free play needs no wallet and no pass - the courtesy redirect to the rite is
     GONE. The Hall keeps its own gate (wallet + Torana) and the match server its own check; neither lives here. */
  var NS = "dyw::";
  try {
    var real = window.localStorage;
    var shim = {
      getItem: function(k){ return real.getItem(NS + k); },
      setItem: function(k, v){ real.setItem(NS + k, v); },
      removeItem: function(k){ real.removeItem(NS + k); },
      clear: function(){ var i, ks = []; for (i = 0; i < real.length; i++){ var kk = real.key(i); if (kk && kk.indexOf(NS) === 0) ks.push(kk); } for (i = 0; i < ks.length; i++) real.removeItem(ks[i]); },
      key: function(n){ var i, c = 0; for (i = 0; i < real.length; i++){ var kk = real.key(i); if (kk && kk.indexOf(NS) === 0){ if (c === n) return kk.slice(NS.length); c++; } } return null; }
    };
    Object.defineProperty(shim, "length", { get: function(){ var i, c = 0; for (i = 0; i < real.length; i++){ var kk = real.key(i); if (kk && kk.indexOf(NS) === 0) c++; } return c; } });
    Object.defineProperty(window, "localStorage", { configurable: true, value: shim });
  } catch (e) {}
  function addGem(){
    if (document.getElementById("dyw-gate-return")) return;
    if (window.top !== window && /[?&]wire=1(&|$)/.test(location.search)) return; /* S-HALL-WIRE-1 (R5): never inside the Hall's battle frame - a tap would navigate the battle away mid-match */
    if (dailyFrame) return; /* MINI-GAMES-1: nor inside the Daily Puzzle's frame - the page around it is the way back */
    var a = document.createElement("a");
    a.id = "dyw-gate-return";
    a.href = "../index.html";
    a.title = "Return to the Gate";
    a.setAttribute("aria-label", "Return to the Gate");
    a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.9 6.4 19.7l1.3-6.3L2.9 9.2l6.4-.7z" fill="none" stroke="#d9a84e" stroke-width="1.3"/></svg>';
    var s = a.style;
    s.position = "fixed"; s.zIndex = "2147483000";
    s.bottom = "calc(env(safe-area-inset-bottom, 0px) + 10px)";   /* S-STAR-POS-1: bottom-left (was top-left) — clear of the game's top-left back buttons + top-right gear */
    s.left = "calc(env(safe-area-inset-left, 0px) + 10px)";
    s.width = "34px"; s.height = "34px"; s.display = "flex";
    s.alignItems = "center"; s.justifyContent = "center";
    s.borderRadius = "50%"; s.background = "rgba(11,10,8,0.55)";
    s.border = "1px solid rgba(138,111,58,0.5)";
    s.backdropFilter = "blur(3px)"; s.webkitBackdropFilter = "blur(3px)";
    s.opacity = "0.55"; s.transition = "opacity 150ms ease"; s.textDecoration = "none";
    a.addEventListener("mouseenter", function(){ s.opacity = "1"; });
    a.addEventListener("mouseleave", function(){ s.opacity = "0.55"; });
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addGem);
  else addGem();
  /* GUEST-PLAY-1 — THE solo_start TAG, moved here from the rite's Enter (owner ruling 2026-10-26): ONE tag-only
     Plausible event the first time this browser starts a battle (a quick battle or a story chapter). The store's
     zero-PII law, as js/solotrack.js: only the three utm values travel (from this URL, the demo page around it, or the
     site's own session key), nothing else. Never inside the Hall's battle frame or the Daily Puzzle's (not solo play).
     The script and the switch are config.js's analytics block (tests/suites/guestplay.js pins them equal). A blocked or
     failed tag is a silent no-op that can never stand between the player and the battle. */
  var SOLO_TAG = { enabled: true, script: "https://plausible.io/js/pa-sJ1oC1_YVyaxd2ADo13iV.js" };
  var wireFrame = false; try { wireFrame = window.top !== window && /[?&]wire=1(&|$)/.test(location.search); } catch (e) { wireFrame = true; }
  function soloTags(){
    var F = ["utm_source", "utm_medium", "utm_campaign"], qs = [location.search], out = {}, got = null, raw = null;
    try { if (window.top !== window && window.parent.location.origin === location.origin) qs.push(window.parent.location.search); } catch (e) {}
    for (var i = 0; i < qs.length && !got; i++) {
      var any = false, f = {};
      for (var j = 0; j < F.length; j++) { var m = String(qs[i] || "").match(new RegExp("[?&]" + F[j] + "=([^&#]*)")); if (m) { any = true; try { f[F[j]] = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { f[F[j]] = m[1]; } } }
      if (any) got = f;
    }
    if (!got) { try { raw = sessionStorage.getItem("dystore::utm"); got = raw ? JSON.parse(raw) : null; } catch (e) { got = null; } }
    if (!got || typeof got !== "object") return out;
    for (var k = 0; k < F.length; k++) { var v = got[F[k]]; if (typeof v === "string" && v !== "" && !/0x[0-9a-fA-F]{40}/.test(v)) out[F[k]] = v; }
    return out;
  }
  function soloStartOnce(){
    if (dailyFrame || wireFrame || !SOLO_TAG.enabled) return;
    try { if (real.getItem(NS + "dy_solo_started")) return; real.setItem(NS + "dy_solo_started", "1"); } catch (e) { return; }
    try {
      var w = window;
      w.plausible = w.plausible || function () { (w.plausible.q = w.plausible.q || []).push(arguments); };
      w.plausible.init = w.plausible.init || function (o) { w.plausible.o = o || {}; };
      w.plausible.init({ autoCapturePageviews: false });
      w.plausible("solo_start", { props: soloTags() });
      var sc = document.createElement("script"); sc.async = true; sc.src = SOLO_TAG.script; document.head.appendChild(sc);
    } catch (e) {}
  }
  function wrapStarts(){
    ["startGame", "startStoryChapter"].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== "function" || orig.__dywSolo) return;
      var wrapped = function () { soloStartOnce(); return orig.apply(this, arguments); };
      wrapped.__dywSolo = true;
      window[name] = wrapped;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrapStarts);
  else wrapStarts();
})();
</script>
<!-- DYW-S3-SUPPRESS-START (S8 WORD 2; re-applied every sync). Hide the free-platform economy surfaces.
     Game logic stays byte-faithful: CSS display:none on ids/classes + a DOM currency scrubber, no source edit.
     KEPT VISIBLE (ruled): the Collection gallery as a viewer, and the XP + LEVEL progression lines. -->
<style id="dyw-s3-suppress">
  /* (1) Ratna Vault — the whole screen (tabs/grid/gate/season/set/back live inside it) + landing entry + buy buttons */
  #vault, #mode-vault, .vault-buy { display: none !important; }
  /* (2) buy/acquire entry points (collection PIN + BUY both carry .cc-pin) + the collection wallet readout */
  #col-wallet, .cc-pin { display: none !important; }
  /* (3) landing wallet rows (coins/Amsha) + the Sadhana pin card + its picker overlay */
  .lp-wallet, #lp-sadhana, #sadhanapick { display: none !important; }
</style>
<script>
(function(){
  // (4)+(5) amount-level scrub — earn-stamp currency chips and quest reward currency; XP is KEPT.
  function scrub(){
    try {
      var chips = document.querySelectorAll(".earn-chip"); // "+N XP" kept; "◉N"/"✦N"/"Sadhana +N" removed
      for (var i = 0; i < chips.length; i++){ var t = (chips[i].textContent || "").trim();
        if (t.charAt(0) === "◉" || t.charAt(0) === "✦" || t.indexOf("Sadhana") === 0) chips[i].remove(); }
      var qs = document.querySelectorAll(".q-reward"); // "+N coins · +N Amsha · +N XP" -> "+N XP"
      for (var j = 0; j < qs.length; j++){ var s = qs[j].textContent || "";
        var m = s.replace(/\+\d+\s*coins\s*·\s*\+\d+\s*Amsha\s*·\s*/, ""); if (m !== s) qs[j].textContent = m; }
    } catch (e) {}
  }
  // (6) SITE-AUDIT-1 — the game's Store roundels read "Store — coming soon", but on this site the Store is LIVE
  //     (../store.html). Relink them: a capture-phase listener reaches the click before the game's own onclick toast,
  //     and the lock glyph + "coming soon" title are dropped. Navigates the TOP window (the game may sit in a frame).
  function storeRoundels(){ return document.querySelectorAll('.roundel[title^="Store"]'); }
  function relinkStore(){
    try {
      var rs = storeRoundels();
      for (var k = 0; k < rs.length; k++){ var r = rs[k];
        r.classList.remove("locked"); r.removeAttribute("data-soon"); r.title = "Store"; r.setAttribute("aria-label", "Store");
        var lk = r.querySelector(".rlock"); if (lk) lk.remove(); }
    } catch (e) {}
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.roundel[title^="Store"]') : null;
    if (!t) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var to = new URL("../store.html", location.href).href;
    try { window.top.location.href = to; } catch (err) { location.href = to; }
  }, true);
  var pending = false;
  function schedule(){ if (pending) return; pending = true; requestAnimationFrame(function(){ pending = false; scrub(); relinkStore(); }); }
  function boot(){ scrub(); relinkStore(); try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
</script>
<!-- DYW-S3-SUPPRESS-END -->
<!-- HONEST-DOOR: this is a courtesy redirect + storage namespace, NOT security.
     The game is free elsewhere by design; there is no DRM here. -->
<!-- DYW-GATE-END -->
PREAMBLE

awk -v pf="$PRE" 'BEGIN{ done=0 } { print } (done==0 && $0 ~ /<meta charset/){ while((getline l < pf) > 0) print l; close(pf); done=1 }' "$DEST/index.html" > "$DEST/index.html.p"
mv "$DEST/index.html.p" "$DEST/index.html"
rm -f "$PRE"

if [ "$(grep -c "DYW-GATE-START" "$DEST/index.html")" != "1" ]; then
  echo "error: gate preamble injection failed" >&2
  exit 1
fi
if [ "$(grep -c "DYW-S3-SUPPRESS-START" "$DEST/index.html")" != "1" ]; then
  echo "error: S3 economy-suppression block injection failed" >&2
  exit 1
fi

GAME_BYTES="$(du -sk "$DEST" | cut -f1)"

# GUEST-PLAY-1 — THE COPY ID: the stamp moves when the copy's BYTES move (a new source commit OR a changed injected
# block). The source short sha alone stood still when only the injected block changed, so a browser's cached copy would
# have kept the old block. 7 hex of the sha-256 of the final index.html (every injection is done above this line).
COPY_ID="$(shasum -a 256 "$DEST/index.html" | cut -c1-7)"
if ! printf '%s' "$COPY_ID" | grep -qE '^[0-9a-f]{7}$'; then echo "error: could not compute the copy id" >&2; exit 1; fi
cat > "$DEST/SNAPSHOT.md" <<SNAP
# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: \`$SRC_COMMIT\` ($SRC_SHORT)
- Source committed: $SRC_DATE
- Copy id (the stamp, GUEST-PLAY-1): \`$COPY_ID\` — 7 hex of the sha-256 of game/index.html
- Method: \`git archive\` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble AND the S3 economy-suppression block, injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- src/engine.js (M-P2 D1 — STANDALONE byte-identical engine copy for the mp/ multiplayer wrapper; same commit as the inlined engine, so byte-identical; guarded — the sync aborts if the archive did not carry it)
- src/narrator.js (SYNC-NARRATOR-1 — the battle-log narrator index.html loads: the recorder and the VIEW BATTLE LOG panel on the result faces read it; guarded — the sync aborts if the archive did not carry it)
- assets/vendor (pixi runtime, ~780KB — the only heavy dir still copied)

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL ($VIDEO_URL); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- assets/vfx/ (~285MB, S8 WORD 1) — NOT copied. The FIVE 'assets/vfx/ refs (3 sheet-URL builders mvURL/sheetURL/stillURL + 2 reduced-motion layer PNGs, ramanaam_wash + kishkindhaoath_ring) are rewritten from 'assets/vfx/ to the free game's live Pages URL ($VFX_URL); VFX sheets + layers stream same-origin. Guarded: the sync fails if the ref count is not exactly 5.
- assets/manifest (~73MB, HALL-SYNC-1) — NOT copied. The export premium effects (Vajra, Sudarshana chain, Pashupatastra, Brahmastra) and the 20 Hero actors at both rungs, plus registry.json + factionfx.json. Every manifest URL resolves against the game's single FX.base, rewritten to ${ASSET_URL}manifest/ in the heavy-dir loop below; guarded: exactly one absolute base after the rewrite, else the sync aborts. The free game's Pages serves CORS (access-control-allow-origin: *), so the fetches decode cleanly; a missing asset fails open to the classic sprite (the game's own law).
- assets/cards (~73MB) + assets/img (~80MB) + assets/audio (~2MB) + assets/thumbs (~4MB) + assets/board (~12MB) + assets/story (~13MB) — NOT copied (M-F4e). ~184MB of asset copies pushed the Pages artifact to 262MB and timed the deploy out at ~11min. Each base path (assets/<dir>/) is rewritten — every context, quoted or backtick-templated — to the free game's live Pages origin ($ASSET_URL<dir>/) so the assets stream same-origin. Guarded per dir: at least one relative ref must exist and EVERY one must become absolute; a double-prefix aborts. Gameplay is byte-faithful — only asset origins change.
- .DS_Store — not in the commit; never copied.

## S3 economy suppression (marker: DYW-S3-SUPPRESS-START / -END; S8 WORD 2)
- CSS display:none: the Ratna Vault (#vault + #mode-vault + .vault-buy), buy/acquire entry points (.cc-pin) + #col-wallet, landing wallet rows (.lp-wallet) + #lp-sadhana + #sadhanapick.
- DOM scrubber: coins/Amsha/Sadhana amounts removed from earn stamps (.earn-chip) and quest rewards (.q-reward); XP and LEVEL lines are kept (ruled progression). Game logic is byte-faithful — no source edit.
- KEPT VISIBLE: the Collection gallery (as a card viewer).

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- GUEST-PLAY-1 (owner ruling 2026-10-26): NO pass check and NO redirect - free play needs no wallet. (Until then: no site pass -> redirect to ../rite.html, a courtesy redirect, never security.) The Hall keeps its own gate (wallet + Torana) and the match server its own check.
- The solo_start tag (GUEST-PLAY-1): one tag-only Plausible event the first time this browser starts a battle; utm values only; never in the Hall's or the Daily Puzzle's frame.
- localStorage namespace shim (prefix "$NS_PREFIX"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (bottom-left, safe-area aware). Skipped when the page is framed with ?wire=1 (the Hall's battle frame): a tap there would navigate the battle away mid-match (S-HALL-WIRE-1 R5).
- MINI-GAMES-1 Daily Puzzle Effects R2: the free Daily Puzzle (/play/daily/) frames this copy with ?puzzle=1. That frame — same origin, parent under /play/daily/ — skips the gem (the page around it is the way back) and the solo_start tag.

## Notes at sync time
- Source working tree dirty files: $SRC_DIRTY (ignored by the archive method).
- game/ in-repo size: ${GAME_BYTES} KB.

## Entry-link stamps (S8 flag-1)
- The twenty-two site->game links (rite.html x5, index.html x3, treasury.html x2, demo/index.html x2, store.html x2, explore.html x2, mint.html x2, dashboard.html x2, my-invites.html x2) are stamped game/index.html?v=$COPY_ID — the COPY ID (GUEST-PLAY-1): the first 7 hex of the sha-256 of this game/index.html, so they change exactly when the copy's BYTES change (a new source commit OR a changed injected block). The sync fails if the link count is not exactly 22.

## STAMP (S-HALL-WIRE-1 R4)
- game/STAMP holds the copy id ($COPY_ID), plain text (the source commit is recorded above). The Hall reads it (no-store) to build its battle frame's URL (../game/index.html?v=<sha>&wire=1), so the frame is bound to these bytes without mp/ joining the entry-link ledger: STAMP is a file the sync owns, not a link in mp/.

## Refresh
    bash scripts/sync_game.sh
SNAP

# S-HALL-WIRE-1 (R4) — THE STAMP. The Hall's battle frame must load THESE bytes: a cached pre-wire copy would never
# answer wire:ready. mp/ stays outside the entry-link ledger (S-HALL-ENTRY-1 R2), so the Hall cannot carry a stamped
# link; instead the sync writes the short sha beside the copy and the Hall reads it (no-store) at mount. A file the
# sync owns — never a link in mp/, never parsed out of SNAPSHOT.md. Guarded like every other sync output.
printf '%s\n' "$COPY_ID" > "$DEST/STAMP"
if [ "$(cat "$DEST/STAMP")" != "$COPY_ID" ] || ! grep -qE '^[0-9a-f]{7,}$' "$DEST/STAMP"; then
  echo "error: game/STAMP was not written as the copy id" >&2
  exit 1
fi
echo "sync_game: STAMP -> $COPY_ID (copy id; source $SRC_SHORT)"
# S-HALL-WIRE-1 (R5) — the gate gem must skip the Hall's battle frame; assert the skip line landed exactly once.
if [ "$(grep -c 'nor inside the Daily Puzzle' "$DEST/index.html")" != "1" ] || [ "$(grep -c 'var dailyFrame = false;' "$DEST/index.html")" != "1" ]; then
  echo "error: the Daily Puzzle frame's road is missing from the injected preamble" >&2
  exit 1
fi
# GUEST-PLAY-1 — the courtesy redirect is GONE: no pass check and no bounce to the rite may survive in the copy
if [ "$(grep -c 'location.replace("../rite.html")' "$DEST/index.html")" != "0" ] || [ "$(grep -c 'sessionStorage.getItem("dyw_pass")' "$DEST/index.html")" != "0" ]; then
  echo "error: the free-play redirect to the rite is still in the copy (GUEST-PLAY-1 removed it)" >&2
  exit 1
fi
if [ "$(grep -c 'GUEST-PLAY-1 — THE solo_start TAG' "$DEST/index.html")" != "1" ]; then
  echo "error: the solo_start tag is missing from the injected preamble" >&2
  exit 1
fi
if [ "$(grep -c 'S-HALL-WIRE-1 (R5): never inside the Hall' "$DEST/index.html")" != "1" ]; then
  echo "error: the gate gem's battle-frame skip is missing from the injected preamble" >&2
  exit 1
fi

# STAMP THE SITE-TO-GAME ENTRY LINKS (S8 flag-1): bind the twenty game/index.html links to the synced HEAD short sha,
# so browsers refetch the gated entry exactly when the copy changes (stamps bind to bytes). Guarded: assert exactly
# twenty links, fail loudly on drift. Handles re-runs — an existing ?v=<oldsha> is rewritten to the new sha.
# (S-DEMO-1: treasury.html's bare link + the new unlisted demo/index.html joined the managed set — 5 -> 7. S-PLAY-2
#  (owner ruling A): store.html + explore.html + mint.html header-nav Game links joined — 7 -> 10. The perl match
#  starts at 'game/index.html', so demo's '../' prefix is preserved.)
# (S-SYNC-GUARD-1: the house-nav mobile dropdown duplicated "The Game" on six pages [rite/index/treasury/store/
#  explore/mint each +1 -> 16], and dashboard.html + register.html joined via S-DASH-NAV-1 / S-REG-NAV [+2 each].
#  Managed set now 9 pages / 20 links — every gated-game linker gets its stamp bound to the game bytes.)
# (MINI-GAMES-1, owner ruling 2026-10-15: my-invites.html [+2, its house-nav "The Game" links] joined — it was added
#  after the ledger was set and had been left behind. Managed set now 10 pages / 22 links. tests/suites/siteaudit.js
#  SY1 fails if any site page that links the game is missing from ENTRY_FILES — mp/ excepted: the Hall reads
#  game/STAMP and carries no stamped link of its own.)
# (ICO-SIMPLE-1, owner rulings 2026-10-25: register.html became a bare redirect to the dashboard's buy panel and links
#  the game nowhere — it LEFT the ledger [-2]. Managed set now 9 pages / 20 links.)
# (GUEST-PLAY-1, owner rulings 2026-10-26: the rite's "Play free" button [+1] and the demo's "Play free" [+1] now go to the
#  game. Managed set now 9 pages / 22 links. The stamp is the COPY ID — it moves when the copy's bytes do.)
ENTRY_FILES="$SITE_REPO/rite.html $SITE_REPO/index.html $SITE_REPO/treasury.html $SITE_REPO/demo/index.html $SITE_REPO/store.html $SITE_REPO/explore.html $SITE_REPO/mint.html $SITE_REPO/dashboard.html $SITE_REPO/my-invites.html"
LINKS_BEFORE="$(grep -oF 'game/index.html' $ENTRY_FILES | wc -l | tr -d ' ')"
if [ "$LINKS_BEFORE" != "22" ]; then
  echo "error: expected exactly 22 site->game entry links (rite.html x5 + index.html x3 + treasury.html x2 + demo/index.html x2 + store.html x2 + explore.html x2 + mint.html x2 + dashboard.html x2 + my-invites.html x2), found $LINKS_BEFORE (site nav changed)" >&2
  exit 1
fi
SHA="$COPY_ID" perl -i -pe 's{game/index\.html(\?v=[0-9a-f]+)?}{game/index.html?v=$ENV{SHA}}g' $ENTRY_FILES
LINKS_STAMPED="$(grep -oF "game/index.html?v=$COPY_ID" $ENTRY_FILES | wc -l | tr -d ' ')"
if [ "$LINKS_STAMPED" != "22" ]; then
  echo "error: entry-link stamping did not produce 22 stamped links (got $LINKS_STAMPED)" >&2
  exit 1
fi
echo "sync_game: stamped 22 entry links -> game/index.html?v=$COPY_ID"

echo "sync_game: done. game/ = ${GAME_BYTES} KB (video + vfx + heavy dirs + manifest cross-linked, not copied)."
