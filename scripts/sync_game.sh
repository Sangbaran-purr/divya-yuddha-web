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
ARCHIVE_PATHS="index.html src/chapters.js assets/vendor"

if [ ! -f "$GAME_REPO/index.html" ] || [ ! -d "$GAME_REPO/assets/cards" ]; then
  echo "error: GAME_REPO does not look like the game ($GAME_REPO)" >&2
  exit 1
fi

SRC_COMMIT="$(git -C "$GAME_REPO" rev-parse HEAD)"
SRC_SHORT="$(git -C "$GAME_REPO" rev-parse --short HEAD)"
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

# ── M-F4e HEAVY-DIR CROSS-LINK (cards/img/audio/thumbs/board/story) ──
# These dirs are no longer archived; their base paths are rewritten to the free game's live Pages origin so they
# stream same-origin. The bases appear in mixed contexts (single/double quotes AND backtick templates, e.g.
# cardArtSrc and cutImgUrl), so we rewrite the BARE substring "assets/<dir>/" — catching every context. The
# trailing slash + the "assets/" prefix keep the rewrites disjoint (assets/img/board_x.jpg is NOT assets/board/).
# Each is guarded: at least one relative ref must exist and EVERY one must become absolute, else fail loudly.
for B in cards img audio thumbs board story; do
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
  try {
    if (!sessionStorage.getItem("dyw_pass")) { location.replace("../rite.html"); return; }
  } catch (e) { location.replace("../rite.html"); return; }
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
    var a = document.createElement("a");
    a.id = "dyw-gate-return";
    a.href = "../index.html";
    a.title = "Return to the Gate";
    a.setAttribute("aria-label", "Return to the Gate");
    a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.9 6.4 19.7l1.3-6.3L2.9 9.2l6.4-.7z" fill="none" stroke="#d9a84e" stroke-width="1.3"/></svg>';
    var s = a.style;
    s.position = "fixed"; s.zIndex = "2147483000";
    s.top = "calc(env(safe-area-inset-top, 0px) + 10px)";
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
  var pending = false;
  function schedule(){ if (pending) return; pending = true; requestAnimationFrame(function(){ pending = false; scrub(); }); }
  function boot(){ scrub(); try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
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

cat > "$DEST/SNAPSHOT.md" <<SNAP
# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: \`$SRC_COMMIT\` ($SRC_SHORT)
- Source committed: $SRC_DATE
- Method: \`git archive\` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble AND the S3 economy-suppression block, injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- assets/vendor (pixi runtime, ~780KB — the only heavy dir still copied)

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL ($VIDEO_URL); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- assets/vfx/ (~285MB, S8 WORD 1) — NOT copied. The FIVE 'assets/vfx/ refs (3 sheet-URL builders mvURL/sheetURL/stillURL + 2 reduced-motion layer PNGs, ramanaam_wash + kishkindhaoath_ring) are rewritten from 'assets/vfx/ to the free game's live Pages URL ($VFX_URL); VFX sheets + layers stream same-origin. Guarded: the sync fails if the ref count is not exactly 5.
- assets/cards (~73MB) + assets/img (~80MB) + assets/audio (~2MB) + assets/thumbs (~4MB) + assets/board (~12MB) + assets/story (~13MB) — NOT copied (M-F4e). ~184MB of asset copies pushed the Pages artifact to 262MB and timed the deploy out at ~11min. Each base path (assets/<dir>/) is rewritten — every context, quoted or backtick-templated — to the free game's live Pages origin ($ASSET_URL<dir>/) so the assets stream same-origin. Guarded per dir: at least one relative ref must exist and EVERY one must become absolute; a double-prefix aborts. Gameplay is byte-faithful — only asset origins change.
- .DS_Store — not in the commit; never copied.

## S3 economy suppression (marker: DYW-S3-SUPPRESS-START / -END; S8 WORD 2)
- CSS display:none: the Ratna Vault (#vault + #mode-vault + .vault-buy), buy/acquire entry points (.cc-pin) + #col-wallet, landing wallet rows (.lp-wallet) + #lp-sadhana + #sadhanapick.
- DOM scrubber: coins/Amsha/Sadhana amounts removed from earn stamps (.earn-chip) and quest rewards (.q-reward); XP and LEVEL lines are kept (ruled progression). Game logic is byte-faithful — no source edit.
- KEPT VISIBLE: the Collection gallery (as a card viewer).

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- Honest-door session check: no site pass -> redirect to ../rite.html. A courtesy redirect, not security.
- localStorage namespace shim (prefix "$NS_PREFIX"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (top-left, safe-area aware).

## Notes at sync time
- Source working tree dirty files: $SRC_DIRTY (ignored by the archive method).
- game/ in-repo size: ${GAME_BYTES} KB.

## Entry-link stamps (S8 flag-1)
- The ten site->game links (rite.html x3, index.html x2, treasury.html x1, demo/index.html x1, store.html x1, explore.html x1, mint.html x1) are stamped game/index.html?v=$SRC_SHORT — bound to this HEAD short sha, so they change exactly when the copy changes. The sync fails if the link count is not exactly 10.

## Refresh
    bash scripts/sync_game.sh
SNAP

# STAMP THE SITE-TO-GAME ENTRY LINKS (S8 flag-1): bind the ten game/index.html links to the synced HEAD short sha,
# so browsers refetch the gated entry exactly when the copy changes (stamps bind to bytes). Guarded: assert exactly
# ten links, fail loudly on drift. Handles re-runs — an existing ?v=<oldsha> is rewritten to the new sha.
# (S-DEMO-1: treasury.html's bare link + the new unlisted demo/index.html joined the managed set — 5 -> 7. S-PLAY-2
#  (owner ruling A): store.html + explore.html + mint.html header-nav Game links joined — 7 -> 10. The perl match
#  starts at 'game/index.html', so demo's '../' prefix is preserved.)
ENTRY_FILES="$SITE_REPO/rite.html $SITE_REPO/index.html $SITE_REPO/treasury.html $SITE_REPO/demo/index.html $SITE_REPO/store.html $SITE_REPO/explore.html $SITE_REPO/mint.html"
LINKS_BEFORE="$(grep -oF 'game/index.html' $ENTRY_FILES | wc -l | tr -d ' ')"
if [ "$LINKS_BEFORE" != "10" ]; then
  echo "error: expected exactly 10 site->game entry links (rite.html x3 + index.html x2 + treasury.html x1 + demo/index.html x1 + store.html x1 + explore.html x1 + mint.html x1), found $LINKS_BEFORE (site nav changed)" >&2
  exit 1
fi
SHA="$SRC_SHORT" perl -i -pe 's{game/index\.html(\?v=[0-9a-f]+)?}{game/index.html?v=$ENV{SHA}}g' $ENTRY_FILES
LINKS_STAMPED="$(grep -oF "game/index.html?v=$SRC_SHORT" $ENTRY_FILES | wc -l | tr -d ' ')"
if [ "$LINKS_STAMPED" != "10" ]; then
  echo "error: entry-link stamping did not produce 10 stamped links (got $LINKS_STAMPED)" >&2
  exit 1
fi
echo "sync_game: stamped 10 entry links -> game/index.html?v=$SRC_SHORT"

echo "sync_game: done. game/ = ${GAME_BYTES} KB (video + vfx cross-linked, not copied)."
