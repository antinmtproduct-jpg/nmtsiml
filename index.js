/* AntiSchool NMT — Home (subject picker) */
(() => {
  const nmt = (window.nmt = window.nmt || {});
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-subject]");
    if (!btn) return;
    const subject = btn.getAttribute("data-subject");
    if (!/^(math|ukr|eng|history)$/.test(subject)) return;
    location.href = `${nmt.ROOT}/modes/sim.html?subject=${encodeURIComponent(
      subject
    )}`;
  });
})();
