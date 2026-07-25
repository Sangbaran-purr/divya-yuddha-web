/* ============================================================================
   ORNAMENT SPRITE — hand-authored SVG symbols, reused via <use href="#id">.
   Script veto (§6/§13.F): geometry, flora, flame, scale ONLY. No character-like
   marks, no pseudo-Devanagari, no emoji, no icon fonts. Authored sigils are
   ABSTRACT (sun/flame/leaf/coil) even where the master's RASTER art shows faces.
   Injected at <body> start so same-document <use> resolves everywhere.
   ========================================================================= */
(function () {
  var SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true"><defs>' +
    // crest — sun roundel (the master's title-mark): rays + ring + gem center
    '<symbol id="dy-crest" viewBox="0 0 64 64">' +
    '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
    '<circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="19"/>' +
    '<g stroke-width="1.1">' +
    '<path d="M32 3v7M32 54v7M3 32h7M54 32h7M11 11l5 5M48 48l5 5M53 11l-5 5M16 48l-5 5"/></g></g>' +
    '<path d="M32 25l4 7-4 7-4-7z" fill="currentColor"/>' +
    '</symbol>' +
    // gem — diamond mark (card-frame divider register)
    '<symbol id="dy-gem" viewBox="0 0 24 24">' +
    '<path d="M12 2l6 10-6 10-6-10z" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M12 6l3.4 6-3.4 6-3.4-6z" fill="currentColor" opacity="0.55"/></symbol>' +
    // flame
    '<symbol id="dy-flame" viewBox="0 0 24 32">' +
    '<path d="M12 1c3 6 8 8 8 15a8 8 0 01-16 0c0-4 2-6 4-9 1 3 3 3 3 5 1-3 0-6-1-9 1-2 2-2 2-3z" fill="currentColor"/></symbol>' +
    // chevron (scroll cue)
    '<symbol id="dy-chev" viewBox="0 0 24 24"><path d="M4 8l8 8 8-8" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>' +
    // chain-eye (view on chain) — geometric ring + slit
    '<symbol id="dy-chain" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></symbol>' +
    // faction sigils — abstract, veto-safe:
    // Devas = sun/radiance
    '<symbol id="dy-devas" viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="32" cy="32" r="10"/><g stroke-width="1.2"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6"/></g></g></symbol>' +
    // Asuras = ember/flame spike
    '<symbol id="dy-asuras" viewBox="0 0 64 64"><path d="M32 6c5 10 14 14 14 26a14 14 0 01-28 0c0-7 3-10 6-15 2 5 5 5 5 9 2-6 0-12-2-16 2-3 4-4 5-4z" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    // Vanaras = leaf sprig (flora)
    '<symbol id="dy-vanaras" viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M32 54c0-16 4-30 18-40C40 24 34 34 32 54z"/><path d="M32 54C32 38 28 24 14 14c10 10 16 20 18 40z"/><path d="M32 30v24"/></g></symbol>' +
    // Nagas = coiled scale (spiral)
    '<symbol id="dy-nagas" viewBox="0 0 64 64"><path d="M32 12a20 20 0 11-14 34 14 14 0 1020-22 8 8 0 10-10 12" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    // simple crossed-blades / deck / realm marks for THE GAME pillar (geometric)
    '<symbol id="dy-blades" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 6l14 14M26 6L12 20"/><path d="M20 22l4 4M12 22l-4 4"/></g></symbol>' +
    '<symbol id="dy-deck" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.4"><rect x="8" y="6" width="14" height="20" rx="1"/><path d="M12 3h14v20"/></g></symbol>' +
    '<symbol id="dy-realm" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="16" cy="16" r="11"/><path d="M5 16h22M16 5v22M8 8c5 5 11 5 16 0M8 24c5-5 11-5 16 0"/></g></symbol>' +
    "</defs></svg>";
  if (document.body) {
    document.body.insertAdjacentHTML("afterbegin", SPRITE);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.insertAdjacentHTML("afterbegin", SPRITE);
    });
  }
})();
