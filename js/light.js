/* ============================================================================
   THE LIGHT SYSTEM (§5) — the site's one interaction signature.
   Carried lamp (desktop pointer, rAF-throttled transform on ONE node),
   scroll dawn (mobile, IntersectionObserver), reduced-motion collapses ALL of
   it to the fully-lit static hall. No canvas, no shaders, no per-frame layout.
   ========================================================================= */
(function () {
  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- CARRIED LAMP: desktop pointer only ----
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!reduce && finePointer) {
    var lamp = document.getElementById("carried-lamp");
    if (lamp) {
      document.body.classList.add("has-cursor-lamp");
      var tx = window.innerWidth / 2,
        ty = window.innerHeight / 2,
        cx = tx,
        cy = ty,
        raf = 0;
      window.addEventListener(
        "pointermove",
        function (e) {
          tx = e.clientX;
          ty = e.clientY;
          if (!raf) raf = requestAnimationFrame(tick);
        },
        { passive: true }
      );
      function tick() {
        raf = 0;
        // ease toward the pointer (a carried flame drifts, it doesn't snap)
        cx += (tx - cx) * 0.18;
        cy += (ty - cy) * 0.18;
        lamp.style.transform = "translate(" + cx + "px," + cy + "px)";
        if (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) {
          raf = requestAnimationFrame(tick);
        }
      }
      tick();
    }
  }

  // ---- SCROLL DAWN: sections light as their threshold crosses mid-viewport ----
  var dawns = document.querySelectorAll(".dawn");
  if (reduce || !("IntersectionObserver" in window)) {
    for (var i = 0; i < dawns.length; i++) dawns[i].classList.add("lit");
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("lit");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -35% 0px", threshold: 0.05 }
    );
    for (var j = 0; j < dawns.length; j++) io.observe(dawns[j]);
  }
})();
