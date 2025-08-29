/* AntiSchool NMT — SCORING */
(() => {
  const nmt = (window.nmt = window.nmt || {});

  function scoreSingle(q, userIndex, meta) {
    const mcq = q?.variants?.multiple_choice || {};
    const optsLen = Array.isArray(mcq.options) ? mcq.options.length : 0;
    if (typeof userIndex !== "number" || userIndex < 0 || userIndex >= optsLen) return { ok:false, got:0, max:1 };
    const map = Array.isArray(meta?._shuffleMap) && meta._shuffleMap.length === optsLen
      ? meta._shuffleMap
      : Array.from({length:optsLen}, (_,i)=>i);
    const originalIndex = map[userIndex];
    const correct = Number(mcq.correct ?? -1);
    const ok = originalIndex === correct;
    return { ok, got: ok ? 1 : 0, max: 1 };
  }

  function scoreMatch(q, userMap) {
    const correctMap = q?.variants?.match?.correctMap || {};
    const arr = Array.isArray(userMap) ? userMap : [];
    for (let i = 0; i < arr.length; i++) {
      const expected = Number(correctMap[String(i)]);
      if (arr[i] !== expected) return { ok:false, got:0, max:1 };
    }
    return { ok:true, got:1, max:1 };
  }

  function scoreShort(q, userText) {
    const acceptable = q?.variants?.short_answer?.answers?.map((s)=>nmt.normalize(s)) || [];
    const user = nmt.normalize(userText);
    const ok = acceptable.includes(user);
    return { ok, got: ok ? 1 : 0, max: 1 };
  }

  function scoreOrder(q, userOrder) {
    const items = q?.variants?.order?.items || [];
    const n = items.length;
    if (!Array.isArray(userOrder) || userOrder.length !== n) return { ok:false, got:0, max:1 };
    for (let i = 0; i < n; i++) if (userOrder[i] !== i) return { ok:false, got:0, max:1 };
    return { ok:true, got:1, max:1 };
  }

  function scoreMulti(q, userIdxs, meta) {
    const ms = q?.variants?.multiple_select || {};
    const optsLen = Array.isArray(ms.options) ? ms.options.length : 0;

    const sel = Array.isArray(userIdxs) ? [...new Set(userIdxs.filter((n)=>Number.isInteger(n) && n>=0 && n<optsLen))] : [];
    const K   = Number.isInteger(ms.k) ? ms.k : (Array.isArray(ms.correct) ? ms.correct.length : 3);
    if (sel.length !== K) return { ok:false, got:0, max:1 };

    const map = Array.isArray(meta?._shuffleMap) && meta._shuffleMap.length === optsLen
      ? meta._shuffleMap
      : Array.from({length:optsLen}, (_,i)=>i);

    const originalChosen = sel.map(i => map[i]).sort((a,b)=>a-b);
    const correct = (Array.isArray(ms.correct) ? ms.correct.map(Number) : []).sort((a,b)=>a-b);

    const ok = originalChosen.length === correct.length && originalChosen.every((v,i)=>v===correct[i]);
    return { ok, got: ok ? 1 : 0, max:1 };
  }

  nmt.scoreQuestion = (q, user, meta) => {
    switch (q._meta?.type) {
      case "single": return scoreSingle(q, user, meta);
      case "match":  return scoreMatch(q, user);
      case "short":  return scoreShort(q, user);
      case "order":  return scoreOrder(q, user);
      case "multi":  return scoreMulti(q, user, meta);
      default:       return { ok:false, got:0, max:1 };
    }
  };
})();
