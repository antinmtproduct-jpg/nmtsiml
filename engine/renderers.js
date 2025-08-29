/* AntiSchool NMT — RENDERERS (single, match, short, order, multi) */
(() => {
  const nmt = (window.nmt = window.nmt || {});

  // маленький хелпер
  const $el = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    }
    return el;
  };

  function mount(container, node, { replace = true } = {}) {
    const root =
      typeof container === "string" ? document.querySelector(container) : container;
    if (!root) throw new Error("Container not found for render");
    if (replace) root.innerHTML = "";
    root.appendChild(node);
    nmt.typeset(root);
    return root;
  }

  // 1) SINGLE (1 із N)
  function renderSingle(container, q, saved) {
    const mcq = q?.variants?.multiple_choice ?? {};
    let options = mcq.options || [];
    const correct = Number(mcq.correct ?? -1);

    let shuffleMap = q._meta?.optionShuffle || options.map((_, i) => i);
    if (shuffleMap) options = shuffleMap.map((i) => options[i]);

    const wrap = $el("div", { class: "q-card" });
    wrap.appendChild($el("div", { class: "q-body", html: q?.body?.text || "" }));

    const list = $el("div", { class: "q-list" });
    let selected = typeof saved === "number" ? saved : null;

    options.forEach((opt, idx) => {
      const id = `opt_${q.id}_${idx}`;
      const radio = $el("input", {
        type: "radio",
        name: `mcq_${q.id}`,
        id,
        value: String(idx),
        ...(selected === idx ? { checked: "checked" } : {}),
      });
      radio.addEventListener("change", () => (selected = idx));
      const label  = $el("label", { for: id });
      const marker = $el("span", { class: "opt-marker" }, String.fromCharCode(65 + idx));
      const text   = $el("span", { class: "opt-text", html: opt });
      label.append(marker, text);
      list.appendChild($el("div", { class: "q-option" }, radio, label));
    });

    wrap.appendChild(list);
    mount(container, wrap);

    return {
      getAnswer: () => selected,
      setAnswer: (v) => {
        selected = typeof v === "number" ? v : null;
        Array.from(list.querySelectorAll("input[type=radio]")).forEach(
          (r, i) => (r.checked = i === selected)
        );
      },
      isComplete: () => selected != null,
      _shuffleMap: shuffleMap,
      _correct: correct,
    };
  }

  // 2) MATCH (дві колонки + матриця з радіокнопками)
  function renderMatch(container, q, saved) {
    const m = q?.variants?.match ?? {};
    const left = m.left || [];
    const options = m.options || [];

    let map = Array.isArray(saved) ? saved.slice() : Array(left.length).fill(null);

    const UA = ["А","Б","В","Г","Д","Е","Є","Ж","З","И","І","Й","К","Л","М","Н","О","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Ь","Ю","Я"];
    const letter = (i) => (UA[i] ?? String.fromCharCode(65 + i));

    const wrap = $el("div", { class: "q-card" });
    wrap.appendChild($el("div", { class: "q-body", html: q?.body?.text || "" }));

    // --- дві колонки
    const twoCols = $el("div", { class: "match-two-cols" });

    const colLeft = $el("div", { class: "match-col left" });
    colLeft.appendChild($el("div", { class: "match-col-title" }, "Початок речення"));
    const leftList = $el("ol", { class: "match-list" });
    left.forEach((lhs, i) => {
      leftList.appendChild(
        $el("li", { class: "match-left-item" },
          $el("span", { class: "badge-num" }, String(i + 1)),
          $el("div", { class: "match-left-text", html: lhs })
        )
      );
    });
    colLeft.appendChild(leftList);

    const colRight = $el("div", { class: "match-col right" });
    colRight.appendChild($el("div", { class: "match-col-title" }, "Закінчення речення"));
    const optList = $el("ol", { class: "match-option-list" });
    options.forEach((opt, j) => {
      optList.appendChild(
        $el("li", { class: "match-option-item" },
          $el("span", { class: "badge-let" }, letter(j)),
          $el("div", { class: "match-option-text", html: opt })
        )
      );
    });
    colRight.appendChild(optList);

    twoCols.append(colLeft, colRight);
    wrap.appendChild(twoCols);

    // --- матриця вибору
    const matrixWrap = $el("div", { class: "match-matrix-wrap" });
    matrixWrap.appendChild($el("div", { class: "matrix-title" }, "Позначте відповіді:"));
    const table = $el("table", { class: "match-matrix", role: "grid" });

    const thead = $el("thead");
    const hr = $el("tr");
    hr.appendChild($el("th", { class: "stub" }));
    options.forEach((_, j) => hr.appendChild($el("th", { class: "col-head" }, letter(j))));
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = $el("tbody");
    left.forEach((_, i) => {
      const tr = $el("tr");
      tr.appendChild($el("th", { class: "row-head" }, String(i + 1)));
      options.forEach((_, j) => {
        const td = $el("td", { class: "cell" });
        const id = `mm_${q.id}_${i}_${j}`;
        const name = `row_${q.id}_${i}`;
        const radio = $el("input", {
          type: "radio",
          id,
          name,
          value: String(j),
          ...(map[i] === j ? { checked: "checked" } : {}),
        });
        const label = $el("label", {
          for: id,
          class: "cell-label",
          "aria-label": `Рядок ${i + 1}, варіант ${letter(j)}`
        });
        td.append(radio, label);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    matrixWrap.appendChild(table);
    wrap.appendChild(matrixWrap);

    table.addEventListener("change", (e) => {
      const el = e.target;
      if (el?.name?.startsWith(`row_${q.id}_`) && el.type === "radio") {
        const i = Number(el.name.split("_").pop());
        const j = Number(el.value);
        map[i] = j;
      }
    });

    const root = mount(container, wrap);
    setTimeout(() => nmt.fitMatrix(root), 0);

    return {
      getAnswer: () => map.slice(),
      setAnswer: (arr) => {
        map = Array.isArray(arr) ? arr.slice() : map;
        left.forEach((_, i) => {
          const want = map[i];
          options.forEach((__, j) => {
            const input = table.querySelector(`#mm_${q.id}_${i}_${j}`);
            if (input) input.checked = want === j;
          });
        });
        setTimeout(() => nmt.fitMatrix(root), 0);
      },
      isComplete: () => map.every((v) => v != null),
    };
  }

  // 3) SHORT (введення відповіді)
  function renderShort(container, q, saved) {
    const wrap = $el("div", { class: "q-card" });
    wrap.appendChild($el("div", { class: "q-body", html: q?.body?.text || "" }));
    const inp = $el("input", {
      type: "text",
      class: "sa-input",
      placeholder: "Введіть відповідь",
      value: saved != null ? String(saved) : "",
      autocomplete: "off",
      inputmode: "decimal",
    });
    wrap.appendChild(inp);
    mount(container, wrap);

    return {
      getAnswer: () => inp.value,
      setAnswer: (v) => (inp.value = v ?? ""),
      isComplete: () => String(inp.value).trim().length > 0,
    };
  }

  // 4) ORDER (встановлення послідовності; drag & drop)
  function renderOrder(container, q, saved) {
    const o = q?.variants?.order ?? {};
    const items = Array.isArray(o.items) ? o.items.slice() : [];
    const n = items.length;

    let order =
      Array.isArray(saved) && saved.length === n
        ? saved.slice()
        : (o.shuffle === false
            ? Array.from({ length: n }, (_, i) => i)
            : nmt.shuffle(Array.from({ length: n }, (_, i) => i)));

    const wrap = $el("div", { class: "q-card" });
    wrap.appendChild($el("div", { class: "q-body", html: q?.body?.text || "" }));

    const list = $el("ol", { class: "order-list" });
    const render = () => {
      list.innerHTML = "";
      order.forEach((origIndex, pos) => {
        const li = $el("li", {
          class: "order-item",
          draggable: "true",
          "data-pos": String(pos),
        });
        li.append(
          $el("span", { class: "drag-handle", title: "Перетягніть" }, "☰"),
          $el("div", { class: "order-text", html: items[origIndex] })
        );
        list.appendChild(li);
      });
    };
    render();
    wrap.appendChild(list);

    let from = null;
    list.addEventListener("dragstart", (e) => {
      const li = e.target.closest(".order-item");
      if (!li) return;
      from = Number(li.getAttribute("data-pos"));
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      const li = e.target.closest(".order-item");
      if (!li) return;
      const to = Number(li.getAttribute("data-pos"));
      if (isNaN(from) || isNaN(to) || from === to) return;
      const moved = order.splice(from, 1)[0];
      order.splice(to, 0, moved);
      from = to;
      render();
    });
    list.addEventListener("dragend", () => {
      list.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    });

    mount(container, wrap);
    return {
      getAnswer: () => order.slice(),
      setAnswer: (arr) => {
        if (Array.isArray(arr) && arr.length === n) {
          order = arr.slice();
          render();
        }
      },
      isComplete: () => true,
    };
  }

  // 5) MULTI (checkboxes: обрати K із N) — підтримує both: multiple_select і multiple_choice з k/масивом correct
  function renderMulti(container, q, saved) {
    const base =
      q?.variants?.multiple_select ||
      q?.variants?.multiple_choice ||
      {};

    let options = base.options || [];
    const correctArr = Array.isArray(base.correct) ? base.correct.map(Number) : [];
    const K = Number.isInteger(base.k) ? base.k : (correctArr.length || 3);

    let shuffleMap = q._meta?.optionShuffle || options.map((_, i) => i);
    if (shuffleMap) options = shuffleMap.map((i) => options[i]);

    const wrap = $el("div", { class: "q-card" });
    wrap.appendChild(
      $el("div", {
        class: "q-body",
        html:
          (q?.body?.text || "") +
          `<div class="lead" style="margin-top:6px">Оберіть <b>${K}</b> варіанти(ів).</div>`,
      })
    );

    const list = $el("div", { class: "q-list" });
    let selected = Array.isArray(saved)
      ? saved.filter((n) => Number.isInteger(n))
      : [];

    const sync = () => {
      Array.from(list.querySelectorAll('input[type="checkbox"]')).forEach((cb, i) => {
        cb.checked  = selected.includes(i);
        cb.disabled = !selected.includes(i) && selected.length >= K;
      });
    };

    const toggle = (idx, checked) => {
      if (checked) {
        if (!selected.includes(idx)) {
          selected.push(idx);
          if (selected.length > K) selected.shift();
        }
      } else {
        selected = selected.filter((i) => i !== idx);
      }
      sync();
    };

    options.forEach((opt, idx) => {
      const id = `multi_${q.id}_${idx}`;
      const cb = $el("input", {
        type: "checkbox",
        id,
        name: `ms_${q.id}[]`,
        value: String(idx),
        ...(selected.includes(idx) ? { checked: "checked" } : {}),
      });
      cb.addEventListener("change", () => toggle(idx, cb.checked));

      const label  = $el("label", { for: id });
      const marker = $el("span", { class: "opt-marker" }, String.fromCharCode(65 + idx));
      const text   = $el("span", { class: "opt-text", html: opt });
      label.append(marker, text);

      list.appendChild($el("div", { class: "q-option" }, cb, label));
    });

    wrap.appendChild(list);
    mount(container, wrap);
    sync();

    return {
      getAnswer: () => selected.slice(),
      setAnswer: (arr) => {
        selected = Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
        sync();
      },
      isComplete: () => selected.length === K,
      _shuffleMap: shuffleMap,
      _k: K,
    };
  }

  // ---------- dispatcher ----------
  nmt.renderQuestion = (container, q, saved) => {
    switch (q._meta?.type) {
      case "single": return renderSingle(container, q, saved);
      case "match":  return renderMatch(container, q, saved);
      case "short":  return renderShort(container, q, saved);
      case "order":  return renderOrder(container, q, saved);
      case "multi":  return renderMulti(container, q, saved);
      default: {
        const node = $el("div", { class: "q-card" },
          $el("div", { class: "q-body" }, "Невідомий тип питання. Перевірте дані.")
        );
        mount(container, node);
        return { getAnswer: () => null, setAnswer: () => {}, isComplete: () => true };
      }
    }
  };
})();
