/* AntiSchool NMT — SIM MODE (deck nav, timer, result screen + lead form) */
(() => {
  const nmt = (window.nmt = window.nmt || {});
  const UI = {
    header: document.getElementById("HEADER"),
    subj:   document.getElementById("SUBJECT_BADGE"),
    counter:document.getElementById("COUNTER"),
    timer:  document.getElementById("TIMER"),
    saved:  document.getElementById("SAVED"),
    bar:    document.getElementById("PROGBAR"),
    stage:  document.getElementById("STAGE"),
    result: document.getElementById("RESULT"),
    btnPrev:document.getElementById("BTN_PREV"),
    btnNext:document.getElementById("BTN_NEXT"),
    btnFinish:document.getElementById("BTN_FINISH"),
  };

const qs = new URLSearchParams(location.search);
const urlSubject = (qs.get("s") || qs.get("subject") || "").trim();

const S = {
  // URL має найвищий пріоритет; якщо його немає — беремо зі сховища; інакше — math
  subject: urlSubject || sessionStorage.getItem("nmt_subject") || "math",
  manifest: null,
  deck: [],
  idx: 0,
  view: null,
  answers: {},
  timerId: null,
  elapsedSec: 0,
  startedAt: Date.now(),
};

// якщо прийшло з URL — перезаписуємо сховище (щоб не залипало "math")
if (urlSubject) sessionStorage.setItem("nmt_subject", S.subject);

// корисний лог для діагностики
console.log("[NMT] subject =", S.subject, "urlParam =", urlSubject, "stored =", sessionStorage.getItem("nmt_subject"));


  // ---------- timer ----------
  function startTimer(){
    stopTimer();
    S.timerId = setInterval(() => {
      S.elapsedSec++;
      const m = String(Math.floor(S.elapsedSec / 60)).padStart(2, "0");
      const s = String(S.elapsedSec % 60).padStart(2, "0");
      if (UI.timer) UI.timer.textContent = `${m}:${s}`;
    }, 1000);
  }
  function stopTimer(){ if (S.timerId) clearInterval(S.timerId); S.timerId = null; }

  // ---------- local save ----------
  const LKEY = (s)=>`nmt_run_${s}`;
  function saveLocal(){
    try { localStorage.setItem(LKEY(S.subject), JSON.stringify({answers:S.answers, idx:S.idx, t:S.elapsedSec})); } catch {}
  }
  function restoreLocal(){
    try {
      const raw = localStorage.getItem(LKEY(S.subject)); if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj?.answers) S.answers = obj.answers;
      if (Number.isInteger(obj?.idx)) S.idx = obj.idx;
      if (Number.isInteger(obj?.t)) {
        S.elapsedSec = obj.t;
        const m = String(Math.floor(S.elapsedSec/60)).padStart(2,"0");
        const s = String(S.elapsedSec%60).padStart(2,"0");
        if (UI.timer) UI.timer.textContent = `${m}:${s}`;
      }
    } catch {}
  }
  function clearLocal(){ try { localStorage.removeItem(LKEY(S.subject)); } catch {} }

  // ---------- header / progress ----------
  function subjectName(k){
    return {math:"Математика", ukr:"Українська мова", eng:"Іноземні мови", history:"Історія України"}[k] || k;
  }
  function updateHeader(){
    const total = S.deck.length;
    if (UI.subj){ UI.subj.textContent = subjectName(S.subject); UI.subj.setAttribute("data-subject", S.subject); }
    if (UI.counter) UI.counter.textContent = `Питання ${Math.min(S.idx+1,total)} / ${total}`;
    if (UI.bar){
      const pct = total ? Math.round((S.idx / total) * 100) : 0;
      UI.bar.style.width = `${pct}%`;
      UI.bar.setAttribute("aria-valuenow", String(pct));
    }
  }

  // ---------- navigation ----------
  function renderCurrent(){
    const q = S.deck[S.idx]; if (!q) return;
    const saved = S.answers[q.id];

    try { S.view = nmt.renderQuestion(UI.stage, q, saved); }
    catch (e) {
      console.error("[Render error]", e);
      if (UI.stage) UI.stage.innerHTML = `<div class="q-card"><div class="q-body">Помилка: ${e.message}</div></div>`;
      return;
    }
    updateHeader();

    const isFirst = S.idx === 0;
    const isLast  = S.idx === S.deck.length - 1;
    UI.btnPrev?.toggleAttribute("disabled", isFirst);
    UI.btnNext?.classList.toggle("hidden", isLast);
    UI.btnNext?.toggleAttribute("disabled", isLast);
    UI.btnFinish?.classList.toggle("hidden", !isLast);
  }

  function go(delta){
    const cur = S.deck[S.idx];
    if (cur && S.view) S.answers[cur.id] = S.view.getAnswer();
    S.idx = Math.max(0, Math.min(S.idx + delta, S.deck.length - 1));
    saveLocal();
    renderCurrent();
    flashSaved();
  }

  function flashSaved(){
    if (!UI.saved) return;
    UI.saved.textContent = "Збережено";
    UI.saved.classList.add("visible");
    setTimeout(()=>UI.saved.classList.remove("visible"), 700);
  }

  // ---------- results ----------
  function finish(){
    // зберегти останню
    const q = S.deck[S.idx];
    if (q && S.view) S.answers[q.id] = S.view.getAnswer();
    stopTimer();
    saveLocal();

    // агрегація
    let correctCount = 0;
    const rows = [];
    const byTheme = new Map();
    const bySkill = new Map();
    const ensure = (map,key)=>{ if(!map.has(key)) map.set(key,{total:0,correct:0,wrong:0}); return map.get(key); };

    for (const qq of S.deck){
      const u = S.answers[qq.id];
      const res = nmt.scoreQuestion(qq, u, { _shuffleMap: qq._meta?.optionShuffle });
      if (res.ok) correctCount++;

      rows.push({ id: qq.id, type: qq._meta.type, ok: res.ok, explanation: qq.explanation || "" });

      const theme = (qq.theme && String(qq.theme)) || "Без теми";
      const t = ensure(byTheme, theme);
      t.total += 1; res.ok ? (t.correct += 1) : (t.wrong += 1);

      const skills = Array.isArray(qq.skills) ? qq.skills : qq.skills ? [qq.skills] : [];
      for (const s of skills){
        const k = ensure(bySkill, String(s));
        k.total += 1; res.ok ? (k.correct += 1) : (k.wrong += 1);
      }
    }

    clearLocal();

    // красиві таблиці
    const renderTable = (title, map) => {
      if (!map.size) return "";
      const data = Array.from(map.entries()).sort((a,b)=>b[1].total-a[1].total);
      const trs = data.map(([name, s])=>{
        const pct = s.total ? Math.round((s.correct/s.total)*100) : 0;
        const tier = pct>=70?"good": pct>=40?"mid":"low";
        return `<tr class="tier-${tier}">
          <td class="t-name">
            <div class="t-name-top">
              <span class="name">${nmt.esc(name)}</span>
              <span class="badge-acc">${pct}%</span>
            </div>
            <div class="meter" role="img" aria-label="Правильних ${s.correct} з ${s.total}">
              <span style="width:${pct}%"></span>
            </div>
          </td>
          <td class="t-num">${s.total}</td>
          <td class="t-ok">${s.correct}</td>
          <td class="t-bad">${s.wrong}</td>
        </tr>`;
      }).join("");
      return `
        <details class="result-details">
          <summary>${title}</summary>
          <div class="table-wrap">
            <table class="score-table">
              <thead>
                <tr><th>Назва</th><th>Завдань</th><th>Правильних</th><th>Неправильних</th></tr>
              </thead>
              <tbody>${trs}</tbody>
            </table>
          </div>
        </details>
      `;
    };

    // очікувана кількість (warning)
    const seq = Array.isArray(S.manifest?.sequence)
      ? S.manifest.sequence
      : (window.nmt.SEQUENCE_BY_SUBJECT?.[S.subject] || []);
    const expectedTotal = seq.reduce((s,[,n])=>s+(+n||0),0);
    const shortWarn = S.deck.length < expectedTotal;

    // оформлення екрана результатів
    document.body.classList.add("results-mode");
    document.querySelector(".controls")?.classList.add("hidden");
    if (UI.stage){ UI.stage.innerHTML=""; UI.stage.classList.add("hidden"); }

    if (UI.header){
      UI.header.classList.remove("hidden");
      UI.header.innerHTML = `
        <div class="container header-row header-results">
          <div class="brand">
              <img src="../assets/logo.svg" alt="" style="width: 32%;">
          </div>
          <a class="btn link" href="${nmt.ROOT}/index.html">На головну</a>
        </div>
      `;
      const pb = document.querySelector(".progress"); if (pb) pb.remove();
    }

    if (UI.result){
      UI.result.innerHTML = `
        <div class="result-card">
          <div class="result-main">
            <div class="result-score">
              <div class="num">${correctCount}</div>
              <div class="denom">з ${S.deck.length}</div>
            </div>
            <div class="result-text">
              <h2>Готово! Попередній результат:</h2>
              <p>Правильних відповідей: <b>${correctCount}</b> із ${S.deck.length}.</p>
              ${shortWarn ? `<p class="warn" style="color:#b45309">Формовано ${S.deck.length} із ${expectedTotal} запланованих завдань — перевірте <code>manifest.json</code>.</p>` : ""}
            </div>
          </div>

          ${renderTable("Підсумок за темами", byTheme)}
          ${renderTable("Підсумок за навичками", bySkill)}

          <details class="result-details">
            <summary>Пояснення до завдань</summary>
            <ol class="explanations">
              ${rows.map(r => `
                <li class="${r.ok ? "ok" : "bad"}">
                  <div class="exp-head">
                    <span class="pill ${r.ok ? "ok" : "bad"}">${r.ok ? "✔ Правильно" : "✖ Неправильно"}</span>
                    <span class="pill type">${r.type}</span>
                  </div>
                  <div class="exp-body">${r.explanation || "—"}</div>
                </li>
              `).join("")}
            </ol>
          </details>
        </div>

<section class="lead-wrap">
  <div class="lead-inner">
    <div class="lead-copy">
      <h3 class="lead-h">Запишіться на безкоштовний урок до НМТ вже сьогодні</h3>
      <p class="lead-sub">
        Підготуйтеся до тесту НМТ з максимальним комфортом, підтримкою та результатом разом з АнтиШколою.
        Оберіть предмет, залишіть контакти — і ми допоможемо скласти персональний план навчання
      </p>
    </div>

    <!-- Біла картка з формою -->
    <form id="LEAD_FORM" class="lead-form" autocomplete="on">
      <label class="field">
        <span>Ім’я та прізвище</span>
        <input type="text" name="full_name" placeholder="Введіть ваше ім’я та прізвище" required>
      </label>

      <label class="field">
        <span>Email</span>
        <input type="email" name="email" placeholder="Введіть ваш email" required>
      </label>

      <label class="field">
        <span>Телефон</span>
        <input type="tel" name="phone" placeholder="+49 (999) 999-99999" required>
      </label>

      <label class="field">
        <span>Предмет</span>
        <div class="select">
          <select name="subject" required>
            <option value="Математика">Математика</option>
            <option value="Українська мова">Українська мова</option>
            <option value="Історія України">Історія України</option>
            <option value="Іноземні мови">Іноземні мови</option>
          </select>
          <svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </label>

      <!-- опціонально: оцінка/результат -->
      <input type="hidden" name="score" id="LF_SCORE" value="">

      <button class="lead-btn" type="submit">Отримати пробне заняття</button>
    </form>
  </div>

  <!-- лоадер для твоїх AJAX-відправок -->
  <div class="logading-box" aria-hidden="true">
    <div class="spinner"></div><div>Надсилаємо…</div>
  </div>
</section>

      `;

      // jQuery + ajax submit (за твоїм сніпетом)
      (function attachJqSubmit(){
        function bind(){
          $("#LEAD_FORM").on("submit", function(e){
            e.preventDefault();
            $('.logading-box').addClass('logading-box__active');
            $.ajax({
              url: 'send.php',
              type: 'POST',
              dataType: 'json',
              data: $(this).serialize(),
              success: function(res) {
                $('.logading-box').removeClass('logading-box__active');
                console.log(res);
                alert("Дякуємо! Ми зв'яжемося з вами найближчим часом.");
              },
              error: function(err) {
                console.log(err);
                $('.logading-box').removeClass('logading-box__active');
                alert("Не вдалося надіслати форму. Спробуйте ще раз.");
              }
            });
          });
        }
        if (window.jQuery) return bind();
        const s = document.createElement("script");
        s.src = "https://code.jquery.com/jquery-3.7.1.min.js";
        s.onload = bind;
        document.head.appendChild(s);
      })();

      nmt.typeset(UI.result);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // кнопки (після оголошення finish!)
  UI.btnPrev?.addEventListener("click", () => go(-1));
  UI.btnNext?.addEventListener("click", () => go(+1));
  UI.btnFinish?.addEventListener("click", finish);

  // ---------- boot ----------
  (async function boot(){
    try{
      const manifest = await nmt.loadManifest(S.subject);
      S.manifest = manifest;

      const deckMeta = nmt.buildDeck(manifest);
      if (!deckMeta.length) {
        console.warn("[NMT] buildDeck returned empty. Debug:", {
          subject: S.subject,
          manifest,
          sequence: manifest.sequence || (window.nmt?.SEQUENCE_BY_SUBJECT?.[S.subject] || null),
        });
        throw new Error("Не вдалося сформувати колоду (перевірте manifest.json).");
      }

      S.deck = await nmt.loadDeck(deckMeta);
      restoreLocal();
      startTimer();
      renderCurrent();
    }catch(e){
      console.error("[Boot error]", e);
      if (UI.stage) UI.stage.innerHTML = `<div class="q-card"><div class="q-body">Помилка: ${e.message}</div></div>`;
    }
  })();
})();
