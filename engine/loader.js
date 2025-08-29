/* AntiSchool NMT — LOADER (root, fetch+cache, utils, manifest, deck) */
(() => {
  const nmt = (window.nmt = window.nmt || {});

  // ---------- ROOT ----------
  nmt.ROOT = (function () {
    const p = location.pathname.replace(/\/+$/, "");
    return /\/modes\//.test(p) ? ".." : ".";
  })();

  // ---------- JSON cache ----------
  const jsonCache = new Map();
  nmt.loadJSON = async (path) => {
    if (jsonCache.has(path)) return jsonCache.get(path);
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Cannot load ${path} (${res.status})`);
    const data = await res.json();
    jsonCache.set(path, data);
    return data;
  };

  // ---------- utils ----------
  nmt.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  nmt.pickN = (arr, n) => {
    if (!n || n >= arr.length) return arr.slice();
    return nmt.shuffle(arr).slice(0, n);
  };
  nmt.esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  nmt.normalize = (s) => {
    if (s == null) return "";
    s = String(s).trim().toLowerCase();
    s = s
      .replaceAll(",", ".")
      .replace(/\s+/g, " ")
      .replace(/['"«»„“”`]/g, "")
      .replace(/^d\s*=\s*/i, "");
    return s;
  };
  nmt.typeset = async (root) => {
    try {
      if (window.MathJax?.typesetPromise) {
        await MathJax.typesetPromise(root ? [root] : undefined);
      }
    } catch {}
  };

  // ====== FIT MATRIX: точна підгонка ширини і висоти таблиці відповідностей ======
  nmt.fitMatrix = (scope) => {
    const root = scope && scope.querySelector ? scope : document;

    root.querySelectorAll(".match-matrix-wrap").forEach((wrap) => {
      const table = wrap.querySelector(".match-matrix");
      if (!table) return;

      // (1) скидаємо попередні стилі
      table.style.transform = "";
      table.style.transformOrigin = "left top";
      table.style.display = "";
      table.style.verticalAlign = "top";
      wrap.style.height = "";

      // (2) міряємо «сирі» габарити до масштабування
      const maxW = wrap.clientWidth - 2;
      const rawW = table.scrollWidth;
      const rawH = table.offsetHeight;

      if (rawW > maxW && maxW > 0) {
        const k = maxW / rawW; // коефіцієнт стискання

        // (3) застосовуємо трансформацію
        table.style.transform = `scale(${k})`;
        table.style.display = "inline-block";
        table.style.verticalAlign = "top";

        // (4) висота контейнера = «сирa» висота * k (layout не знає про transform)
        const targetH = Math.ceil(rawH * k);
        requestAnimationFrame(() => {
          wrap.style.height = `${targetH}px`;
        });
      }
    });
  };

  // підганяти при зміні розміру
  window.addEventListener("resize", () => nmt.fitMatrix(document));

  // ---------- manifest ----------
  nmt.loadManifest = async (subject) => {
    const path = `${nmt.ROOT}/data/${subject}/manifest.json`;
    const raw = await nmt.loadJSON(path).catch(() => ({}));
    return {
      subject,
      limits: raw?.limits ?? {},
      mcq: Array.isArray(raw?.mcq) ? raw.mcq : [],
      match: Array.isArray(raw?.match) ? raw.match : [],
      short: Array.isArray(raw?.short) ? raw.short : [],
      order: Array.isArray(raw?.order) ? raw.order : [],
      multi: Array.isArray(raw?.multi) ? raw.multi : [], // новий тип
      sequence: Array.isArray(raw?.sequence) ? raw.sequence : null,
    };
  };

  // ---------- type detection ----------
  nmt.detectTypeFromName = (fname) => {
    if (/_1_/.test(fname)) return "single";
    if (/_2_/.test(fname)) return "match";
    if (/_3_/.test(fname)) return "short";
    if (/_4_/.test(fname)) return "order";
    if (/_5_/.test(fname)) return "multi";
    return "unknown";
  };

  // ---------- fallback-послідовності ----------
  nmt.SEQUENCE_BY_SUBJECT = {
    math: [["single", 15], ["match", 3], ["short", 4]],
    ukr: [["single", 25], ["match", 5]],
    eng: [["match", 11], ["single", 5], ["short", 16]],
    history: [["single", 20], ["match", 4], ["order", 3], ["multi", 3]], // без short
  };

  // ---------- build deck ----------
  nmt.buildDeck = (manifest) => {
    const subj = manifest.subject;
    const pools = {
      single: Array.isArray(manifest.mcq) ? manifest.mcq : [],
      match: Array.isArray(manifest.match) ? manifest.match : [],
      short: Array.isArray(manifest.short) ? manifest.short : [],
      order: Array.isArray(manifest.order) ? manifest.order : [],
      multi: Array.isArray(manifest.multi) ? manifest.multi : [],
    };
    const sequence =
      (Array.isArray(manifest.sequence) && manifest.sequence) ||
      nmt.SEQUENCE_BY_SUBJECT[subj] ||
      null;

    const out = [];
    const take = (list, count, type) => {
      const need = Math.max(0, Math.min(Number(count) || 0, list.length));
      if (!need) return;
      const picked = nmt.pickN(list, need);
      for (const key of picked)
        out.push({ key, type, path: `${nmt.ROOT}/data/${subj}/${key}` });
    };

    if (sequence) {
      for (const [type, count] of sequence) take(pools[type] || [], count, type);
      return out;
    }
    // fallback: old limits + shuffle
    take(pools.single, manifest.limits?.mcq, "single");
    take(pools.match, manifest.limits?.match, "match");
    take(pools.short, manifest.limits?.short, "short");
    return nmt.shuffle(out);
  };

  // ---------- load deck (формуємо _meta.optionShuffle) ----------
  nmt.loadDeck = async (deck) => {
    const loaded = await Promise.all(
      deck.map(async (item) => {
        const data = await nmt.loadJSON(item.path);
        const type =
          item.type !== "unknown"
            ? item.type
            : data?.variants?.multiple_choice
            ? "single"
            : data?.variants?.match
            ? "match"
            : data?.variants?.short_answer
            ? "short"
            : data?.variants?.order
            ? "order"
            : data?.variants?.multiple_select
            ? "multi"
            : "unknown";

        let optionShuffle = null;
        if (type === "single" || type === "multi") {
          const block =
            type === "single"
              ? data?.variants?.multiple_choice || {}
              : data?.variants?.multiple_select || {};
          const opts = Array.isArray(block.options) ? block.options : [];
          const idxs = opts.map((_, i) => i);
          optionShuffle = block.shuffle ? nmt.shuffle(idxs) : idxs; // identity коли shuffle=false
        }

        return { ...data, _meta: { ...item, type, optionShuffle } };
      })
    );

    // УВАГА: тут нема DOM — fitMatrix не викликаємо.
    return loaded;
  };
})();
