/* Shared page behaviour: top bar border on scroll, and "Back" links. */
(function () {
  "use strict";
  const bar = document.querySelector(".topbar");
  if (bar) {
    const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // A [data-back] link returns to the page that sent the reader here (for example
  // the chapter whose code link they clicked). Without a same-site referrer it
  // keeps its own href, the guide's front page.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin && ref.pathname !== location.pathname) {
      document.querySelectorAll("a[data-back]").forEach((a) => {
        a.href = ref.href;
        const page = ref.pathname.split("/").pop() || "index.html";
        a.title = "Back to " + page;
      });
    }
  } catch (e) { /* keep the default href */ }
})();
