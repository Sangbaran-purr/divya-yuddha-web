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
NS_PREFIX="dyw::"
ARCHIVE_PATHS="index.html src/chapters.js assets/cards assets/img assets/audio assets/story assets/thumbs"

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

GAME_BYTES="$(du -sk "$DEST" | cut -f1)"

cat > "$DEST/SNAPSHOT.md" <<SNAP
# Gated game snapshot

- Source repo: divya-yuddha
- Source commit: \`$SRC_COMMIT\` ($SRC_SHORT)
- Source committed: $SRC_DATE
- Method: \`git archive\` of the recorded commit (the free-game working tree is never modified; working-tree dirt is ignored, so this copy is reproducible and complete against the commit).

## Copied from the commit
- index.html (+ gate preamble injected between the DYW-GATE markers)
- src/chapters.js (Story Mode data)
- assets/cards, assets/img, assets/audio, assets/story, assets/thumbs

## Excluded / transformed
- assets/video/ (~47MB) — NOT copied. The VIDEO_BASE web branch is rewritten to the free game's live same-origin URL ($VIDEO_URL); the intro streams from there and fails open to the landing if unavailable (the game's own law).
- .DS_Store — not in the commit; never copied.

## Gate preamble (marker: DYW-GATE-START / DYW-GATE-END)
- Honest-door session check: no site pass -> redirect to ../rite.html. A courtesy redirect, not security.
- localStorage namespace shim (prefix "$NS_PREFIX"): the copy keeps its own memory, isolated from the free game (both live on the same github.io origin, which otherwise shares localStorage).
- Return-to-gate gem-mark (top-left, safe-area aware).

## Notes at sync time
- Source working tree dirty files: $SRC_DIRTY (ignored by the archive method).
- game/ in-repo size: ${GAME_BYTES} KB.

## Refresh
    bash scripts/sync_game.sh
SNAP

echo "sync_game: done. game/ = ${GAME_BYTES} KB (video cross-linked, not copied)."
