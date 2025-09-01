/* assets/app.js — scoring + analysis (partial) + Enter block + proper SKIP */
(function ($) {
  const pad = n => (n < 10 ? "0" + n : "" + n);
  const shuffle = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

  /* ---------- Предмети, структура, офіційні макс. тестові та пороги ---------- */
  const SPEC = {
    eng:  { name: "Англійська мова", plan: [{type:"match",count:11},{type:"multiple_choice",count:5},{type:"cloze_or_short",count:16}], maxScore:32, threshold:5 },
    ukr:  { name: "Українська мова", plan: [{type:"multiple_choice_4",count:10},{type:"multiple_choice",count:15},{type:"match",count:5}], maxScore:45, threshold:7 },
    math: { name: "Математика", plan: [{type:"multiple_choice",count:15},{type:"match",count:3},{type:"short_answer",count:4}], maxScore:32, threshold:5 },
    hist: { name: "Історія України", plan: [{type:"multiple_choice",count:20},{type:"match",count:4},{type:"order",count:3},{type:"multiple_select3",count:3}], maxScore:54, threshold:8 }
  };

  /* ---------- Нормалізація JSON ---------- */
  function normalizeQuestion(raw) {
    const base = { id: raw.id, subject: raw.subject, theme: raw.theme, skills: raw.skills || [], text: (raw.body && raw.body.text) || "", raw };
    const v = raw.variants || {};
    if (v.multiple_choice) return { ...base, qtype: "multiple_choice", options: v.multiple_choice.options, correct: v.multiple_choice.correct, shuffle: !!v.multiple_choice.shuffle };
    if (v.short_answer)    return { ...base, qtype: "short_answer",    answers: v.short_answer.answers };
    if (v.match)           return { ...base, qtype: "match",           left: v.match.left, options: v.match.options, correctMap: v.match.correctMap };
    if (v.multiple_select) return { ...base, qtype: "multiple_select",  options: v.multiple_select.options, correct: v.multiple_select.correct, k: v.multiple_select.k || (v.multiple_select.correct?.length || 0), shuffle: !!v.multiple_select.shuffle };
    if (v.order)           return { ...base, qtype: "order",           items: v.order.items, correct: v.order.correct || null };
    if (v.cloze)           return { ...base, qtype: "cloze",           text: v.cloze.text, blanks: v.cloze.blanks };
    return null;
  }

  /* ---------- Підбір банку під офіційну структуру ---------- */
  function selectBySpec(all, spec) {
    const pick = (arr, n) => shuffle(arr).slice(0, Math.min(n, arr.length));
    const out = [];
    spec.plan.forEach(sec => {
      let pool = [];
      if (sec.type === "multiple_choice")   pool = all.filter(q => q.qtype === "multiple_choice");
      if (sec.type === "multiple_choice_4") pool = all.filter(q => q.qtype === "multiple_choice" && q.options?.length === 4);
      if (sec.type === "short_answer")      pool = all.filter(q => q.qtype === "short_answer");
      if (sec.type === "cloze_or_short")    pool = all.filter(q => q.qtype === "cloze" || q.qtype === "short_answer");
      if (sec.type === "match")             pool = all.filter(q => q.qtype === "match");
      if (sec.type === "order")             pool = all.filter(q => q.qtype === "order");
      if (sec.type === "multiple_select3")  pool = all.filter(q => q.qtype === "multiple_select" && ((q.k === 3) || (Array.isArray(q.correct) && q.correct.length === 3)));
      out.push(...pick(pool, sec.count));
    });
    return out;
  }

  /* ---------- «Сирі» бали за типами ---------- */
  function maxPointsForQuestion(q) {
    switch (q.qtype) {
      case "multiple_choice": return 1;
      case "multiple_select": return Array.isArray(q.correct) ? q.correct.length : (q.k || 3);
      case "match":           return (q.left || []).length;
      case "order":           return 3;
      case "short_answer":    return 2;
      case "cloze":           return (q.blanks || []).length;
      default:                return 0;
    }
  }

  /* ---------- Універсальна нормалізація відповідей ---------- */
  const norm = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const sortArr = a => [...a].sort((x, y) => x - y).join(",");

  function recomputeOne(q, answer, meta = {}) {
    // <- нове: явний пропуск завжди «не відповідали»
    if (meta.skipped) return { answered: false, ok: false, answer: null, userShown: "" };

    if (q.qtype === "multiple_choice") {
      const val = Number(answer);
      if (Number.isNaN(val)) return { answered: false, ok: false, answer: null, userShown: "" };
      const ok = val === Number(q.correct);
      return { answered: true, ok, answer: val, userShown: q.options[val] };
    }

    if (q.qtype === "short_answer") {
      const val = String(answer ?? "");
      const answered = val.trim() !== "";
      const ok = answered && (q.answers || []).some(a => norm(a) === norm(val));
      return { answered, ok, answer: val, userShown: val };
    }

    if (q.qtype === "multiple_select") {
      const arr = Array.isArray(answer) ? answer.map(Number) : [];
      const answered = arr.length > 0;
      const ok = answered && sortArr(arr) === sortArr(q.correct || []);
      const userShown = arr.map(i => q.options[i]).join(", ");
      return { answered, ok, answer: arr, userShown };
    }

    if (q.qtype === "match") {
      const arr = Array.isArray(answer) ? answer.map(v => (v == null ? null : Number(v))) : [];
      const full = arr.length === (q.left || []).length && !arr.some(v => v == null);
      const ok = full && (q.left || []).every((_, i) => Number(arr[i]) === Number(q.correctMap[String(i)]));
      const userShown = (q.left || []).map((L, i) => `${L} → ${arr[i] != null ? q.options[arr[i]] : "—"}`).join("; ");
      return { answered: full, ok, answer: arr, userShown };
    }

    if (q.qtype === "order") {
      const arr = Array.isArray(answer) ? answer : [];
      const touched = !!meta.touched; // тільки якщо був перетяг
      let ok = false;
      if (touched && Array.isArray(q.correct)) ok = arr.join("||") === q.correct.join("||");
      const userShown = arr.join(" → ");
      return { answered: touched, ok, answer: arr, userShown };
    }

    if (q.qtype === "cloze") {
      const arr = Array.isArray(answer) ? answer : [];
      const answered = arr.some(x => String(x ?? "").trim() !== "");
      const ok = answered && (q.blanks || []).every((v, i) => norm(v) === norm(arr[i] || ""));
      const userShown = arr.join(" | ");
      return { answered, ok, answer: arr, userShown };
    }

    return { answered: false, ok: false, answer, userShown: "" };
  }

  function rawPoints(q, rec) {
    if (!rec.answered) return 0;
    switch (q.qtype) {
      case "multiple_choice": return rec.ok ? 1 : 0;
      case "short_answer":    return rec.ok ? 2 : 0;
      case "multiple_select": {
        const a = new Set(rec.answer || []); let sum = 0;
        (q.correct || []).forEach(i => { if (a.has(i)) sum++; });
        return sum;
      }
      case "match": {
        const a = rec.answer || []; let sum = 0;
        (q.left || []).forEach((_, i) => { if (Number(a[i]) === Number(q.correctMap[String(i)])) sum++; });
        return sum;
      }
      case "order": {
        if (!rec.answered || !Array.isArray(q.correct)) return 0;
        const u = rec.answer || [];
        const all = u.join("||") === q.correct.join("||");
        const first = u[0] === q.correct[0];
        const last  = u[u.length - 1] === q.correct[q.correct.length - 1];
        if (all) return 3; if (first && last) return 2; if (first || last) return 1; return 0;
      }
      case "cloze": {
        const a = rec.answer || []; let sum = 0;
        (q.blanks || []).forEach((v, i) => { if (norm(v) === norm(a[i] || "")) sum++; });
        return sum;
      }
      default: return 0;
    }
  }

  /* ---------- Маппінг у тестові та NMT ---------- */
  function nmtScoreFromTestPoints(subjectKey, testPts) {
    const spec = SPEC[subjectKey]; if (!spec) return 0;
    if (testPts < spec.threshold) return 0;
    const scaled = 100 + ((testPts - spec.threshold) * (100 / (spec.maxScore - spec.threshold)));
    return Math.max(0, Math.min(200, Math.round(scaled)));
  }

  function computeFinal(subjectKey, list, storedAnswers) {
    const answers = list.map((q, i) => storedAnswers[i] || { answer: null, meta: {} });

    const recomputed = answers.map((rec, i) => {
      const q = list[i];
      const r = recomputeOne(q, rec.answer, rec.meta);
      return {
        q: JSON.parse(JSON.stringify(q)),
        answer: rec.answer,
        userShown: r.userShown || (rec.answer == null ? "(пропущено)" : ""),
        ok: r.ok,
        answered: r.answered
      };
    });

    const asked = list.length;
    let correct = 0, incorrect = 0, skipped = 0;
    let raw = 0, rawMax = 0;

    recomputed.forEach((rec, i) => {
      const q = list[i];
      raw += rawPoints(q, rec);
      rawMax += maxPointsForQuestion(q);
      if (!rec.answered) skipped++;
      else if (rec.ok) correct++;
      else incorrect++;
    });

    const spec = SPEC[subjectKey];
    const factor = rawMax > 0 ? (spec.maxScore / rawMax) : 1;
    const testPts = raw * factor;
    const nmt = nmtScoreFromTestPoints(subjectKey, testPts);

    return { asked, correct, incorrect, skipped, testPts: Math.round(testPts * 100) / 100, score: nmt, items: recomputed };
  }

  /* ---------- Рендер питання ---------- */
  function renderQuestion($box, q) {
    $box.empty();
    $box.append(`<div class="mb-8"><strong>${q.text}</strong></div>`);

    if (q.qtype === "multiple_choice") {
      const order = [...Array(q.options.length).keys()];
      const view = q.shuffle ? shuffle(order) : order;
      const html = view.map(idx => `
        <label class="option">
          <input type="radio" name="ans" value="${idx}">
          <div>${q.options[idx]}</div>
        </label>`).join("");
      $box.append(`<form class="options-grid">${html}</form>`);
    }

    if (q.qtype === "short_answer") {
      $box.append(`<form><input class="inl" type="text" name="ans" placeholder="Відповідь"></form>`);
    }

    if (q.qtype === "multiple_select") {
      const order = [...Array(q.options.length).keys()];
      const view = q.shuffle ? shuffle(order) : order;
      const opts = view.map(idx => `
        <label class="option">
          <input type="checkbox" name="ans" value="${idx}">
          <div>${q.options[idx]}</div>
        </label>`).join("");
      $box.append(`<div class="muted">Обери рівно ${q.k}</div><form class="options-grid">${opts}</form>`);
      $box.on("change", "input[type=checkbox]", function(){
        const k = q.k || 3;
        const checked = $('input[name=ans]:checked').length;
        $('input[name=ans]').prop('disabled', checked >= k).filter(':checked').prop('disabled', false);
        $('#next').prop('disabled', checked === 0);
      });
    }

    if (q.qtype === "match") {
      const letters = (q.options || []).map((_, i) => String.fromCharCode(1040 + i));
      const lists = `
        <div class="match-lists row wrap">
          <div class="col card">
            <div class="mb-8"><strong>Початок речення</strong></div>
            ${(q.left || []).map((t, i) => `<div class="rowitem"><span class="chip">${i + 1}</span><div>${t}</div></div>`).join("")}
          </div>
          <div class="col card">
            <div class="mb-8"><strong>Закінчення речення</strong></div>
            ${(q.options || []).map((t, i) => `<div class="rowitem"><span class="chip">${letters[i]}</span><div>${t}</div></div>`).join("")}
          </div>
        </div>`;
      const head = `<tr><th class="head"></th>${letters.map(l => `<th class="head"><span class="badge">${l}</span></th>`).join("")}</tr>`;
      const rows = (q.left || []).map((_, r) => {
        const tds = (q.options || []).map((_, c) => `<td><input type="radio" name="r${r}" value="${c}"></td>`).join("");
        return `<tr><th class="head"><span class="badge">${r + 1}</span></th>${tds}</tr>`;
      }).join("");
      $box.append(lists + `<div class="matrix-title">Позначте відповіді:</div><div class="matrix"><table>${head}${rows}</table></div>`);
      $box.on("change","input[type=radio]",function(){
        const col = $(this).val();
        $(`input[type=radio][value="${col}"]`).not(this).prop("checked", false);
        $('#next').prop('disabled', false);
      });
    }

    if (q.qtype === "order") {
      q._touched = false;
      const items = (q.items || []).map(t => `<li class="option" draggable="true"><div>${t}</div></li>`).join("");
      $box.append(`<form><ul id="ord" class="list dnd">${items}</ul></form>`);
      let dragEl = null;
      $('#ord').on('dragstart','li',function(e){ dragEl=this; q._touched=true; e.originalEvent.dataTransfer.effectAllowed='move'; $(this).addClass('dragging');});
      $('#ord').on('dragover','li',e=>e.preventDefault());
      $('#ord').on('drop','li',function(e){
        e.preventDefault();
        if (dragEl && dragEl !== this) {
          if ($(dragEl).index() < $(this).index()) $(this).after(dragEl); else $(this).before(dragEl);
        }
        $(dragEl).removeClass('dragging'); $('#next').prop('disabled', false);
      });
      enableTouchSort(document.getElementById('ord'), ()=>{ q._touched = true; });
    }

    if (q.qtype === "cloze") {
      let html = q.text;
      (q.blanks || []).forEach((_, i) => {
        html = html.replace(new RegExp("\\{\\{" + (i + 1) + "\\}\\}", "g"), `<input class="inl" type="text" name="blank_${i}">`);
      });
      $box.append(`<form>${html}</form>`);
    }

    // активуємо «Далі», коли щось вибрано/введено
    $box.on("input change", "input,select", () => $('#next').prop('disabled', false));
    if (window.MathJax?.typeset) window.MathJax.typeset();
  }

  // touch-sort для мобілок
  function enableTouchSort(ul, onTouch) {
    if (!ul) return;
    let dragging = null;
    const onStart = ev => {
      const li = ev.target.closest('li'); if (!li) return;
      dragging = li; li.classList.add('dragging'); if (onTouch) onTouch();
      document.addEventListener('touchmove', onMove, {passive:false});
      document.addEventListener('pointermove', onMove, {passive:false});
      document.addEventListener('touchend', onEnd, {passive:false});
      document.addEventListener('pointerup', onEnd, {passive:false});
      ev.preventDefault();
    };
    const onMove = ev => {
      if (!dragging) return;
      const p = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
      const overEl = document.elementFromPoint(p.clientX, p.clientY);
      const over = overEl?.closest?.('li');
      if (!over || over === dragging || over.parentElement !== ul) return;
      const rect = over.getBoundingClientRect();
      const before = p.clientY < rect.top + rect.height / 2;
      if (before) ul.insertBefore(dragging, over); else ul.insertBefore(dragging, over.nextSibling);
      ev.preventDefault(); if (onTouch) onTouch();
    };
    const onEnd = () => { if (!dragging) return; dragging.classList.remove('dragging'); dragging = null; $('#next').prop('disabled', false); };
    ul.addEventListener('touchstart', onStart, {passive:false});
    ul.addEventListener('pointerdown', onStart, {passive:false});
  }

  /* ---------- TEST page ---------- */
  if (document.body.classList.contains('test')) {
    const key  = new URLSearchParams(location.search).get('subject');
    const spec = SPEC[key];
    if (!spec) { $('#qbox').html('<div class="muted">Невідомий предмет</div>'); $('#next,#skip').prop('disabled', true); return; }

    $('#subjectName').text(spec.name);
    $('.loading').addClass('active');

    // ГЛОБАЛЬНО БЛОКУЄМО Enter (нічого не робимо)
    $(document).on('keydown.nmt', function(e){
      if (e.key === 'Enter') { e.preventDefault(); return false; }
    });

    $.getJSON('data/index.json').done(function (man) {
      const files = man[key] || [];
      const reqs  = files.map(f => $.getJSON('data/' + f));

      $.when.apply($, reqs).done(function () {
        const raws = (reqs.length === 1) ? [arguments[0]] : Array.from(arguments).map(a => a[0]);
        const all  = raws.map(r => normalizeQuestion(r)).filter(Boolean);
        const list = selectBySpec(all, spec);

        const state = { i: 0, list, start: Date.now(), answers: [], subjectKey: key, subjectName: spec.name };
        const total = list.length;

        setInterval(() => {
          const s = Math.floor((Date.now() - state.start) / 1000);
          $('#time').text(pad(Math.floor(s / 60)) + ':' + pad(s % 60));
        }, 1000);

        const updateBar = () => {
          $('#plabel').text(state.i + ' / ' + total);
          $('#pbar').css('width', (total ? (100 * state.i / total) : 0) + '%');
        };

        function readAnswer(q) {
          if (q.qtype === 'multiple_choice') return Number($('input[name=ans]:checked').val());
          if (q.qtype === 'short_answer')    return String($('input[name=ans]').val() || '');
          if (q.qtype === 'match')           return (q.left || []).map((_, i) => { const v = $(`input[name=r${i}]:checked`).val(); return v == null ? null : Number(v); });
          if (q.qtype === 'multiple_select') return $('input[name=ans]:checked').map(function(){ return Number(this.value); }).get();
          if (q.qtype === 'order')           return $('#ord li').map(function(){ return $(this).text(); }).get();
          if (q.qtype === 'cloze')           return (q.blanks || []).map((_, i) => $(`input[name=blank_${i}]`).val() || '');
          return null;
        }

        function snapshot(q) { return JSON.parse(JSON.stringify(q)); }

        function render() {
          updateBar();
          $('#next').prop('disabled', true);
          if (state.i >= total) return finish();
          renderQuestion($('#qbox'), state.list[state.i]);
        }

        function finish() {
          const spent = Math.floor((Date.now() - state.start) / 1000);
          const final = computeFinal(key, state.list, state.answers);

          const pack = {
            subjectKey: key,
            subjectName: spec.name,
            asked: final.asked,
            correct: final.correct,
            incorrect: final.incorrect,
            skipped: final.skipped,
            spentSec: spent,
            score: final.score,
            testPts: final.testPts,
            items: final.items
          };
          sessionStorage.setItem('nmtResult', JSON.stringify(pack));
          location.href = 'result.html';
        }

        $('#next').on('click', function () {
          const q   = state.list[state.i];
          const ans = readAnswer(q);
          const rec = recomputeOne(q, ans, { touched: !!q._touched });
          state.answers[state.i] = { q: snapshot(q), answer: ans, meta: { touched: !!q._touched }, userShown: rec.userShown };
          state.i++; render();
        });

        $('#skip').on('click', function () {
          const q = state.list[state.i];
          // <- нове: явний прапорець пропуску
          state.answers[state.i] = { q: snapshot(q), answer: null, meta: { skipped: true }, userShown: "(пропущено)" };
          state.i++; render();
        });

        $('.loading').removeClass('active');
        render();
      }).fail(() => { $('.loading').removeClass('active'); $('#qbox').html('Не вдалося завантажити банк'); });
    }).fail(() => { $('.loading').removeClass('active'); $('#qbox').html('Не вдалося завантажити маніфест'); });
  }

  /* ---------- RESULT page ---------- */
  if (document.body.classList.contains('result')) {
    const data = sessionStorage.getItem('nmtResult');
    if (!data) { $('.container').prepend('<div class="card">Немає результату</div>'); return; }
    const res = JSON.parse(data);

    const t = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);

    $('#r-subject').text(res.subjectName);
    $('#r-total').text(res.asked);
    $('#r-correct').text(res.correct);
    $('#r-wrong').text(res.incorrect);
    $('#r-time').text(t(res.spentSec));
    $('#r-score').text(String(res.score));
    $('#lead-subject').val(res.subjectName);

    const leadMsg = score => {
      if (score < 150) return `Твій орієнтовний бал ${score}. Запишіться на пробний урок — допоможемо швидко закрити прогалини.`;
      if (score < 180) return `Твій орієнтовний бал ${score}. Запишіться на урок — сформуємо план, щоб упевнено вийти на 180+.`;
      if (score < 200) return `Твій орієнтовний бал ${score}. Чудово! На уроці підберемо стратегію, щоб узяти усі 200!`;
      return `Вітаємо з максимальним результатом! Підтримай форму пробним уроком.`;
    };
    $('.card h3').after(`<p class="muted" id="lead-msg">${leadMsg(res.score)}</p>`);

    // агрегування для карток
    function agg(kind){
      const map={};
      (res.items||[]).forEach(it=>{
        const q=it.q;
        const tags=(kind==='topics')?[q.raw?.theme||q.theme]:((q.raw?.skills)||q.skills||[]);
        tags.forEach(tag=>{
          if(!tag) return;
          if(!map[tag]) map[tag]={r:0,t:0};
          map[tag].t++; if(it.ok===true) map[tag].r++;
        });
      });
      return map;
    }
    function renderCards(map,tgt){
      const html=Object.keys(map).sort().map(k=>{
        const m=map[k], pct=m.t?Math.round(100*m.r/m.t):0;
        return `<div class="kpi">
          <div class="between"><div class="title">${k}</div><div>${m.r}/${m.t} (${pct}%)</div></div>
          <div class="mbar"><div style="width:${pct}%"></div></div>
        </div>`;
      }).join('')||'<div class="muted">Порожньо</div>';
      $(tgt).html(`<div class="kpi-grid">${html}</div>`);
    }
    renderCards(agg('topics'),'#acc-topics');
    renderCards(agg('skills'),'#acc-skills');
    
    // === Аналіз роботи: ВСІ завдання, з «частково правильно» ===
    const analysis = (res.items || []).map((it, i) => {
      const q = it.q;

      // підрахунок «сирих» балів для виявлення частково правильних
      const ptsMax = maxPointsForQuestion(q);
      const ptsNow = rawPoints(q, { answered: it.answered, ok: it.ok, answer: it.answer });

      let status='skip', statusLabel='Пропущено', style='';
      if (it.answered) {
        if (it.ok === true) { status='ok'; statusLabel='Правильно'; }
        else if (ptsNow > 0 && ptsNow < ptsMax) { status='partial'; statusLabel='Частково правильно'; style=' style="background:#fff8dc;border-left-color:#f1c40f"'; }
        else { status='wrong'; statusLabel='Неправильно'; }
      }

      const scoreBadge = it.answered ? `<span class="badge" title="Нараховано / Макс">${ptsNow}/${ptsMax}</span>` : '';

      const correct = (() => {
        if (q.qtype === 'multiple_choice') return q.options[q.correct];
        if (q.qtype === 'short_answer')    return (q.answers || []).join(' / ');
        if (q.qtype === 'multiple_select') return (q.correct || []).map(i => q.options[i]).join(', ');
        if (q.qtype === 'match')           return Object.keys(q.correctMap || {}).map(idx => `${q.left[Number(idx)]} → ${q.options[q.correctMap[idx]]}`).join('; ');
        if (q.qtype === 'order')           return Array.isArray(q.correct) ? q.correct.join(' → ') : '(ключ відсутній)';
        if (q.qtype === 'cloze')           return (q.blanks || []).join(' | ');
        return '';
      })();

      const user = it.userShown || '(пропущено)';

      return `<div class="analysis-item ${status}"${style}>
          <div><span class="status">${statusLabel}.</span><strong>${i+1}.</strong> ${q.text} ${scoreBadge}</div>
          <div class="muted">Ваша відповідь: ${user}</div>
          <div class="muted">Правильно: ${correct}</div>
        </div>`;
    }).join('') || '<div class="muted">Немає даних.</div>';

    $('#acc-analysis').html(analysis);
    if (window.MathJax?.typeset) window.MathJax.typeset();
    $('details.acc').first().prop('open', false);
  }
})(jQuery);
