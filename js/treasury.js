/* ============================================================================
   THE TREASURY — collection discovery + hall render.
   WaveCardNFT is NOT ERC721Enumerable (no tokenOfOwnerByIndex). Owned-token
   discovery (STEP-0.2 choice, justified): scan Transfer(*, owner) events for
   candidate tokenIds, verify each with ownerOf == owner (drops ones later
   transferred away — CardMinted alone would miss secondary transfers), then
   cardOf(tokenId) -> cardId -> the card map. All reads fail GRACEFULLY (the
   rehearsal placeholder contract is not deployed) -> the empty hall.
   ========================================================================= */
window.DYTreasury = (function () {
  var CFG = window.DY_CONFIG;
  var WAVE_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function cardOf(uint256) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ];
  var activeFilter = null; // faction key or null

  function discover(owner) {
    return window.DYWallet.loadEthers().then(function (ethers) {
      var provider = new ethers.BrowserProvider(window.ethereum);
      var c = new ethers.Contract(CFG.contracts.waveCardNFT, WAVE_ABI, provider);
      // incoming transfers to owner (includes mints: Transfer(0, owner, id))
      return c.queryFilter(c.filters.Transfer(null, owner)).then(function (evs) {
        var ids = {};
        evs.forEach(function (e) {
          ids[e.args.tokenId.toString()] = e.args.tokenId;
        });
        var uniq = Object.keys(ids).map(function (k) {
          return ids[k];
        });
        // verify current ownership + resolve cardId, in parallel
        return Promise.all(
          uniq.map(function (tid) {
            return c
              .ownerOf(tid)
              .then(function (cur) {
                if (cur.toLowerCase() !== owner.toLowerCase()) return null;
                return c.cardOf(tid).then(function (cardId) {
                  return { tokenId: tid, cardId: cardId };
                });
              })
              .catch(function () {
                return null;
              });
          })
        ).then(function (rows) {
          return rows.filter(Boolean);
        });
      });
    });
  }

  function polygonscanUrl(tokenId) {
    return (
      CFG.chain.blockExplorerUrls[0] +
      "/token/" +
      CFG.contracts.waveCardNFT +
      "?a=" +
      tokenId.toString()
    );
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function renderPlinth(row) {
    var card = window.DY_CARDS.lookup(row.cardId);
    var p = el("figure", "plinth");
    var frame = el("div", "frame");
    // frame images are owner-supplied later; render a carved placeholder until then
    var ph = el(
      "div",
      "placeholder",
      '<svg aria-hidden="true"><use href="#dy-gem"/></svg><div class="pep">art arrives with the plates</div>'
    );
    frame.appendChild(ph);
    if (card.frame) {
      var img = new Image();
      img.alt = card.name + " — " + card.epithet;
      img.loading = "lazy";
      img.onload = function () {
        frame.innerHTML = "";
        frame.appendChild(img);
      };
      img.onerror = function () {
        /* keep the placeholder */
      };
      img.src = window.DY_CARDS.frameBase + card.frame;
    }
    p.appendChild(frame);
    p.appendChild(el("div", "stand"));
    p.appendChild(el("figcaption", "pname", card.name));
    p.appendChild(el("div", "pep", card.epithet));
    var link = el(
      "a",
      "chain-link",
      '<svg aria-hidden="true" style="width:11px;height:11px;display:inline;vertical-align:-1px"><use href="#dy-chain"/></svg> view on chain'
    );
    link.href = polygonscanUrl(row.tokenId);
    link.target = "_blank";
    link.rel = "noopener";
    p.appendChild(link);
    return p;
  }

  function renderEmpty(hall) {
    hall.className = "hall-empty";
    hall.innerHTML =
      '<div class="empty-plinth" aria-hidden="true"></div>' +
      '<div class="display" style="font-size:1rem">The hall awaits its first card.</div>' +
      '<div class="state-line">A marketplace to fill it is coming. ' +
      '<span style="color:var(--gold-aged)">(the doors are not yet open)</span></div>';
  }

  function renderHall(hall, rows) {
    if (!rows.length) {
      renderEmpty(hall);
      return;
    }
    hall.className = "hall";
    hall.innerHTML = "";
    rows.forEach(function (r) {
      hall.appendChild(renderPlinth(r));
    });
  }

  // filter rows to the active faction chamber (seed run is Vanara; others empty)
  function filtered(rows) {
    if (!activeFilter) return rows;
    return rows.filter(function (r) {
      return (window.DY_CARDS.lookup(r.cardId).faction || "vanaras") === activeFilter;
    });
  }

  // wire the treasury page: reacts to wallet state
  function mount() {
    var statusEl = document.getElementById("tre-status");
    var hall = document.getElementById("tre-hall");
    var chambers = document.getElementById("tre-chambers");
    var lastRows = null;

    // faction filter gems warm the hall ambient toward that ground
    if (chambers) {
      chambers.querySelectorAll(".chamber-gem").forEach(function (g) {
        g.addEventListener("click", function () {
          var f = g.getAttribute("data-f");
          var on = g.getAttribute("aria-pressed") === "true";
          chambers.querySelectorAll(".chamber-gem").forEach(function (o) {
            o.setAttribute("aria-pressed", "false");
          });
          activeFilter = on ? null : f;
          g.setAttribute("aria-pressed", on ? "false" : "true");
          // warm the hall ambient toward the chosen ground (§8.5)
          if (on) delete document.body.dataset.chamber;
          else document.body.dataset.chamber = f;
          // re-render honoring the filter (seed cards are Vanara; others show empty)
          if (lastRows) renderHall(hall, filtered(lastRows));
        });
      });
    }

    window.DYWallet.onChange(function (s) {
      if (!s.hasProvider) {
        statusEl.innerHTML =
          'You carry no key. <a href="rite.html">Forge one at the rite.</a> The hall is dark until you declare yourself.';
        renderEmpty(hall);
        return;
      }
      if (!s.connected) {
        statusEl.innerHTML =
          'Declare yourself to see your treasury. <a href="rite.html">Go to the rite.</a>';
        renderEmpty(hall);
        return;
      }
      if (!s.chainOk) {
        statusEl.innerHTML = "You stand at the wrong gate. Cross to Amoy at the rite to read your hall.";
        renderEmpty(hall);
        return;
      }
      statusEl.textContent = "Reading the hall…";
      if (lastRows) {
        renderHall(hall, filtered(lastRows));
        statusEl.textContent = "";
        return;
      }
      discover(s.address)
        .then(function (rows) {
          lastRows = rows;
          statusEl.textContent = rows.length
            ? rows.length + (rows.length === 1 ? " card, held in your name." : " cards, held in your name.")
            : "";
          renderHall(hall, filtered(rows));
        })
        .catch(function () {
          // undeployed placeholder / read failure -> honest empty hall
          statusEl.textContent = "";
          renderEmpty(hall);
        });
    });
  }

  return { discover: discover, mount: mount };
})();
