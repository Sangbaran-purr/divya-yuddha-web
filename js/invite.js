/* ============================================================================
   TORANA INVITES (AFFILIATE-1 rung 3) — the two signed records, in ONE place for the whole site.

   The approval bot (web3 services/approval-bot/src/invites/codes.js, rung 2 aa53ae7) verifies exactly these two
   EIP-712 messages. The store signs the binding; the dashboard signs the code request. Both build their typed data
   HERE and nowhere else, and tests/suites/invites.js proves this file and the bot's module produce the same domain,
   types and message — and that a signature made from this file passes the bot's own verifier. A struct drifted by
   one field would make every signature silently useless, so it is pinned, not trusted.

     InviteCodeRequest(address wallet,string statement,uint256 issuedAt)
     InviteBinding(address buyer,string code,string statement,uint256 signedAt)

   Domain: { name: "Torana Invites", version: "1", chainId } — no verifyingContract (off-chain attestations).
   Freshness: the bot accepts a record only within 10 minutes of its own clock, so the time is taken at signing.

   Nothing here touches the network, storage or analytics. It is data and two pure builders.
   ========================================================================= */
window.DYInvite = (function () {
  // the unambiguous alphabet (no 0/O, no 1/I/L) and length — the bot's, verbatim
  var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var CODE_LENGTH = 8;
  var CODE_RE = new RegExp("^[" + ALPHABET + "]{" + CODE_LENGTH + "}$");
  var CODE_STATEMENT = "Request my Torana Invites code";

  var CODE_TYPES = {
    InviteCodeRequest: [
      { name: "wallet", type: "address" },
      { name: "statement", type: "string" },
      { name: "issuedAt", type: "uint256" },
    ],
  };
  var BINDING_TYPES = {
    InviteBinding: [
      { name: "buyer", type: "address" },
      { name: "code", type: "string" },
      { name: "statement", type: "string" },
      { name: "signedAt", type: "uint256" },
    ],
  };

  function domainFor(chainId) { return { name: "Torana Invites", version: "1", chainId: Number(chainId) }; }
  function bindingStatement(code) { return "Invited by " + code; }

  // A code from a link or a paste: trimmed, upper-cased, and refused unless it is exactly the bot's shape.
  function normCode(c) {
    var s = String(c == null ? "" : c).trim().toUpperCase();
    return CODE_RE.test(s) ? s : null;
  }
  // checksum the address when ethers is loaded; the EIP-712 encoding of an address is case-blind either way
  function addr(a, ethers) {
    var e = ethers || window.ethers;
    try { return e && e.getAddress ? e.getAddress(String(a)) : String(a); } catch (_) { return String(a); }
  }
  function nowS() { return Math.floor(Date.now() / 1000); }

  function codeRequestTypedData(chainId, wallet, issuedAt, ethers) {
    return { domain: domainFor(chainId), types: CODE_TYPES, primaryType: "InviteCodeRequest",
      message: { wallet: addr(wallet, ethers), statement: CODE_STATEMENT, issuedAt: Number(issuedAt) } };
  }
  function bindingTypedData(chainId, buyer, code, signedAt, ethers) {
    return { domain: domainFor(chainId), types: BINDING_TYPES, primaryType: "InviteBinding",
      message: { buyer: addr(buyer, ethers), code: code, statement: bindingStatement(code), signedAt: Number(signedAt) } };
  }

  // The link a holder shares. The utm tags are the campaign's (STORE-TRACK-1); the CODE travels in its own parameter,
  // which the store strips from the address bar before the analytics tag can see it.
  var SITE = "https://divyayuddha.games";
  function inviteLink(code) {
    return SITE + "/store.html?invite=" + encodeURIComponent(code) + "&utm_source=invite&utm_medium=torana&utm_campaign=invite";
  }

  return {
    ALPHABET: ALPHABET, CODE_LENGTH: CODE_LENGTH, CODE_STATEMENT: CODE_STATEMENT,
    CODE_TYPES: CODE_TYPES, BINDING_TYPES: BINDING_TYPES,
    domainFor: domainFor, bindingStatement: bindingStatement, normCode: normCode, nowS: nowS,
    codeRequestTypedData: codeRequestTypedData, bindingTypedData: bindingTypedData, inviteLink: inviteLink,
  };
})();
