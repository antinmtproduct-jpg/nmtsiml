/* AntiSchool — нормалізація посилань на симуляцію з головної */
(() => {
  const root = (window.nmt && nmt.ROOT) || ".";

  function ensureHref(el, subj){
    const url = `${root}/modes/sim.html?s=${encodeURIComponent(subj)}`;
    if (el.tagName === "A") {
      el.setAttribute("href", url);
    } else {
      el.setAttribute("role", "button");
      el.addEventListener("click", () => {
        sessionStorage.setItem("nmt_subject", subj);
        location.href = url;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1) Картки з data-атрибутом → ставимо правильні посилання
    document.querySelectorAll("[data-subject], [data-subj]").forEach(el => {
      const subj = el.getAttribute("data-subject") || el.getAttribute("data-subj");
      if (subj) ensureHref(el, subj);
    });

    // 2) Виправляємо будь-які існуючі <a href=".../sim.html?...">
    document.querySelectorAll('a[href*="modes/sim.html"]').forEach(a => {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        const subj = u.searchParams.get("s") || u.searchParams.get("subject");
        if (subj) a.setAttribute("href", `${root}/modes/sim.html?s=${encodeURIComponent(subj)}`);
      } catch {}
    });
  });
})();
