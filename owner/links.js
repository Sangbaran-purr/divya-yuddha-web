/* GROW-COUNT-1 · the tagged-link builder (owner rulings 6 and 9, 2026-11-03). UMD: browser `window.DY_LINKS` (the page),
   Node `require` (the site suite). The owner types a creator's or an ad's name and gets the three links — the landing page
   (the main link), the Daily Puzzle, Smriti — each carrying utm_source (the name, as a clean slug), utm_medium (creator /
   ad / social / community) and utm_campaign.
   LINKS-1 (2026-11-09): the main link is the LANDING page, not /game/. A stranger opening /game/ directly gets the
   first-launch trailer; the landing's Play free button opens the game by the play-free route and carries these tags in,
   and the counter loads on the home page (#9). There is no separate game link any more (so no copy id to read).
   INDIA (ruling 9): the links carry the slug and the game's name only — campaign "divya-yuddha" — and a name holding a
   crypto, earn or wallet word is refused rather than shipped. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DY_LINKS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ORIGIN = "https://divyayuddha.games";
  var MEDIUMS = ["creator", "ad", "social", "community"];
  var INDIA_CAMPAIGN = "divya-yuddha";
  var SEA_CAMPAIGN = "sea-launch";
  // the words an India link may never carry (in the slug or anywhere in the link)
  var BANNED_INDIA = ["crypto", "coin", "token", "earn", "wallet", "nft", "web3", "dyc", "airdrop", "money", "cash", "reward", "stake", "staking", "presale", "ico", "blockchain", "bitcoin", "btc", "eth", "polygon", "matic", "usdt", "usdc", "invest", "profit", "yield", "mint"];
  function slug(v) { return String(v == null ? "" : v).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, ""); }
  function bannedIn(s) { var parts = String(s).split(/[^a-z0-9]+/); return BANNED_INDIA.filter(function (w) { return parts.some(function (p) { return p === w || p.indexOf(w) === 0 && w.length >= 4; }); }); }
  // → { slug, medium, campaign, links: { landing, daily, smriti } } | { error: "plain words" }
  function build(o) {
    var s = slug(o.name);
    if (!s) return { error: "Type the creator's or the ad's name." };
    var medium = MEDIUMS.indexOf(o.medium) >= 0 ? o.medium : "creator";
    var india = o.market === "india";
    var campaign = india ? INDIA_CAMPAIGN : (slug(o.campaign) || SEA_CAMPAIGN);
    if (india) { var b = bannedIn(s); if (b.length) return { error: "An India link can't carry \"" + b[0] + "\" — use the creator's plain name." }; }
    var q = "utm_source=" + s + "&utm_medium=" + medium + "&utm_campaign=" + campaign;
    var base = o.origin || ORIGIN;
    var out = { slug: s, medium: medium, campaign: campaign, links: {
      landing: base + "/?" + q,
      daily: base + "/play/daily/?" + q,
      smriti: base + "/play/smriti/?" + q,
    } };
    if (india && Object.keys(out.links).some(function (k) { return bannedIn(out.links[k].replace(/^https?:\/\/[^/]+/, "")).length; })) return { error: "That link would carry a word India links can't carry." };
    return out;
  }
  return { build: build, slug: slug, bannedIn: bannedIn, MEDIUMS: MEDIUMS, BANNED_INDIA: BANNED_INDIA, INDIA_CAMPAIGN: INDIA_CAMPAIGN, SEA_CAMPAIGN: SEA_CAMPAIGN };
});
