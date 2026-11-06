/*! fusen | MIT License | Copyright (c) 2026 chokolademilch7
 * Bundles (MIT License): solid-js, Copyright (c) 2016-2025 Ryan Carniato;
 * xstate and @xstate/solid, Copyright (c) 2015 David Khourshid.
 * Icons (Apache License 2.0): Material Symbols, Copyright Google LLC.
 * https://github.com/chokolademilch7/fusen/blob/main/THIRD_PARTY_NOTICES.md */
const io = (t, e) => t === e, st = /* @__PURE__ */ Symbol("solid-proxy"), Ae = /* @__PURE__ */ Symbol("solid-track"), Zt = {
  equals: io
};
let Jn = tr;
const et = 1, Wt = 2, Qn = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
var T = null;
let pe = null, E = null, L = null, K = null, se = 0;
function Bt(t, e) {
  const n = E, r = T, o = t.length === 0, s = e === void 0 ? r : e, i = o ? Qn : {
    owned: null,
    cleanups: null,
    context: s ? s.context : null,
    owner: s
  }, a = o ? t : () => t(() => X(() => Tt(i)));
  T = i, E = null;
  try {
    return wt(a, !0);
  } finally {
    E = n, T = r;
  }
}
function j(t, e) {
  e = e ? Object.assign({}, Zt, e) : Zt;
  const n = {
    value: t,
    observers: null,
    observerSlots: null,
    comparator: e.equals || void 0
  }, r = (o) => (typeof o == "function" && (o = o(n.value)), Xn(n, o));
  return [Gn.bind(n), r];
}
function P(t, e, n) {
  const r = Re(t, e, !1, et);
  Mt(r);
}
function q(t, e, n) {
  Jn = uo;
  const r = Re(t, e, !1, et);
  r.user = !0, K ? K.push(r) : Mt(r);
}
function Z(t, e, n) {
  n = n ? Object.assign({}, Zt, n) : Zt;
  const r = Re(t, e, !0, 0);
  return r.observers = null, r.observerSlots = null, r.comparator = n.equals || void 0, Mt(r), Gn.bind(r);
}
function Yn(t) {
  return wt(t, !1);
}
function X(t) {
  if (E === null) return t();
  const e = E;
  E = null;
  try {
    return t();
  } finally {
    E = e;
  }
}
function xt(t) {
  q(() => X(t));
}
function R(t) {
  return T === null || (T.cleanups === null ? T.cleanups = [t] : T.cleanups.push(t)), t;
}
function $e() {
  return E;
}
function Gn() {
  if (this.sources && this.state)
    if (this.state === et) Mt(this);
    else {
      const t = L;
      L = null, wt(() => Ut(this), !1), L = t;
    }
  if (E) {
    const t = this.observers;
    if (!t || t[t.length - 1] !== E) {
      const e = t ? t.length : 0;
      E.sources ? (E.sources.push(this), E.sourceSlots.push(e)) : (E.sources = [this], E.sourceSlots = [e]), t ? (t.push(E), this.observerSlots.push(E.sources.length - 1)) : (this.observers = [E], this.observerSlots = [E.sources.length - 1]);
    }
  }
  return this.value;
}
function Xn(t, e, n) {
  let r = t.value;
  return (!t.comparator || !t.comparator(r, e)) && (t.value = e, t.observers && t.observers.length && wt(() => {
    for (let o = 0; o < t.observers.length; o += 1) {
      const s = t.observers[o], i = pe && pe.running;
      i && pe.disposed.has(s), (i ? !s.tState : !s.state) && (s.pure ? L.push(s) : K.push(s), s.observers && er(s)), i || (s.state = et);
    }
    if (L.length > 1e6)
      throw L = [], new Error();
  }, !1)), e;
}
function Mt(t) {
  if (!t.fn) return;
  Tt(t);
  const e = se;
  ao(t, t.value, e);
}
function ao(t, e, n) {
  let r;
  const o = T, s = E;
  E = T = t;
  try {
    r = t.fn(e);
  } catch (i) {
    return t.pure && (t.state = et, t.owned && t.owned.forEach(Tt), t.owned = null), t.updatedAt = n + 1, nr(i);
  } finally {
    E = s, T = o;
  }
  (!t.updatedAt || t.updatedAt <= n) && (t.updatedAt != null && "observers" in t ? Xn(t, r) : t.value = r, t.updatedAt = n);
}
function Re(t, e, n, r = et, o) {
  const s = {
    fn: t,
    state: r,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: e,
    owner: T,
    context: T ? T.context : null,
    pure: n
  };
  return T === null || T !== Qn && (T.owned ? T.owned.push(s) : T.owned = [s]), s;
}
function Vt(t) {
  if (t.state === 0) return;
  if (t.state === Wt) return Ut(t);
  if (t.suspense && X(t.suspense.inFallback)) return t.suspense.effects.push(t);
  const e = [t];
  for (; (t = t.owner) && (!t.updatedAt || t.updatedAt < se); )
    t.state && e.push(t);
  for (let n = e.length - 1; n >= 0; n--)
    if (t = e[n], t.state === et)
      Mt(t);
    else if (t.state === Wt) {
      const r = L;
      L = null, wt(() => Ut(t, e[0]), !1), L = r;
    }
}
function wt(t, e) {
  if (L) return t();
  let n = !1;
  e || (L = []), K ? n = !0 : K = [], se++;
  try {
    const r = t();
    return co(n), r;
  } catch (r) {
    n || (K = null), L = null, nr(r);
  }
}
function co(t) {
  if (L && (tr(L), L = null), t) return;
  const e = K;
  K = null, e.length && wt(() => Jn(e), !1);
}
function tr(t) {
  for (let e = 0; e < t.length; e++) Vt(t[e]);
}
function uo(t) {
  let e, n = 0;
  for (e = 0; e < t.length; e++) {
    const r = t[e];
    r.user ? t[n++] = r : Vt(r);
  }
  for (e = 0; e < n; e++) Vt(t[e]);
}
function Ut(t, e) {
  t.state = 0;
  for (let n = 0; n < t.sources.length; n += 1) {
    const r = t.sources[n];
    if (r.sources) {
      const o = r.state;
      o === et ? r !== e && (!r.updatedAt || r.updatedAt < se) && Vt(r) : o === Wt && Ut(r, e);
    }
  }
}
function er(t) {
  for (let e = 0; e < t.observers.length; e += 1) {
    const n = t.observers[e];
    n.state || (n.state = Wt, n.pure ? L.push(n) : K.push(n), n.observers && er(n));
  }
}
function Tt(t) {
  let e;
  if (t.sources)
    for (; t.sources.length; ) {
      const n = t.sources.pop(), r = t.sourceSlots.pop(), o = n.observers;
      if (o && o.length) {
        const s = o.pop(), i = n.observerSlots.pop();
        r < o.length && (s.sourceSlots[i] = r, o[r] = s, n.observerSlots[r] = i);
      }
    }
  if (t.tOwned) {
    for (e = t.tOwned.length - 1; e >= 0; e--) Tt(t.tOwned[e]);
    delete t.tOwned;
  }
  if (t.owned) {
    for (e = t.owned.length - 1; e >= 0; e--) Tt(t.owned[e]);
    t.owned = null;
  }
  if (t.cleanups) {
    for (e = t.cleanups.length - 1; e >= 0; e--) t.cleanups[e]();
    t.cleanups = null;
  }
  t.state = 0;
}
function lo(t) {
  return t instanceof Error ? t : new Error(typeof t == "string" ? t : "Unknown error", {
    cause: t
  });
}
function nr(t, e = T) {
  throw lo(t);
}
const fo = /* @__PURE__ */ Symbol("fallback");
function dn(t) {
  for (let e = 0; e < t.length; e++) t[e]();
}
function ho(t, e, n = {}) {
  let r = [], o = [], s = [], i = 0, a = e.length > 1 ? [] : null;
  return R(() => dn(s)), () => {
    let c = t() || [], l = c.length, p, u;
    return c[Ae], X(() => {
      let f, h, g, m, x, b, v, _, A;
      if (l === 0)
        i !== 0 && (dn(s), s = [], r = [], o = [], i = 0, a && (a = [])), n.fallback && (r = [fo], o[0] = Bt((y) => (s[0] = y, n.fallback())), i = 1);
      else if (i === 0) {
        for (o = new Array(l), u = 0; u < l; u++)
          r[u] = c[u], o[u] = Bt(d);
        i = l;
      } else {
        for (g = new Array(l), m = new Array(l), a && (x = new Array(l)), b = 0, v = Math.min(i, l); b < v && r[b] === c[b]; b++) ;
        for (v = i - 1, _ = l - 1; v >= b && _ >= b && r[v] === c[_]; v--, _--)
          g[_] = o[v], m[_] = s[v], a && (x[_] = a[v]);
        for (f = /* @__PURE__ */ new Map(), h = new Array(_ + 1), u = _; u >= b; u--)
          A = c[u], p = f.get(A), h[u] = p === void 0 ? -1 : p, f.set(A, u);
        for (p = b; p <= v; p++)
          A = r[p], u = f.get(A), u !== void 0 && u !== -1 ? (g[u] = o[p], m[u] = s[p], a && (x[u] = a[p]), u = h[u], f.set(A, u)) : s[p]();
        for (u = b; u < l; u++)
          u in g ? (o[u] = g[u], s[u] = m[u], a && (a[u] = x[u], a[u](u))) : o[u] = Bt(d);
        o = o.slice(0, i = l), r = c.slice(0);
      }
      return o;
    });
    function d(f) {
      if (s[u] = f, a) {
        const [h, g] = j(u);
        return a[u] = g, e(c[u], h);
      }
      return e(c[u]);
    }
  };
}
function k(t, e) {
  return X(() => t(e || {}));
}
const po = (t) => `Stale read from <${t}>.`;
function Ht(t) {
  const e = "fallback" in t && {
    fallback: () => t.fallback
  };
  return Z(ho(() => t.each, t.children, e || void 0));
}
function I(t) {
  const e = t.keyed, n = Z(() => t.when, void 0, void 0), r = e ? n : Z(n, void 0, {
    equals: (o, s) => !o == !s
  });
  return Z(() => {
    const o = r();
    if (o) {
      const s = t.children;
      return typeof s == "function" && s.length > 0 ? X(() => s(e ? o : () => {
        if (!X(r)) throw po("Show");
        return n();
      })) : s;
    }
    return t.fallback;
  }, void 0, void 0);
}
const go = (t) => Z(() => t());
function mo(t, e, n) {
  let r = n.length, o = e.length, s = r, i = 0, a = 0, c = e[o - 1].nextSibling, l = null;
  for (; i < o || a < s; ) {
    if (e[i] === n[a]) {
      i++, a++;
      continue;
    }
    for (; e[o - 1] === n[s - 1]; )
      o--, s--;
    if (o === i) {
      const p = s < r ? a ? n[a - 1].nextSibling : n[s - a] : c;
      for (; a < s; ) t.insertBefore(n[a++], p);
    } else if (s === a)
      for (; i < o; )
        (!l || !l.has(e[i])) && e[i].remove(), i++;
    else if (e[i] === n[s - 1] && n[a] === e[o - 1]) {
      const p = e[--o].nextSibling;
      t.insertBefore(n[a++], e[i++].nextSibling), t.insertBefore(n[--s], p), e[o] = n[s];
    } else {
      if (!l) {
        l = /* @__PURE__ */ new Map();
        let u = a;
        for (; u < s; ) l.set(n[u], u++);
      }
      const p = l.get(e[i]);
      if (p != null)
        if (a < p && p < s) {
          let u = i, d = 1, f;
          for (; ++u < o && u < s && !((f = l.get(e[u])) == null || f !== p + d); )
            d++;
          if (d > p - a) {
            const h = e[i];
            for (; a < p; ) t.insertBefore(n[a++], h);
          } else t.replaceChild(n[a++], e[i++]);
        } else i++;
      else e[i++].remove();
    }
  }
}
const fn = "_$DX_DELEGATE";
function bo(t, e, n, r = {}) {
  let o;
  return Bt((s) => {
    o = s, e === document ? t() : w(e, t(), e.firstChild ? null : void 0, n);
  }, r.owner), () => {
    o(), e.textContent = "";
  };
}
function O(t, e, n, r) {
  let o;
  const s = () => {
    const a = document.createElement("template");
    return a.innerHTML = t, a.content.firstChild;
  }, i = () => (o || (o = s())).cloneNode(!0);
  return i.cloneNode = i, i;
}
function ie(t, e = window.document) {
  const n = e[fn] || (e[fn] = /* @__PURE__ */ new Set());
  for (let r = 0, o = t.length; r < o; r++) {
    const s = t[r];
    n.has(s) || (n.add(s), e.addEventListener(s, vo));
  }
}
function N(t, e, n) {
  n == null ? t.removeAttribute(e) : t.setAttribute(e, n);
}
function De(t, e) {
  e == null ? t.removeAttribute("class") : t.className = e;
}
function Ot(t, e, n, r) {
  Array.isArray(n) ? (t[`$$${e}`] = n[0], t[`$$${e}Data`] = n[1]) : t[`$$${e}`] = n;
}
function yo(t, e, n) {
  if (!e) return n ? N(t, "style") : e;
  const r = t.style;
  if (typeof e == "string") return r.cssText = e;
  typeof n == "string" && (r.cssText = n = void 0), n || (n = {}), e || (e = {});
  let o, s;
  for (s in n)
    e[s] == null && r.removeProperty(s), delete n[s];
  for (s in e)
    o = e[s], o !== n[s] && (r.setProperty(s, o), n[s] = o);
  return n;
}
function B(t, e, n) {
  n != null ? t.style.setProperty(e, n) : t.style.removeProperty(e);
}
function rr(t, e, n) {
  return X(() => t(e, n));
}
function w(t, e, n, r) {
  if (n !== void 0 && !r && (r = []), typeof e != "function") return Jt(t, e, r, n);
  P((o) => Jt(t, e(), o, n), r);
}
function vo(t) {
  let e = t.target;
  const n = `$$${t.type}`, r = t.target, o = t.currentTarget, s = (c) => Object.defineProperty(t, "target", {
    configurable: !0,
    value: c
  }), i = () => {
    const c = e[n];
    if (c && !e.disabled) {
      const l = e[`${n}Data`];
      if (l !== void 0 ? c.call(e, l, t) : c.call(e, t), t.cancelBubble) return;
    }
    return e.host && typeof e.host != "string" && !e.host._$host && e.contains(t.target) && s(e.host), !0;
  }, a = () => {
    for (; i() && (e = e._$host || e.parentNode || e.host); ) ;
  };
  if (Object.defineProperty(t, "currentTarget", {
    configurable: !0,
    get() {
      return e || document;
    }
  }), t.composedPath) {
    const c = t.composedPath();
    s(c[0]);
    for (let l = 0; l < c.length - 2 && (e = c[l], !!i()); l++) {
      if (e._$host) {
        e = e._$host, a();
        break;
      }
      if (e.parentNode === o)
        break;
    }
  } else a();
  s(r);
}
function Jt(t, e, n, r, o) {
  for (; typeof n == "function"; ) n = n();
  if (e === n) return n;
  const s = typeof e, i = r !== void 0;
  if (t = i && n[0] && n[0].parentNode || t, s === "string" || s === "number") {
    if (s === "number" && (e = e.toString(), e === n))
      return n;
    if (i) {
      let a = n[0];
      a && a.nodeType === 3 ? a.data !== e && (a.data = e) : a = document.createTextNode(e), n = ut(t, n, r, a);
    } else
      n !== "" && typeof n == "string" ? n = t.firstChild.data = e : n = t.textContent = e;
  } else if (e == null || s === "boolean")
    n = ut(t, n, r);
  else {
    if (s === "function")
      return P(() => {
        let a = e();
        for (; typeof a == "function"; ) a = a();
        n = Jt(t, a, n, r);
      }), () => n;
    if (Array.isArray(e)) {
      const a = [], c = n && Array.isArray(n);
      if (Ee(a, e, n, o))
        return P(() => n = Jt(t, a, n, r, !0)), () => n;
      if (a.length === 0) {
        if (n = ut(t, n, r), i) return n;
      } else c ? n.length === 0 ? hn(t, a, r) : mo(t, n, a) : (n && ut(t), hn(t, a));
      n = a;
    } else if (e.nodeType) {
      if (Array.isArray(n)) {
        if (i) return n = ut(t, n, r, e);
        ut(t, n, null, e);
      } else n == null || n === "" || !t.firstChild ? t.appendChild(e) : t.replaceChild(e, t.firstChild);
      n = e;
    }
  }
  return n;
}
function Ee(t, e, n, r) {
  let o = !1;
  for (let s = 0, i = e.length; s < i; s++) {
    let a = e[s], c = n && n[t.length], l;
    if (!(a == null || a === !0 || a === !1)) if ((l = typeof a) == "object" && a.nodeType)
      t.push(a);
    else if (Array.isArray(a))
      o = Ee(t, a, c) || o;
    else if (l === "function")
      if (r) {
        for (; typeof a == "function"; ) a = a();
        o = Ee(t, Array.isArray(a) ? a : [a], Array.isArray(c) ? c : [c]) || o;
      } else
        t.push(a), o = !0;
    else {
      const p = String(a);
      c && c.nodeType === 3 && c.data === p ? t.push(c) : t.push(document.createTextNode(p));
    }
  }
  return o;
}
function hn(t, e, n = null) {
  for (let r = 0, o = e.length; r < o; r++) t.insertBefore(e[r], n);
}
function ut(t, e, n, r) {
  if (n === void 0) return t.textContent = "";
  const o = r || document.createTextNode("");
  if (e.length) {
    let s = !1;
    for (let i = e.length - 1; i >= 0; i--) {
      const a = e[i];
      if (o !== a) {
        const c = a.parentNode === t;
        !s && !i ? c ? t.replaceChild(o, a) : t.insertBefore(o, n) : c && a.remove();
      } else s = !0;
    }
  } else t.insertBefore(o, n);
  return [o];
}
const xo = new Intl.RelativeTimeFormat("en");
function wo(t) {
  const e = Math.max(0, (Date.now() - new Date(t).getTime()) / 1e3);
  if (e < 60) return "just now";
  const n = (s, i) => xo.format(-Math.floor(s), i);
  if (e < 3600) return n(e / 60, "minute");
  if (e < 86400) return n(e / 3600, "hour");
  if (e < 86400 * 30) return n(e / 86400, "day");
  const r = new Date(t), o = (s) => String(s).padStart(2, "0");
  return `${r.getFullYear()}-${o(r.getMonth() + 1)}-${o(r.getDate())}`;
}
const pn = {
  openPanel: "Open the feedback list",
  startMode: "Start feedback mode",
  endMode: "End feedback mode",
  pickHint: "Tap the spot you want to comment on",
  composerPlaceholder: "What should change here?",
  composerCount: (t, e) => `${t}/${e}`,
  composerCancel: "Cancel",
  composerSubmit: "Post",
  composerError: "Could not send",
  composerRetry: "Retry",
  panelTitle: "Feedback",
  panelEmpty: "No feedback yet",
  close: "Close",
  itemFocusHint: "Show where this note is pinned",
  focusNotFound: "This note's spot is not on the current page",
  sent: "Sent",
  voteUp: "+1",
  deleteItem: "Withdraw this note",
  deleteConfirmHint: "Tap again to withdraw",
  deleteConfirmText: "Withdraw?",
  // Only called for clusters of two or more.
  pinCluster: (t, e) => `${t} comments: ${e}`,
  formatRelativeTime: wo
};
function ko(t) {
  return t ? { ...pn, ...t } : pn;
}
function So(t) {
  return {
    goTo: (e) => {
      t.close(), t.navigate(e);
    }
  };
}
function _o(t, e) {
  return typeof t == "function" ? t(e) : t ?? null;
}
function gn(t, e) {
  const n = t?.(e);
  return typeof n == "string" && n !== "" ? n : null;
}
function Ao(t, e) {
  return t ? e.filter((n) => {
    try {
      return t(n) !== !0;
    } catch {
      return !0;
    }
  }) : e;
}
const $o = ["state"], mn = 0.5;
function ae(t) {
  return (t.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}
function ce(t) {
  return Array.from(t.children);
}
function Eo(t, e) {
  for (const n of Array.from(t.attributes))
    if (n.name === e) return n.value;
}
const Co = 200;
function or(t, e) {
  return t.name.startsWith("data-") && !e.has(t.name.slice(5)) && t.value.length <= Co;
}
function sr(t, e) {
  const n = {};
  for (const r of Array.from(t.attributes))
    or(r, e) && (n[r.name.slice(5)] = r.value);
  return n;
}
function To(t, e) {
  for (const n of Array.from(t.attributes))
    if (or(n, e)) return !0;
  return !1;
}
function Oo(t) {
  const e = t.parentElement;
  return e ? ce(e).filter((n) => n.tagName === t.tagName).indexOf(t) + 1 : 1;
}
function Be(t) {
  const e = [t];
  for (const n of ce(t)) e.push(...Be(n));
  return e;
}
function ir(t) {
  return (t ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}
function bn(t) {
  return Math.min(1, Math.max(0, t));
}
function Io(t) {
  return t.replace(/[\\"]/g, (e) => `\\${e}`);
}
function No(t) {
  return t.replace(/\\(.)/g, "$1");
}
function jo(t) {
  return t.replace(/[^a-zA-Z0-9_\-\u00a0-\uffff]/g, (e) => `\\${e}`);
}
function Mo(t, e) {
  return {
    tag: t.tagName.toLowerCase(),
    id: t.id || void 0,
    dataAttrs: sr(t, e),
    classList: ae(t),
    textSnippet: ir(t.textContent)
  };
}
function Lo(t, e) {
  const n = t.tagName.toLowerCase();
  if (t.id) return `#${t.id}`;
  const r = sr(t, e), o = Object.keys(r).sort();
  if (o.length > 0) {
    const c = o[0];
    return `${n}[data-${c}="${Io(r[c])}"]`;
  }
  const s = ae(t).map((c) => `.${jo(c)}`).join("");
  let i = "";
  const a = t.parentElement;
  if (a) {
    const c = ce(a).filter((l) => l.tagName === t.tagName);
    c.length > 1 && (i = `:nth-of-type(${c.indexOf(t) + 1})`);
  }
  return `${n}${s}${i}`;
}
function Po(t, e) {
  const n = [];
  let r = t;
  for (; r && (n.unshift(Lo(r, e)), !(r.id || To(r, e))); )
    r = r.parentElement;
  return n.join(" > ");
}
function zo(t) {
  if (t.startsWith("#")) return { kind: "id", id: t.slice(1) };
  const e = /^([a-zA-Z][a-zA-Z0-9-]*)\[data-([a-zA-Z0-9-]+)="((?:[^"\\]|\\.)*)"\]$/.exec(
    t
  );
  return e ? {
    kind: "data",
    tag: e[1],
    key: e[2],
    value: No(e[3])
  } : Do(t) || { kind: "class", tag: t, classes: [] };
}
const Ro = /^:nth-of-type\((\d+)\)$/;
function Do(t) {
  const e = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(t);
  if (!e) return null;
  const n = e[0], r = [];
  let o, s = null, i = n.length;
  const a = () => s === null ? !0 : s === "" ? !1 : (r.push(s), s = null, !0);
  for (; i < t.length; ) {
    const c = t[i];
    if (c === "\\" && i + 1 < t.length) {
      if (s === null) return null;
      s += t[i + 1], i += 2;
      continue;
    }
    if (c === ".") {
      if (!a()) return null;
      s = "", i += 1;
      continue;
    }
    if (c === ":") {
      const l = Ro.exec(t.slice(i));
      if (l) {
        o = Number(l[1]);
        break;
      }
      if (s === null) return null;
      s += c, i += 1;
      continue;
    }
    if (s === null) return null;
    s += c, i += 1;
  }
  return a() ? { kind: "class", tag: n, classes: r, nth: o } : null;
}
function yn(t, e) {
  if (e.kind === "id") return t.id === e.id;
  if (t.tagName.toLowerCase() !== e.tag) return !1;
  if (e.kind === "data") return Eo(t, `data-${e.key}`) === e.value;
  const n = ae(t);
  return !(!e.classes.every((r) => n.includes(r)) || e.nth !== void 0 && Oo(t) !== e.nth);
}
function Bo(t, e) {
  const n = e.split(" > ").filter(Boolean).map(zo);
  if (n.length === 0) return null;
  let r = Be(t).filter((o) => yn(o, n[0]));
  for (let o = 1; o < n.length && r.length > 0; o++) {
    const s = n[o], i = [];
    for (const a of r)
      for (const c of ce(a))
        yn(c, s) && i.push(c);
    r = i;
  }
  return r[0] ?? null;
}
function Ho(t, e, n) {
  if (t.tagName.toLowerCase() !== e.tag) return 0;
  let r = 0, o = 0;
  const s = (u, d) => {
    r += u, o += u * d;
  };
  e.id && s(0.3, t.id === e.id ? 1 : 0);
  const i = Object.keys(e.dataAttrs);
  if (i.length > 0) {
    const u = /* @__PURE__ */ new Map();
    for (const f of Array.from(t.attributes)) {
      if (!f.name.startsWith("data-")) continue;
      const h = f.name.slice(5);
      !n.has(h) && !u.has(h) && u.set(h, f.value);
    }
    const d = i.filter((f) => u.get(f) === e.dataAttrs[f]).length;
    s(0.3, d / i.length);
  }
  const a = new Set(ae(t)), c = new Set(e.classList), l = /* @__PURE__ */ new Set([...a, ...c]), p = l.size === 0 ? 1 : [...c].filter((u) => a.has(u)).length / l.size;
  if (s(0.15, p), e.textSnippet) {
    const u = ir(t.textContent), d = u === e.textSnippet ? 1 : u !== "" && (u.includes(e.textSnippet) || e.textSnippet.includes(u)) ? 0.5 : 0;
    s(0.25, d);
  }
  return r > 0 ? o / r : 0;
}
function Fo(t) {
  const e = t.fingerprint;
  if (e.textSnippet) return e.textSnippet;
  const n = Object.keys(e.dataAttrs).sort()[0];
  return n ? `${e.tag}[data-${n}="${e.dataAttrs[n]}"]` : e.tag;
}
function ar(t = {}) {
  const e = new Set(
    t.volatileDataKeys ?? $o
  );
  function n(s, i, a) {
    const c = s.getBoundingClientRect(), l = {
      x: c.width > 0 ? bn((i.x - c.left) / c.width) : 0.5,
      y: c.height > 0 ? bn((i.y - c.top) / c.height) : 0.5
    };
    return {
      version: 1,
      route: a,
      selectorPath: Po(s, e),
      fingerprint: Mo(s, e),
      rectRatio: l
    };
  }
  function r(s, i) {
    return Ho(s, i, e);
  }
  function o(s, i = document.documentElement) {
    const a = Bo(i, s.selectorPath);
    if (a && r(a, s.fingerprint) >= mn) return a;
    let c = null, l = 0;
    for (const p of Be(i)) {
      if (p.tagName.toLowerCase() !== s.fingerprint.tag) continue;
      const u = r(p, s.fingerprint);
      u > l && (l = u, c = p);
    }
    return l >= mn ? c : null;
  }
  return { captureAnchor: n, scoreCandidate: r, resolveAnchor: o, describeAnchor: Fo };
}
const He = ar();
He.captureAnchor;
He.scoreCandidate;
He.resolveAnchor;
const Ko = 100;
function vn(t) {
  return typeof t != "string" ? !1 : t === "" ? !0 : t[0] !== "/" || t[1] === "/" || t[1] === "\\" ? !1 : !/[\u0000-\u001f\u007f]/.test(t);
}
const cr = "/api/feedback";
function U(t) {
  return typeof t == "object" && t !== null;
}
function xn(t) {
  return U(t) ? typeof t.id == "number" && typeof t.route == "string" && typeof t.body == "string" && U(t.anchor) && typeof t.author_name == "string" && typeof t.author_key == "string" && typeof t.votes == "number" && typeof t.created_at == "string" : !1;
}
async function kt(t, e) {
  const n = await fetch(t, e);
  if (!n.ok) throw new Error(`${t}: ${n.status}`);
  return n.json();
}
function ge(t, e) {
  return { method: t, headers: { "content-type": "application/json" }, body: JSON.stringify(e) };
}
function lt(t) {
  return new Error(`${t}: malformed response`);
}
function qo(t = {}) {
  const e = t.basePath ?? cr;
  return {
    async list() {
      const n = await kt(e);
      if (!U(n) || !Array.isArray(n.feedback)) throw lt(e);
      const r = n.feedback.filter(xn);
      if (r.length !== n.feedback.length) throw lt(e);
      return { feedback: r };
    },
    async create(n, r, o, s, i) {
      const a = await kt(e, ge("POST", { route: n, body: r, anchor: o, context: s, nonce: i }));
      if (!U(a) || !xn(a.feedback)) throw lt(e);
      return { feedback: a.feedback };
    },
    async vote(n, r, o) {
      const s = `${e}/${n}/votes`, i = await kt(s, ge("POST", { delta: r, nonce: o }));
      if (!U(i) || typeof i.id != "number" || typeof i.votes != "number")
        throw lt(s);
      return { id: i.id, votes: i.votes };
    },
    async remove(n, r) {
      const o = `${e}/${n}`, s = await kt(o, ge("DELETE", { nonce: r }));
      if (!U(s) || typeof s.id != "number") throw lt(o);
      return { id: s.id };
    },
    async me() {
      const n = `${e}/me`, r = await kt(n);
      if (!U(r) || !U(r.author) || typeof r.author.key != "string" || typeof r.author.name != "string")
        throw lt(n);
      return { key: r.author.key, name: r.author.name };
    }
  };
}
const Zo = 1500;
function wn(t) {
  return typeof t == "object" && t !== null;
}
function Wo(t) {
  if (!wn(t)) return null;
  switch (t.type) {
    case "ping":
      return { type: "ping" };
    case "created":
      return !wn(t.feedback) || typeof t.feedback.id != "number" || typeof t.nonce != "string" ? null : {
        type: "created",
        feedback: t.feedback,
        nonce: t.nonce
      };
    case "voted":
      return typeof t.id != "number" || typeof t.votes != "number" || typeof t.nonce != "string" ? null : { type: "voted", id: t.id, votes: t.votes, nonce: t.nonce };
    case "deleted":
      return typeof t.id != "number" || typeof t.nonce != "string" ? null : { type: "deleted", id: t.id, nonce: t.nonce };
    case "status_changed": {
      if (typeof t.id != "number") return null;
      const e = {};
      for (const [n, r] of Object.entries(t))
        n === "type" || n === "id" || (e[n] = r);
      return { type: "status_changed", id: t.id, patch: e };
    }
    default:
      return null;
  }
}
function Vo(t = {}) {
  const e = t.path ?? `${t.basePath ?? cr}/events`;
  return {
    subscribe(n, r) {
      let o = null, s = null, i = !1;
      function a() {
        i || (r("connecting"), o = new EventSource(e), o.onopen = () => r("live"), o.onmessage = (c) => {
          let l;
          try {
            l = JSON.parse(c.data);
          } catch {
            return;
          }
          const p = Wo(l);
          p && n(p);
        }, o.onerror = () => {
          r("reconnecting"), o?.close(), o = null, !i && s === null && (s = setTimeout(() => {
            s = null, a();
          }, Zo));
        });
      }
      return a(), () => {
        i = !0, s !== null && clearTimeout(s), o?.close(), o = null;
      };
    }
  };
}
const Fe = "data-feedback-ui", Uo = `[${Fe}]`;
function ur(t) {
  return {
    http: t.http ?? qo(),
    transport: t.transport ?? Vo(),
    captureContext: t.captureContext ?? (() => null),
    // Passing undefined through is fine: the core falls back to its own
    // DEFAULT_VOLATILE_DATA_KEYS, keeping one source of truth for that list.
    anchoring: ar({ volatileDataKeys: t.volatileDataKeys }),
    selfSelector: t.selfSelector ?? Uo
  };
}
let ue = ur({});
function Jo(t = {}) {
  ue = ur(t);
}
function it() {
  return ue;
}
function ot() {
  return ue.anchoring;
}
function Qo() {
  return ue.selfSelector;
}
const Yo = 2500, kn = 80, Go = 2600, [lr, Ce] = j(null), [dr, fr] = j(void 0);
let Ct, Ft;
function Lt() {
  Ct && clearTimeout(Ct), Ft && clearTimeout(Ft), Ct = void 0, Ft = void 0, Ce(null), fr(void 0);
}
function Xo(t) {
  dr() === t && Lt();
}
const hr = (t) => dr() === t ? lr() : null;
function ts(t, e) {
  Lt(), fr(e);
  const n = Date.now() + Yo;
  return new Promise((r) => {
    const o = () => {
      const s = ot().resolveAnchor(t);
      if (s) {
        s.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }), Ce(t), Ft = setTimeout(() => Ce(null), Go), r(!0);
        return;
      }
      if (Date.now() >= n) {
        r(!1);
        return;
      }
      Ct = setTimeout(o, kn);
    };
    Ct = setTimeout(o, kn);
  });
}
function mt(t) {
  if (Array.isArray(t)) return `[${t.map(mt).join(",")}]`;
  if (t !== null && typeof t == "object") {
    const e = t;
    return `{${Object.keys(e).filter((n) => e[n] !== void 0).sort().map((n) => `${JSON.stringify(n)}:${mt(e[n])}`).join(",")}}`;
  }
  return JSON.stringify(t) ?? "null";
}
function es(t, e) {
  return t == null || e == null ? !1 : t === e || mt(t) === mt(e);
}
function ns(t, e) {
  if (t == null) return !1;
  const n = mt(t);
  return !e.some((r) => r.anchor === t || mt(r.anchor) === n);
}
const pr = (t) => es(lr(), t.anchor);
function rs(t, e) {
  q(() => {
    ns(hr(e), t()) && Lt();
  });
}
const os = 500;
function Ke() {
  const t = globalThis.crypto;
  if (typeof t?.randomUUID == "function") return t.randomUUID();
  if (typeof t?.getRandomValues == "function") {
    const e = t.getRandomValues(new Uint8Array(16));
    return Array.from(e, (n) => n.toString(16).padStart(2, "0")).join("");
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
const [gr, G] = j([]), [jc, ss] = j("connecting"), [Te, qe] = j({}), at = /* @__PURE__ */ new Set();
function is() {
  return gr();
}
function as(t) {
  return Te()[t] ?? 0;
}
function mr(t) {
  return t.votes + as(t.id);
}
function br(t) {
  G(
    (e) => e.some((n) => n.id === t.id) ? e.map((n) => n.id === t.id ? t : n) : [t, ...e]
  );
}
function yr(t) {
  qe((e) => {
    if (!(t in e)) return e;
    const n = { ...e };
    return delete n[t], n;
  });
}
async function Sn() {
  const t = await it().http.list();
  G(t.feedback);
}
async function cs(t, e, n) {
  const r = Ke();
  at.add(r);
  let o = null;
  try {
    o = it().captureContext();
  } catch {
    o = null;
  }
  try {
    const s = await it().http.create(t, e, n, o, r);
    return br(s.feedback), s.feedback;
  } finally {
    at.delete(r);
  }
}
const Oe = /* @__PURE__ */ new Map();
async function vr(t) {
  const e = gr(), n = e.findIndex((i) => i.id === t), r = n === -1 ? void 0 : e[n];
  G((i) => i.filter((a) => a.id !== t));
  const o = Ke();
  at.add(o);
  const s = { confirmed: !1 };
  Oe.set(t, s);
  try {
    return await it().http.remove(t, o), yr(t), !0;
  } catch {
    return r && !s.confirmed && G((i) => {
      if (i.some((c) => c.id === t)) return i;
      const a = i.slice();
      return a.splice(Math.min(n, a.length), 0, r), a;
    }), !1;
  } finally {
    at.delete(o), Oe.delete(t);
  }
}
const me = /* @__PURE__ */ new Map(), be = /* @__PURE__ */ new Set();
function Ie(t) {
  if (me.has(t)) return;
  const e = setTimeout(() => {
    me.delete(t), us(t);
  }, os);
  me.set(t, e);
}
async function us(t) {
  if (be.has(t)) {
    Ie(t);
    return;
  }
  const e = Math.min(Te()[t] ?? 0, Ko);
  if (e <= 0) return;
  be.add(t);
  const n = Ke();
  at.add(n);
  try {
    const r = await it().http.vote(t, e, n);
    G((o) => o.map((s) => s.id === r.id ? { ...s, votes: r.votes } : s));
  } catch {
  } finally {
    qe((r) => ({ ...r, [t]: (r[t] ?? 0) - e })), at.delete(n), be.delete(t), (Te()[t] ?? 0) > 0 && Ie(t);
  }
}
function xr(t, e) {
  qe((n) => ({ ...n, [t]: (n[t] ?? 0) + e })), Ie(t);
}
function ls(t) {
  if (t.type !== "ping") {
    if (t.type === "deleted") {
      const e = Oe.get(t.id);
      e && (e.confirmed = !0), G((n) => n.filter((r) => r.id !== t.id)), yr(t.id);
      return;
    }
    if (t.type === "status_changed") {
      G((e) => e.map((n) => n.id === t.id ? { ...n, ...t.patch } : n));
      return;
    }
    if (!at.has(t.nonce)) {
      if (t.type === "created") {
        br(t.feedback);
        return;
      }
      G((e) => e.map((n) => n.id === t.id ? { ...n, votes: t.votes } : n));
    }
  }
}
let Rt = null, St = 0;
function ds() {
  return St++, St === 1 && (Sn(), Rt = it().transport.subscribe(ls, (t) => {
    ss(t), t === "live" && Sn();
  })), () => {
    St = Math.max(0, St - 1), St === 0 && Rt && (Rt(), Rt = null);
  };
}
function fs() {
  if (typeof globalThis < "u")
    return globalThis;
  if (typeof self < "u")
    return self;
  if (typeof window < "u")
    return window;
  if (typeof global < "u")
    return global;
}
function hs() {
  const t = fs();
  if (t.__xstate__)
    return t.__xstate__;
}
const ps = (t) => {
  if (typeof window > "u")
    return;
  const e = hs();
  e && e.register(t);
};
class _n {
  constructor(e) {
    this._process = e, this._active = !1, this._current = null, this._last = null;
  }
  start() {
    this._active = !0, this.flush();
  }
  clear() {
    this._current && (this._current.next = null, this._last = this._current);
  }
  enqueue(e) {
    const n = {
      value: e,
      next: null
    };
    if (this._current) {
      this._last.next = n, this._last = n;
      return;
    }
    this._current = n, this._last = n, this._active && this.flush();
  }
  flush() {
    for (; this._current; ) {
      const e = this._current;
      this._process(e.value), this._current = e.next;
    }
    this._last = null;
  }
}
const wr = ".", gs = "", kr = "", ms = "#", bs = "*", Sr = "xstate.init", ys = "xstate.error", Qt = "xstate.stop";
function vs(t, e) {
  return {
    type: `xstate.after.${t}.${e}`
  };
}
function Ne(t, e) {
  return {
    type: `xstate.done.state.${t}`,
    output: e
  };
}
function xs(t, e) {
  return {
    type: `xstate.done.actor.${t}`,
    output: e,
    actorId: t
  };
}
function _r(t, e) {
  return {
    type: `xstate.error.actor.${t}`,
    error: e,
    actorId: t
  };
}
function Ar(t) {
  return {
    type: Sr,
    input: t
  };
}
function H(t) {
  setTimeout(() => {
    throw t;
  });
}
const ws = typeof Symbol == "function" && Symbol.observable || "@@observable";
function $r(t, e) {
  const n = An(t), r = An(e);
  return typeof r == "string" ? typeof n == "string" ? r === n : !1 : typeof n == "string" ? n in r : Object.keys(n).every((o) => o in r ? $r(n[o], r[o]) : !1);
}
function Ze(t) {
  if (Cr(t))
    return t;
  const e = [];
  let n = "";
  for (let r = 0; r < t.length; r++) {
    switch (t.charCodeAt(r)) {
      // \
      case 92:
        n += t[r + 1], r++;
        continue;
      // .
      case 46:
        e.push(n), n = "";
        continue;
    }
    n += t[r];
  }
  return e.push(n), e;
}
function An(t) {
  if (oi(t))
    return t.value;
  if (typeof t != "string")
    return t;
  const e = Ze(t);
  return ks(e);
}
function ks(t) {
  if (t.length === 1)
    return t[0];
  const e = {};
  let n = e;
  for (let r = 0; r < t.length - 1; r++)
    if (r === t.length - 2)
      n[t[r]] = t[r + 1];
    else {
      const o = n;
      n = {}, o[t[r]] = n;
    }
  return e;
}
function $n(t, e) {
  const n = {}, r = Object.keys(t);
  for (let o = 0; o < r.length; o++) {
    const s = r[o];
    n[s] = e(t[s], s, t, o);
  }
  return n;
}
function Er(t) {
  return Cr(t) ? t : [t];
}
function Q(t) {
  return t === void 0 ? [] : Er(t);
}
function je(t, e, n, r) {
  return typeof t == "function" ? t({
    context: e,
    event: n,
    self: r
  }) : t;
}
function Cr(t) {
  return Array.isArray(t);
}
function Ss(t) {
  return t.type.startsWith("xstate.error.actor");
}
function ft(t) {
  return Er(t).map((e) => typeof e > "u" || typeof e == "string" ? {
    target: e
  } : e);
}
function Tr(t) {
  if (!(t === void 0 || t === gs))
    return Q(t);
}
function Kt(t, e, n) {
  const r = typeof t == "object", o = r ? t : void 0;
  return {
    next: (r ? t.next : t)?.bind(o),
    error: (r ? t.error : e)?.bind(o),
    complete: (r ? t.complete : n)?.bind(o)
  };
}
function En(t, e) {
  return `${e}.${t}`;
}
function We(t, e) {
  const n = e.match(/^xstate\.invoke\.(\d+)\.(.*)/);
  if (!n)
    return t.implementations.actors[e];
  const [, r, o] = n, s = t.getStateNodeById(o).config.invoke;
  return (Array.isArray(s) ? s[r] : s).src;
}
function _s(t, e) {
  if (e === t || e === bs)
    return !0;
  if (!e.endsWith(".*"))
    return !1;
  const n = e.split("."), r = t.split(".");
  for (let o = 0; o < n.length; o++) {
    const s = n[o], i = r[o];
    if (s === "*")
      return o === n.length - 1;
    if (s !== i)
      return !1;
  }
  return !0;
}
function Cn(t, e) {
  return `${t.sessionId}.${e}`;
}
let As = 0;
function $s(t, e) {
  const n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new WeakMap(), s = /* @__PURE__ */ new Set(), i = {}, {
    clock: a,
    logger: c
  } = e, l = {
    schedule: (d, f, h, g, m = Math.random().toString(36).slice(2)) => {
      const x = {
        source: d,
        target: f,
        event: h,
        delay: g,
        id: m,
        startedAt: Date.now()
      }, b = Cn(d, m);
      u._snapshot._scheduledEvents[b] = x;
      const v = a.setTimeout(() => {
        delete i[b], delete u._snapshot._scheduledEvents[b], u._relay(d, f, h);
      }, g);
      i[b] = v;
    },
    cancel: (d, f) => {
      const h = Cn(d, f), g = i[h];
      delete i[h], delete u._snapshot._scheduledEvents[h], g !== void 0 && a.clearTimeout(g);
    },
    cancelAll: (d) => {
      for (const f in u._snapshot._scheduledEvents) {
        const h = u._snapshot._scheduledEvents[f];
        h.source === d && l.cancel(d, h.id);
      }
    }
  }, p = (d) => {
    if (!s.size)
      return;
    const f = {
      ...d,
      rootId: t.sessionId
    };
    s.forEach((h) => h.next?.(f));
  }, u = {
    _snapshot: {
      _scheduledEvents: (e?.snapshot && e.snapshot.scheduler) ?? {}
    },
    _bookId: () => `x:${As++}`,
    _register: (d, f) => (n.set(d, f), d),
    _unregister: (d) => {
      n.delete(d.sessionId);
      const f = o.get(d);
      f !== void 0 && (r.delete(f), o.delete(d));
    },
    get: (d) => r.get(d),
    getAll: () => Object.fromEntries(r.entries()),
    _set: (d, f) => {
      const h = r.get(d);
      if (h && h !== f)
        throw new Error(`Actor with system ID '${d}' already exists.`);
      r.set(d, f), o.set(f, d);
    },
    inspect: (d) => {
      const f = Kt(d);
      return s.add(f), {
        unsubscribe() {
          s.delete(f);
        }
      };
    },
    _sendInspectionEvent: p,
    _relay: (d, f, h) => {
      u._sendInspectionEvent({
        type: "@xstate.event",
        sourceRef: d,
        actorRef: f,
        event: h
      }), f._send(h);
    },
    scheduler: l,
    getSnapshot: () => ({
      _scheduledEvents: {
        ...u._snapshot._scheduledEvents
      }
    }),
    start: () => {
      const d = u._snapshot._scheduledEvents;
      u._snapshot._scheduledEvents = {};
      for (const f in d) {
        const {
          source: h,
          target: g,
          event: m,
          delay: x,
          id: b
        } = d[f];
        l.schedule(h, g, m, x, b);
      }
    },
    _clock: a,
    _logger: c
  };
  return u;
}
let ye = !1;
const Ve = 1;
let z = /* @__PURE__ */ (function(t) {
  return t[t.NotStarted = 0] = "NotStarted", t[t.Running = 1] = "Running", t[t.Stopped = 2] = "Stopped", t;
})({});
const Es = {
  clock: {
    setTimeout: (t, e) => setTimeout(t, e),
    clearTimeout: (t) => clearTimeout(t)
  },
  logger: console.log.bind(console),
  devTools: !1
};
class Cs {
  /**
   * Creates a new actor instance for the given logic with the provided options,
   * if any.
   *
   * @param logic The logic to create an actor from
   * @param options Actor options
   */
  constructor(e, n) {
    this.logic = e, this._snapshot = void 0, this.clock = void 0, this.options = void 0, this.id = void 0, this.mailbox = new _n(this._process.bind(this)), this.observers = /* @__PURE__ */ new Set(), this.eventListeners = /* @__PURE__ */ new Map(), this.logger = void 0, this._processingStatus = z.NotStarted, this._parent = void 0, this._syncSnapshot = void 0, this.ref = void 0, this._actorScope = void 0, this.systemId = void 0, this.sessionId = void 0, this.system = void 0, this._doneEvent = void 0, this.src = void 0, this._deferred = [];
    const r = {
      ...Es,
      ...n
    }, {
      clock: o,
      logger: s,
      parent: i,
      syncSnapshot: a,
      id: c,
      systemId: l,
      inspect: p
    } = r;
    this.system = i ? i.system : $s(this, {
      clock: o,
      logger: s
    }), p && !i && this.system.inspect(Kt(p)), this.sessionId = this.system._bookId(), this.id = c ?? this.sessionId, this.logger = n?.logger ?? this.system._logger, this.clock = n?.clock ?? this.system._clock, this._parent = i, this._syncSnapshot = a, this.options = r, this.src = r.src ?? e, this.ref = this, this._actorScope = {
      self: this,
      id: this.id,
      sessionId: this.sessionId,
      logger: this.logger,
      defer: (u) => {
        this._deferred.push(u);
      },
      system: this.system,
      stopChild: (u) => {
        if (u._parent !== this)
          throw new Error(`Cannot stop child actor ${u.id} of ${this.id} because it is not a child`);
        u._stop();
      },
      emit: (u) => {
        const d = this.eventListeners.get(u.type), f = this.eventListeners.get("*");
        if (!d && !f)
          return;
        const h = [...d ? d.values() : [], ...f ? f.values() : []];
        for (const g of h)
          try {
            g(u);
          } catch (m) {
            H(m);
          }
      },
      actionExecutor: (u) => {
        const d = () => {
          if (this._actorScope.system._sendInspectionEvent({
            type: "@xstate.action",
            actorRef: this,
            action: {
              type: u.type,
              params: u.params
            }
          }), !u.exec)
            return;
          const f = ye;
          try {
            ye = !0, u.exec(u.info, u.params);
          } finally {
            ye = f;
          }
        };
        this._processingStatus === z.Running ? d() : this._deferred.push(d);
      }
    }, this.send = this.send.bind(this), this.system._sendInspectionEvent({
      type: "@xstate.actor",
      actorRef: this
    }), l && (this.systemId = l, this.system._set(l, this)), this._initState(n?.snapshot ?? n?.state), l && this._snapshot.status !== "active" && this.system._unregister(this);
  }
  _initState(e) {
    try {
      this._snapshot = e ? this.logic.restoreSnapshot ? this.logic.restoreSnapshot(e, this._actorScope) : e : this.logic.getInitialSnapshot(this._actorScope, this.options?.input);
    } catch (n) {
      this._snapshot = {
        status: "error",
        output: void 0,
        error: n
      };
    }
  }
  update(e, n) {
    this._snapshot = e;
    let r;
    for (; r = this._deferred.shift(); )
      try {
        r();
      } catch (o) {
        this._deferred.length = 0, this._snapshot = {
          ...e,
          status: "error",
          error: o
        };
      }
    switch (this._snapshot.status) {
      case "active":
        for (const o of this.observers)
          try {
            o.next?.(e);
          } catch (s) {
            H(s);
          }
        break;
      case "done":
        for (const o of this.observers)
          try {
            o.next?.(e);
          } catch (s) {
            H(s);
          }
        this._stopProcedure(), this._complete(), this._doneEvent = xs(this.id, this._snapshot.output), this._parent && this.system._relay(this, this._parent, this._doneEvent);
        break;
      case "error":
        this._error(this._snapshot.error);
        break;
    }
    this.system._sendInspectionEvent({
      type: "@xstate.snapshot",
      actorRef: this,
      event: n,
      snapshot: e
    });
  }
  /**
   * Subscribe an observer to an actor’s snapshot values.
   *
   * @remarks
   * The observer will receive the actor’s snapshot value when it is emitted.
   * The observer can be:
   *
   * - A plain function that receives the latest snapshot, or
   * - An observer object whose `.next(snapshot)` method receives the latest
   *   snapshot
   *
   * @example
   *
   * ```ts
   * // Observer as a plain function
   * const subscription = actor.subscribe((snapshot) => {
   *   console.log(snapshot);
   * });
   * ```
   *
   * @example
   *
   * ```ts
   * // Observer as an object
   * const subscription = actor.subscribe({
   *   next(snapshot) {
   *     console.log(snapshot);
   *   },
   *   error(err) {
   *     // ...
   *   },
   *   complete() {
   *     // ...
   *   }
   * });
   * ```
   *
   * The return value of `actor.subscribe(observer)` is a subscription object
   * that has an `.unsubscribe()` method. You can call
   * `subscription.unsubscribe()` to unsubscribe the observer:
   *
   * @example
   *
   * ```ts
   * const subscription = actor.subscribe((snapshot) => {
   *   // ...
   * });
   *
   * // Unsubscribe the observer
   * subscription.unsubscribe();
   * ```
   *
   * When the actor is stopped, all of its observers will automatically be
   * unsubscribed.
   *
   * @param observer - Either a plain function that receives the latest
   *   snapshot, or an observer object whose `.next(snapshot)` method receives
   *   the latest snapshot
   */
  subscribe(e, n, r) {
    const o = Kt(e, n, r);
    if (this._processingStatus !== z.Stopped)
      this.observers.add(o);
    else
      switch (this._snapshot.status) {
        case "done":
          try {
            o.complete?.();
          } catch (s) {
            H(s);
          }
          break;
        case "error": {
          const s = this._snapshot.error;
          if (!o.error)
            H(s);
          else
            try {
              o.error(s);
            } catch (i) {
              H(i);
            }
          break;
        }
      }
    return {
      unsubscribe: () => {
        this.observers.delete(o);
      }
    };
  }
  on(e, n) {
    let r = this.eventListeners.get(e);
    r || (r = /* @__PURE__ */ new Set(), this.eventListeners.set(e, r));
    const o = n.bind(void 0);
    return r.add(o), {
      unsubscribe: () => {
        r.delete(o);
      }
    };
  }
  select(e, n = Object.is) {
    return {
      subscribe: (r) => {
        const o = Kt(r), s = this.getSnapshot();
        let i = e(s);
        return this.subscribe((a) => {
          const c = e(a);
          n(i, c) || (i = c, o.next?.(c));
        });
      },
      get: () => e(this.getSnapshot())
    };
  }
  /** Starts the Actor from the initial state */
  start() {
    if (this._processingStatus === z.Running)
      return this;
    this._syncSnapshot && this.subscribe({
      next: (n) => {
        n.status === "active" && this.system._relay(this, this._parent, {
          type: `xstate.snapshot.${this.id}`,
          snapshot: n
        });
      },
      error: () => {
      }
    }), this.system._register(this.sessionId, this), this.systemId && this.system._set(this.systemId, this), this._processingStatus = z.Running;
    const e = Ar(this.options.input);
    switch (this.system._sendInspectionEvent({
      type: "@xstate.event",
      sourceRef: this._parent,
      actorRef: this,
      event: e
    }), this._snapshot.status) {
      case "done":
        return this.update(this._snapshot, e), this;
      case "error":
        return this._error(this._snapshot.error), this;
    }
    if (this._parent || this.system.start(), this.logic.start)
      try {
        this.logic.start(this._snapshot, this._actorScope);
      } catch (n) {
        return this._snapshot = {
          ...this._snapshot,
          status: "error",
          error: n
        }, this._error(n), this;
      }
    return this.update(this._snapshot, e), this.options.devTools && this.attachDevTools(), this.mailbox.start(), this;
  }
  _process(e) {
    let n, r;
    try {
      n = this.logic.transition(this._snapshot, e, this._actorScope);
    } catch (o) {
      r = {
        err: o
      };
    }
    if (r) {
      const {
        err: o
      } = r;
      this._snapshot = {
        ...this._snapshot,
        status: "error",
        error: o
      }, this._error(o);
      return;
    }
    this.update(n, e), e.type === Qt && (this._stopProcedure(), this._complete());
  }
  _stop() {
    return this._processingStatus === z.Stopped ? this : (this.mailbox.clear(), this._processingStatus === z.NotStarted ? (this._processingStatus = z.Stopped, this) : (this.mailbox.enqueue({
      type: Qt
    }), this));
  }
  /** Stops the Actor and unsubscribe all listeners. */
  stop() {
    if (this._parent)
      throw new Error("A non-root actor cannot be stopped directly.");
    return this._stop();
  }
  _complete() {
    for (const e of this.observers)
      try {
        e.complete?.();
      } catch (n) {
        H(n);
      }
    this.observers.clear(), this.eventListeners.clear();
  }
  _reportError(e) {
    if (!this.observers.size) {
      this._parent || H(e), this.eventListeners.clear();
      return;
    }
    let n = !1;
    for (const r of this.observers) {
      const o = r.error;
      n ||= !o;
      try {
        o?.(e);
      } catch (s) {
        H(s);
      }
    }
    this.observers.clear(), this.eventListeners.clear(), n && H(e);
  }
  _error(e) {
    this._stopProcedure(), this._reportError(e), this._parent && this.system._relay(this, this._parent, _r(this.id, e));
  }
  // TODO: atm children don't belong entirely to the actor so
  // in a way - it's not even super aware of them
  // so we can't stop them from here but we really should!
  // right now, they are being stopped within the machine's transition
  // but that could throw and leave us with "orphaned" active actors
  _stopProcedure() {
    return this._processingStatus !== z.Running ? this : (this.system.scheduler.cancelAll(this), this.mailbox.clear(), this.mailbox = new _n(this._process.bind(this)), this._processingStatus = z.Stopped, this.system._unregister(this), this);
  }
  /** @internal */
  _send(e) {
    this._processingStatus !== z.Stopped && this.mailbox.enqueue(e);
  }
  /**
   * Sends an event to the running Actor to trigger a transition.
   *
   * @param event The event to send
   */
  send(e) {
    this.system._relay(void 0, this, e);
  }
  attachDevTools() {
    const {
      devTools: e
    } = this.options;
    e && (typeof e == "function" ? e : ps)(this);
  }
  toJSON() {
    return {
      xstate$$type: Ve,
      id: this.id
    };
  }
  /**
   * Obtain the internal state of the actor, which can be persisted.
   *
   * @remarks
   * The internal state can be persisted from any actor, not only machines.
   *
   * Note that the persisted state is not the same as the snapshot from
   * {@link Actor.getSnapshot}. Persisted state represents the internal state of
   * the actor, while snapshots represent the actor's last emitted value.
   *
   * Can be restored with {@link ActorOptions.state}
   * @see https://stately.ai/docs/persistence
   */
  getPersistedSnapshot(e) {
    return this.logic.getPersistedSnapshot(this._snapshot, e);
  }
  [ws]() {
    return this;
  }
  /**
   * Read an actor’s snapshot synchronously.
   *
   * @remarks
   * The snapshot represent an actor's last emitted value.
   *
   * When an actor receives an event, its internal state may change. An actor
   * may emit a snapshot when a state transition occurs.
   *
   * Note that some actors, such as callback actors generated with
   * `fromCallback`, will not emit snapshots.
   * @see {@link Actor.subscribe} to subscribe to an actor’s snapshot values.
   * @see {@link Actor.getPersistedSnapshot} to persist the internal state of an actor (which is more than just a snapshot).
   */
  getSnapshot() {
    return this._snapshot;
  }
}
function It(t, ...[e]) {
  return new Cs(t, e);
}
function Ts(t, e, n, r, {
  sendId: o
}) {
  const s = typeof o == "function" ? o(n, r) : o;
  return [e, {
    sendId: s
  }, void 0];
}
function Os(t, e) {
  t.defer(() => {
    t.system.scheduler.cancel(t.self, e.sendId);
  });
}
function Ue(t) {
  function e(n, r) {
  }
  return e.type = "xstate.cancel", e.sendId = t, e.resolve = Ts, e.execute = Os, e;
}
function Is(t, e, n, r, {
  id: o,
  systemId: s,
  src: i,
  input: a,
  syncSnapshot: c
}) {
  const l = typeof i == "string" ? We(e.machine, i) : i, p = typeof o == "function" ? o(n) : o;
  let u, d;
  return l && (d = typeof a == "function" ? a({
    context: e.context,
    event: n.event,
    self: t.self
  }) : a, u = It(l, {
    id: p,
    src: i,
    parent: t.self,
    syncSnapshot: c,
    systemId: s,
    input: d
  })), [ct(e, {
    children: {
      ...e.children,
      [p]: u
    }
  }), {
    id: o,
    systemId: s,
    actorRef: u,
    src: i,
    input: d
  }, void 0];
}
function Ns(t, {
  actorRef: e
}) {
  e && t.defer(() => {
    e._processingStatus !== z.Stopped && e.start();
  });
}
function Je(...[t, {
  id: e,
  systemId: n,
  input: r,
  syncSnapshot: o = !1
} = {}]) {
  function s(i, a) {
  }
  return s.type = "xstate.spawnChild", s.id = e, s.systemId = n, s.src = t, s.input = r, s.syncSnapshot = o, s.resolve = Is, s.execute = Ns, s;
}
function js(t, e, n, r, {
  actorRef: o
}) {
  const s = typeof o == "function" ? o(n, r) : o, i = typeof s == "string" ? e.children[s] : s;
  let a = e.children;
  return i && (a = {
    ...a
  }, delete a[i.id]), [ct(e, {
    children: a
  }), i, void 0];
}
function Or(t, e) {
  const n = e.getSnapshot();
  if (n && "children" in n)
    for (const r of Object.values(n.children))
      Or(t, r);
  t.system._unregister(e);
}
function Ms(t, e) {
  if (e) {
    if (Or(t, e), e._processingStatus !== z.Running) {
      t.stopChild(e);
      return;
    }
    t.defer(() => {
      t.stopChild(e);
    });
  }
}
function le(t) {
  function e(n, r) {
  }
  return e.type = "xstate.stopChild", e.actorRef = t, e.resolve = js, e.execute = Ms, e;
}
function Ls(t, {
  context: e,
  event: n
}, {
  guards: r
}) {
  return r.every((o) => Pt(o, e, n, t));
}
function Ps(t) {
  function e(n, r) {
    return !1;
  }
  return e.check = Ls, e.guards = t, e;
}
function Pt(t, e, n, r) {
  const {
    machine: o
  } = r, s = typeof t == "function", i = s ? t : o.implementations.guards[typeof t == "string" ? t : t.type];
  if (!s && !i)
    throw new Error(`Guard '${typeof t == "string" ? t : t.type}' is not implemented.'.`);
  if (typeof i != "function")
    return Pt(i, e, n, r);
  const a = {
    context: e,
    event: n
  }, c = s || typeof t == "string" ? void 0 : "params" in t ? typeof t.params == "function" ? t.params({
    context: e,
    event: n
  }) : t.params : void 0;
  return "check" in i ? i.check(
    r,
    a,
    i
    // this holds all params
  ) : i(a, c);
}
function Qe(t) {
  return t.type === "atomic" || t.type === "final";
}
function bt(t) {
  return Object.values(t.states).filter((e) => e.type !== "history");
}
function zt(t, e) {
  const n = [];
  if (e === t)
    return n;
  let r = t.parent;
  for (; r && r !== e; )
    n.push(r), r = r.parent;
  return n;
}
function Yt(t) {
  const e = new Set(t), n = Nr(e);
  for (const r of e)
    if (r.type === "compound" && (!n.get(r) || !n.get(r).length))
      Tn(r).forEach((o) => e.add(o));
    else if (r.type === "parallel") {
      for (const o of bt(r))
        if (o.type !== "history" && !e.has(o)) {
          const s = Tn(o);
          for (const i of s)
            e.add(i);
        }
    }
  for (const r of e) {
    let o = r.parent;
    for (; o; )
      e.add(o), o = o.parent;
  }
  return e;
}
function Ir(t, e) {
  const n = e.get(t);
  if (!n)
    return {};
  if (t.type === "compound") {
    const o = n[0];
    if (o) {
      if (Qe(o))
        return o.key;
    } else
      return {};
  }
  const r = {};
  for (const o of n)
    r[o.key] = Ir(o, e);
  return r;
}
function Nr(t) {
  const e = /* @__PURE__ */ new Map();
  for (const n of t)
    e.has(n) || e.set(n, []), n.parent && (e.has(n.parent) || e.set(n.parent, []), e.get(n.parent).push(n));
  return e;
}
function jr(t, e) {
  const n = Yt(e);
  return Ir(t, Nr(n));
}
function Ye(t, e) {
  return e.type === "compound" ? bt(e).some((n) => n.type === "final" && t.has(n)) : e.type === "parallel" ? bt(e).every((n) => Ye(t, n)) : e.type === "final";
}
const de = (t) => t[0] === ms;
function zs(t, e) {
  const n = t.transitions.get(e), r = [...t.transitions.keys()].filter((o) => o !== e && _s(e, o)).sort((o, s) => s.length - o.length).flatMap((o) => t.transitions.get(o));
  return n ? [...n, ...r] : r;
}
function Rs(t) {
  const e = t.config.after;
  if (!e)
    return [];
  const n = (r) => {
    const o = vs(r, t.id), s = o.type;
    return t.entry.push(tn(o, {
      id: s,
      delay: r
    })), t.exit.push(Ue(s)), s;
  };
  return Object.keys(e).flatMap((r) => {
    const o = e[r], s = typeof o == "string" ? {
      target: o
    } : o, i = Number.isNaN(+r) ? r : +r, a = n(i);
    return Q(s).map((c) => ({
      ...c,
      event: a,
      delay: i
    }));
  }).map((r) => {
    const {
      delay: o
    } = r;
    return {
      ...J(t, r.event, r),
      delay: o
    };
  });
}
function J(t, e, n) {
  const r = Tr(n.target), o = n.reenter ?? !1, s = Fs(t, r), i = {
    ...n,
    actions: Q(n.actions),
    guard: n.guard,
    target: s,
    source: t,
    reenter: o,
    eventType: e,
    toJSON: () => ({
      ...i,
      source: `#${t.id}`,
      target: s ? s.map((a) => `#${a.id}`) : void 0
    })
  };
  return i;
}
function Ds(t) {
  const e = /* @__PURE__ */ new Map();
  if (t.config.on)
    for (const n of Object.keys(t.config.on)) {
      if (n === kr)
        throw new Error('Null events ("") cannot be specified as a transition key. Use `always: { ... }` instead.');
      const r = t.config.on[n];
      e.set(n, ft(r).map((o) => J(t, n, o)));
    }
  if (t.config.onDone) {
    const n = `xstate.done.state.${t.id}`;
    e.set(n, ft(t.config.onDone).map((r) => J(t, n, r)));
  }
  for (const n of t.invoke) {
    if (n.onDone) {
      const r = `xstate.done.actor.${n.id}`;
      e.set(r, ft(n.onDone).map((o) => J(t, r, o)));
    }
    if (n.onError) {
      const r = `xstate.error.actor.${n.id}`;
      e.set(r, ft(n.onError).map((o) => J(t, r, o)));
    }
    if (n.onSnapshot) {
      const r = `xstate.snapshot.${n.id}`;
      e.set(r, ft(n.onSnapshot).map((o) => J(t, r, o)));
    }
  }
  for (const n of t.after) {
    let r = e.get(n.eventType);
    r || (r = [], e.set(n.eventType, r)), r.push(n);
  }
  return e;
}
function Bs(t) {
  const e = [], n = (r) => {
    Object.values(r).forEach((o) => {
      if (o.config.route && o.config.id) {
        const s = o.config.id, i = o.config.route.guard, a = ({
          event: l
        }) => l.to === `#${s}`, c = {
          ...o.config.route,
          guard: i ? Ps([a, i]) : a,
          target: `#${s}`
        };
        e.push(J(t, "xstate.route", c));
      }
      o.states && n(o.states);
    });
  };
  n(t.states), e.length > 0 && t.transitions.set("xstate.route", e);
}
function Hs(t, e) {
  const n = typeof e == "string" ? t.states[e] : e ? t.states[e.target] : void 0;
  if (!n && e)
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string
      `Initial state node "${e}" not found on parent state node #${t.id}`
    );
  const r = {
    source: t,
    actions: !e || typeof e == "string" ? [] : Q(e.actions),
    eventType: null,
    reenter: !1,
    target: n ? [n] : [],
    toJSON: () => ({
      ...r,
      source: `#${t.id}`,
      target: n ? [`#${n.id}`] : []
    })
  };
  return r;
}
function Fs(t, e) {
  if (e !== void 0)
    return e.map((n) => {
      if (typeof n != "string")
        return n;
      if (de(n))
        return t.machine.getStateNodeById(n);
      const r = n[0] === wr;
      if (r && !t.parent)
        return Gt(t, n.slice(1));
      const o = r ? t.key + n : n;
      if (t.parent)
        try {
          return Gt(t.parent, o);
        } catch (s) {
          throw new Error(`Invalid transition definition for state node '${t.id}':
${s.message}`);
        }
      else
        throw new Error(`Invalid target: "${n}" is not a valid target from the root node. Did you mean ".${n}"?`);
    });
}
function Mr(t) {
  const e = Tr(t.config.target);
  return e ? {
    target: e.map((n) => typeof n == "string" ? Gt(t.parent, n) : n)
  } : t.parent.type === "parallel" ? {
    target: [t.parent]
  } : t.parent.initial;
}
function rt(t) {
  return t.type === "history";
}
function Tn(t) {
  const e = Lr(t);
  for (const n of e)
    for (const r of zt(n, t))
      e.add(r);
  return e;
}
function Lr(t) {
  const e = /* @__PURE__ */ new Set();
  function n(r) {
    if (!e.has(r)) {
      if (e.add(r), r.type === "compound")
        n(r.initial.target[0]);
      else if (r.type === "parallel")
        for (const o of bt(r))
          n(o);
    }
  }
  return n(t), e;
}
function yt(t, e) {
  if (de(e))
    return t.machine.getStateNodeById(e);
  if (!t.states)
    throw new Error(`Unable to retrieve child state '${e}' from '${t.id}'; no child states exist.`);
  const n = t.states[e];
  if (!n)
    throw new Error(`Child state '${e}' does not exist on '${t.id}'`);
  return n;
}
function Gt(t, e) {
  if (typeof e == "string" && de(e))
    try {
      return t.machine.getStateNodeById(e);
    } catch {
    }
  const n = Ze(e).slice();
  let r = t;
  for (; n.length; ) {
    const o = n.shift();
    if (!o.length)
      break;
    r = yt(r, o);
  }
  return r;
}
function Xt(t, e) {
  if (typeof e == "string") {
    const o = t.states[e];
    if (!o)
      throw new Error(`State '${e}' does not exist on '${t.id}'`);
    return [t, o];
  }
  const n = Object.keys(e), r = n.map((o) => yt(t, o)).filter(Boolean);
  return [t.machine.root, t].concat(r, n.reduce((o, s) => {
    const i = yt(t, s);
    if (!i)
      return o;
    const a = Xt(i, e[s]);
    return o.concat(a);
  }, []));
}
function Ks(t, e, n, r) {
  const o = yt(t, e).next(n, r);
  return !o || !o.length ? t.next(n, r) : o;
}
function qs(t, e, n, r) {
  const o = Object.keys(e), s = yt(t, o[0]), i = Ge(s, e[o[0]], n, r);
  return !i || !i.length ? t.next(n, r) : i;
}
function Zs(t, e, n, r) {
  const o = [];
  for (const s of Object.keys(e)) {
    const i = e[s];
    if (!i)
      continue;
    const a = yt(t, s), c = Ge(a, i, n, r);
    c && o.push(...c);
  }
  return o.length ? o : t.next(n, r);
}
function Ge(t, e, n, r) {
  return typeof e == "string" ? Ks(t, e, n, r) : Object.keys(e).length === 1 ? qs(t, e, n, r) : Zs(t, e, n, r);
}
function Ws(t) {
  return Object.keys(t.states).map((e) => t.states[e]).filter((e) => e.type === "history");
}
function tt(t, e) {
  let n = t;
  for (; n.parent && n.parent !== e; )
    n = n.parent;
  return n.parent === e;
}
function Vs(t, e) {
  const n = new Set(t), r = new Set(e);
  for (const o of n)
    if (r.has(o))
      return !0;
  for (const o of r)
    if (n.has(o))
      return !0;
  return !1;
}
function Pr(t, e, n) {
  const r = /* @__PURE__ */ new Set();
  for (const o of t) {
    let s = !1;
    const i = /* @__PURE__ */ new Set();
    for (const a of r)
      if (Vs(Me([o], e, n), Me([a], e, n)))
        if (tt(o.source, a.source))
          i.add(a);
        else {
          s = !0;
          break;
        }
    if (!s) {
      for (const a of i)
        r.delete(a);
      r.add(o);
    }
  }
  return Array.from(r);
}
function Us(t) {
  const [e, ...n] = t;
  for (const r of zt(e, void 0))
    if (n.every((o) => tt(o, r)))
      return r;
}
function Xe(t, e) {
  if (!t.target)
    return [];
  const n = /* @__PURE__ */ new Set();
  for (const r of t.target)
    if (rt(r))
      if (e[r.id])
        for (const o of e[r.id])
          n.add(o);
      else
        for (const o of Xe(Mr(r), e))
          n.add(o);
    else
      n.add(r);
  return [...n];
}
function zr(t, e) {
  const n = Xe(t, e);
  if (!n)
    return;
  if (!t.reenter && n.every((o) => o === t.source || tt(o, t.source)))
    return t.source;
  const r = Us(n.concat(t.source));
  if (r)
    return r;
  if (!t.reenter)
    return t.source.machine.root;
}
function Me(t, e, n) {
  const r = /* @__PURE__ */ new Set();
  for (const o of t)
    if (o.target?.length) {
      const s = zr(o, n);
      o.reenter && o.source === s && r.add(s);
      for (const i of e)
        tt(i, s) && r.add(i);
    }
  return [...r];
}
function Js(t, e) {
  if (t.length !== e.size)
    return !1;
  for (const n of t)
    if (!e.has(n))
      return !1;
  return !0;
}
function Qs(t, e, n, r, o) {
  return Le([{
    target: [...Lr(t)],
    source: t,
    reenter: !0,
    actions: [],
    eventType: null,
    toJSON: null
  }], e, n, r, !0, o);
}
function Le(t, e, n, r, o, s) {
  const i = [];
  if (!t.length)
    return [e, i];
  const a = n.actionExecutor;
  n.actionExecutor = (c) => {
    i.push(c), a(c);
  };
  try {
    const c = new Set(e._nodes);
    let l = e.historyValue;
    const p = Pr(t, c, l);
    let u = e;
    o || ([u, l] = ti(u, r, n, p, c, l, s, n.actionExecutor)), u = vt(u, r, n, p.flatMap((f) => f.actions), s, void 0), u = Gs(u, r, n, p, c, s, l, o);
    const d = [...c];
    u.status === "done" && (u = vt(u, r, n, d.sort((f, h) => h.order - f.order).flatMap((f) => f.exit), s, void 0));
    try {
      return l === e.historyValue && Js(e._nodes, c) ? [u, i] : [ct(u, {
        _nodes: d,
        historyValue: l
      }), i];
    } catch (f) {
      throw f;
    }
  } finally {
    n.actionExecutor = a;
  }
}
function Ys(t, e, n, r, o) {
  if (r.output === void 0)
    return;
  const s = Ne(o.id, o.output !== void 0 && o.parent ? je(o.output, t.context, e, n.self) : void 0);
  return je(r.output, t.context, s, n.self);
}
function Gs(t, e, n, r, o, s, i, a) {
  let c = t;
  const l = /* @__PURE__ */ new Set(), p = /* @__PURE__ */ new Set();
  Xs(r, i, p, l), a && p.add(t.machine.root);
  const u = /* @__PURE__ */ new Set();
  for (const d of [...l].sort((f, h) => f.order - h.order)) {
    o.add(d);
    const f = [];
    f.push(...d.entry);
    for (const h of d.invoke)
      f.push(Je(h.src, {
        ...h,
        syncSnapshot: !!h.onSnapshot
      }));
    if (p.has(d)) {
      const h = d.initial.actions;
      f.push(...h);
    }
    if (c = vt(c, e, n, f, s, d.invoke.map((h) => h.id)), d.type === "final") {
      const h = d.parent;
      let g = h?.type === "parallel" ? h : h?.parent, m = g || d;
      for (h?.type === "compound" && s.push(Ne(h.id, d.output !== void 0 ? je(d.output, c.context, e, n.self) : void 0)); g?.type === "parallel" && !u.has(g) && Ye(o, g); )
        u.add(g), s.push(Ne(g.id)), m = g, g = g.parent;
      if (g)
        continue;
      c = ct(c, {
        status: "done",
        output: Ys(c, e, n, c.machine.root, m)
      });
    }
  }
  return c;
}
function Xs(t, e, n, r) {
  for (const o of t) {
    const s = zr(o, e);
    for (const a of o.target || [])
      !rt(a) && // if the target is different than the source then it will *definitely* be entered
      (o.source !== a || // we know that the domain can't lie within the source
      // if it's different than the source then it's outside of it and it means that the target has to be entered as well
      o.source !== s || // reentering transitions always enter the target, even if it's the source itself
      o.reenter) && (r.add(a), n.add(a)), ht(a, e, n, r);
    const i = Xe(o, e);
    for (const a of i) {
      const c = zt(a, s);
      s?.type === "parallel" && c.push(s), Rr(r, e, n, c, !o.source.parent && o.reenter ? void 0 : s);
    }
  }
}
function ht(t, e, n, r) {
  if (rt(t))
    if (e[t.id]) {
      const o = e[t.id];
      for (const s of o)
        r.add(s), ht(s, e, n, r);
      for (const s of o)
        ve(s, t.parent, r, e, n);
    } else {
      const o = Mr(t);
      for (const s of o.target)
        r.add(s), o === t.parent?.initial && n.add(t.parent), ht(s, e, n, r);
      for (const s of o.target)
        ve(s, t.parent, r, e, n);
    }
  else if (t.type === "compound") {
    const [o] = t.initial.target;
    rt(o) || (r.add(o), n.add(o)), ht(o, e, n, r), ve(o, t, r, e, n);
  } else if (t.type === "parallel")
    for (const o of bt(t).filter((s) => !rt(s)))
      [...r].some((s) => tt(s, o)) || (rt(o) || (r.add(o), n.add(o)), ht(o, e, n, r));
}
function Rr(t, e, n, r, o) {
  for (const s of r)
    if ((!o || tt(s, o)) && t.add(s), s.type === "parallel")
      for (const i of bt(s).filter((a) => !rt(a)))
        [...t].some((a) => tt(a, i)) || (t.add(i), ht(i, e, n, t));
}
function ve(t, e, n, r, o) {
  Rr(n, r, o, zt(t, e));
}
function ti(t, e, n, r, o, s, i, a) {
  let c = t;
  const l = Me(r, o, s);
  l.sort((u, d) => d.order - u.order);
  let p;
  for (const u of l)
    for (const d of Ws(u)) {
      let f;
      d.history === "deep" ? f = (h) => Qe(h) && tt(h, u) : f = (h) => h.parent === u, p ??= {
        ...s
      }, p[d.id] = Array.from(o).filter(f);
    }
  for (const u of l)
    c = vt(c, e, n, [...u.exit, ...u.invoke.map((d) => le(d.id))], i, void 0), o.delete(u);
  return [c, p || s];
}
function ei(t, e) {
  return t.implementations.actions[e];
}
function Dr(t, e, n, r, o, s) {
  const {
    machine: i
  } = t;
  let a = t;
  for (const c of r) {
    const l = typeof c == "function", p = l ? c : (
      // the existing type of `.actions` assumes non-nullable `TExpressionAction`
      // it's fine to cast this here to get a common type and lack of errors in the rest of the code
      // our logic below makes sure that we call those 2 "variants" correctly
      ei(i, typeof c == "string" ? c : c.type)
    ), u = {
      context: a.context,
      event: e,
      self: n.self,
      system: n.system
    }, d = l || typeof c == "string" ? void 0 : "params" in c ? typeof c.params == "function" ? c.params({
      context: a.context,
      event: e
    }) : c.params : void 0;
    if (!p || !("resolve" in p)) {
      n.actionExecutor({
        type: typeof c == "string" ? c : typeof c == "object" ? c.type : c.name || "(anonymous)",
        info: u,
        params: d,
        exec: p
      });
      continue;
    }
    const f = p, [h, g, m] = f.resolve(
      n,
      a,
      u,
      d,
      p,
      // this holds all params
      o
    );
    a = h, "retryResolve" in f && s?.push([f, g]), "execute" in f && n.actionExecutor({
      type: f.type,
      info: u,
      params: g,
      exec: f.execute.bind(null, n, g)
    }), m && (a = Dr(a, e, n, m, o, s));
  }
  return a;
}
function vt(t, e, n, r, o, s) {
  const i = s ? [] : void 0, a = Dr(t, e, n, r, {
    internalQueue: o,
    deferredActorIds: s
  }, i);
  return i?.forEach(([c, l]) => {
    c.retryResolve(n, a, l);
  }), a;
}
function xe(t, e, n, r) {
  let o = t;
  const s = [];
  function i(u, d, f) {
    n.system._sendInspectionEvent({
      type: "@xstate.microstep",
      actorRef: n.self,
      event: d,
      snapshot: u[0],
      _transitions: f
    }), s.push(u);
  }
  if (e.type === Qt)
    return o = ct(On(o, e, n), {
      status: "stopped"
    }), i([o, []], e, []), {
      snapshot: o,
      microsteps: s
    };
  let a = e;
  if (a.type !== Sr) {
    const u = a, d = Ss(u), f = In(u, o);
    if (d && !f.length)
      return o = ct(t, {
        status: "error",
        error: u.error
      }), i([o, []], u, []), {
        snapshot: o,
        microsteps: s
      };
    const h = Le(
      f,
      t,
      n,
      a,
      !1,
      // isInitial
      r
    );
    o = h[0], i(h, u, f);
  }
  let c = !0;
  const l = t.machine.options?.maxIterations ?? 1 / 0;
  let p = 0;
  for (; o.status === "active"; ) {
    if (p++, p > l)
      throw new Error(`Infinite loop detected: the machine has processed more than ${l} microsteps without reaching a stable state. This usually happens when there's a cycle of transitions (e.g., eventless transitions or raised events causing state A -> B -> C -> A).`);
    let u = c ? ni(o, a) : [];
    const d = u.length ? o : void 0;
    if (!u.length) {
      if (!r.length)
        break;
      a = r.shift(), u = In(a, o);
    }
    const f = Le(u, o, n, a, !1, r);
    o = f[0], c = o !== d, i(f, a, u);
  }
  return o.status !== "active" && On(o, a, n), {
    snapshot: o,
    microsteps: s
  };
}
function On(t, e, n) {
  return vt(t, e, n, Object.values(t.children).map((r) => le(r)), [], void 0);
}
function In(t, e) {
  return e.machine.getTransitionData(e, t);
}
function ni(t, e) {
  const n = /* @__PURE__ */ new Set(), r = t._nodes.filter(Qe);
  for (const o of r)
    t: for (const s of [o].concat(zt(o, void 0)))
      if (s.always) {
        for (const i of s.always)
          if (i.guard === void 0 || Pt(i.guard, t.context, e, t)) {
            n.add(i);
            break t;
          }
      }
  return Pr(Array.from(n), new Set(t._nodes), t.historyValue);
}
function ri(t, e) {
  const n = Yt(Xt(t, e));
  return jr(t, [...n]);
}
function oi(t) {
  return !!t && typeof t == "object" && "machine" in t && "value" in t;
}
const si = function(t) {
  return $r(t, this.value);
}, ii = function(t) {
  return this.tags.has(t);
}, ai = function(t) {
  const e = this.machine.getTransitionData(this, t);
  return !!e?.length && // Check that at least one transition is not forbidden
  e.some((n) => n.target !== void 0 || n.actions.length);
}, ci = function() {
  const {
    _nodes: t,
    tags: e,
    machine: n,
    getMeta: r,
    toJSON: o,
    can: s,
    hasTag: i,
    matches: a,
    ...c
  } = this;
  return {
    ...c,
    tags: Array.from(e)
  };
}, ui = function() {
  return this._nodes.reduce((t, e) => (e.meta !== void 0 && (t[e.id] = e.meta), t), {});
};
function qt(t, e) {
  return {
    status: t.status,
    output: t.output,
    error: t.error,
    machine: e,
    context: t.context,
    _nodes: t._nodes,
    value: jr(e.root, t._nodes),
    tags: new Set(t._nodes.flatMap((n) => n.tags)),
    children: t.children,
    historyValue: t.historyValue || {},
    matches: si,
    hasTag: ii,
    can: ai,
    getMeta: ui,
    toJSON: ci
  };
}
function ct(t, e = {}) {
  return qt({
    ...t,
    ...e
  }, t.machine);
}
function li(t) {
  if (typeof t != "object" || t === null)
    return {};
  const e = {};
  for (const n in t) {
    const r = t[n];
    Array.isArray(r) && (e[n] = r.map((o) => ({
      id: o.id
    })));
  }
  return e;
}
function di(t, e) {
  const {
    _nodes: n,
    tags: r,
    machine: o,
    children: s,
    context: i,
    can: a,
    hasTag: c,
    matches: l,
    getMeta: p,
    toJSON: u,
    ...d
  } = t, f = {};
  for (const h in s) {
    const g = s[h];
    f[h] = {
      snapshot: g.getPersistedSnapshot(e),
      src: g.src,
      systemId: g.systemId,
      syncSnapshot: g._syncSnapshot
    };
  }
  return {
    ...d,
    context: Br(i),
    children: f,
    historyValue: li(d.historyValue)
  };
}
function Br(t) {
  let e;
  for (const n in t) {
    const r = t[n];
    if (r && typeof r == "object")
      if ("sessionId" in r && "send" in r && "ref" in r)
        e ??= Array.isArray(t) ? t.slice() : {
          ...t
        }, e[n] = {
          xstate$$type: Ve,
          id: r.id
        };
      else {
        const o = Br(r);
        o !== r && (e ??= Array.isArray(t) ? t.slice() : {
          ...t
        }, e[n] = o);
      }
  }
  return e ?? t;
}
function fi(t, e, n, r, {
  event: o,
  id: s,
  delay: i
}, {
  internalQueue: a
}) {
  const c = e.machine.implementations.delays;
  if (typeof o == "string")
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Only event objects may be used with raise; use raise({ type: "${o}" }) instead`
    );
  const l = typeof o == "function" ? o(n, r) : o;
  let p;
  if (typeof i == "string") {
    const u = c && c[i];
    p = typeof u == "function" ? u(n, r) : u;
  } else
    p = typeof i == "function" ? i(n, r) : i;
  return typeof p != "number" && a.push(l), [e, {
    event: l,
    id: s,
    delay: p
  }, void 0];
}
function hi(t, e) {
  const {
    event: n,
    delay: r,
    id: o
  } = e;
  if (typeof r == "number") {
    t.defer(() => {
      const s = t.self;
      t.system.scheduler.schedule(s, s, n, r, o);
    });
    return;
  }
}
function tn(t, e) {
  function n(r, o) {
  }
  return n.type = "xstate.raise", n.event = t, n.id = e?.id, n.delay = e?.delay, n.resolve = fi, n.execute = hi, n;
}
const Nn = "xstate.promise.resolve", jn = "xstate.promise.reject", _t = /* @__PURE__ */ new WeakMap();
function pi(t) {
  return {
    config: t,
    transition: (e, n, r) => {
      if (e.status !== "active")
        return e;
      switch (n.type) {
        case Nn: {
          const o = n.data;
          return {
            ...e,
            status: "done",
            output: o,
            input: void 0
          };
        }
        case jn:
          return {
            ...e,
            status: "error",
            error: n.data,
            input: void 0
          };
        case Qt:
          return _t.get(r.self)?.abort(), _t.delete(r.self), {
            ...e,
            status: "stopped",
            input: void 0
          };
        default:
          return e;
      }
    },
    start: (e, {
      self: n,
      system: r,
      emit: o
    }) => {
      if (e.status !== "active")
        return;
      const s = new AbortController();
      _t.set(n, s), Promise.resolve(t({
        input: e.input,
        system: r,
        self: n,
        signal: s.signal,
        emit: o
      })).then((i) => {
        n.getSnapshot().status === "active" && (_t.delete(n), r._relay(n, n, {
          type: Nn,
          data: i
        }));
      }, (i) => {
        n.getSnapshot().status === "active" && (_t.delete(n), r._relay(n, n, {
          type: jn,
          data: i
        }));
      });
    },
    getInitialSnapshot: (e, n) => ({
      status: "active",
      output: void 0,
      error: void 0,
      input: n
    }),
    getPersistedSnapshot: (e) => e,
    restoreSnapshot: (e) => e
  };
}
function gi(t, {
  machine: e,
  context: n
}, r, o) {
  const s = (i, a) => {
    if (typeof i == "string") {
      const c = We(e, i);
      if (!c)
        throw new Error(`Actor logic '${i}' not implemented in machine '${e.id}'`);
      const l = It(c, {
        id: a?.id,
        parent: t.self,
        syncSnapshot: a?.syncSnapshot,
        input: typeof a?.input == "function" ? a.input({
          context: n,
          event: r,
          self: t.self
        }) : a?.input,
        src: i,
        systemId: a?.systemId
      });
      return o[l.id] = l, l;
    } else
      return It(i, {
        id: a?.id,
        parent: t.self,
        syncSnapshot: a?.syncSnapshot,
        input: a?.input,
        src: i,
        systemId: a?.systemId
      });
  };
  return (i, a) => {
    const c = s(i, a);
    return o[c.id] = c, t.defer(() => {
      c._processingStatus !== z.Stopped && c.start();
    }), c;
  };
}
function mi(t, e, n, r, {
  assignment: o
}) {
  if (!e.context)
    throw new Error("Cannot assign to undefined `context`. Ensure that `context` is defined in the machine config.");
  const s = {}, i = {
    context: e.context,
    event: n.event,
    spawn: gi(t, e, n.event, s),
    self: t.self,
    system: t.system
  };
  let a = {};
  if (typeof o == "function")
    a = o(i, r);
  else
    for (const l of Object.keys(o)) {
      const p = o[l];
      a[l] = typeof p == "function" ? p(i, r) : p;
    }
  const c = Object.assign({}, e.context, a);
  return [ct(e, {
    context: c,
    children: Object.keys(s).length ? {
      ...e.children,
      ...s
    } : e.children
  }), void 0, void 0];
}
function pt(t) {
  function e(n, r) {
  }
  return e.type = "xstate.assign", e.assignment = t, e.resolve = mi, e;
}
const Mn = /* @__PURE__ */ new WeakMap();
function dt(t, e, n) {
  let r = Mn.get(t);
  return r ? e in r || (r[e] = n()) : (r = {
    [e]: n()
  }, Mn.set(t, r)), r[e];
}
const bi = {}, At = (t) => typeof t == "string" ? {
  type: t
} : typeof t == "function" ? "resolve" in t ? {
  type: t.type
} : {
  type: t.name
} : t;
class te {
  constructor(e, n) {
    if (this.config = e, this.key = void 0, this.id = void 0, this.type = void 0, this.path = void 0, this.states = void 0, this.history = void 0, this.entry = void 0, this.exit = void 0, this.parent = void 0, this.machine = void 0, this.meta = void 0, this.output = void 0, this.order = -1, this.description = void 0, this.tags = [], this.transitions = void 0, this.always = void 0, this.parent = n._parent, this.key = n._key, this.machine = n._machine, this.path = this.parent ? this.parent.path.concat(this.key) : [], this.id = this.config.id || [this.machine.id, ...this.path].join(wr), this.type = this.config.type || (this.config.states && Object.keys(this.config.states).length ? "compound" : this.config.history ? "history" : "atomic"), this.description = this.config.description, this.order = this.machine.idMap.size, this.machine.idMap.set(this.id, this), this.states = this.config.states ? $n(this.config.states, (r, o) => new te(r, {
      _parent: this,
      _key: o,
      _machine: this.machine
    })) : bi, this.type === "compound" && !this.config.initial)
      throw new Error(`No initial state specified for compound state node "#${this.id}". Try adding { initial: "${Object.keys(this.states)[0]}" } to the state config.`);
    this.history = this.config.history === !0 ? "shallow" : this.config.history || !1, this.entry = Q(this.config.entry).slice(), this.exit = Q(this.config.exit).slice(), this.meta = this.config.meta, this.output = this.type === "final" || !this.parent ? this.config.output : void 0, this.tags = Q(e.tags).slice();
  }
  /** @internal */
  _initialize() {
    this.transitions = Ds(this), this.config.always && (this.always = ft(this.config.always).map((e) => J(this, kr, e))), Object.keys(this.states).forEach((e) => {
      this.states[e]._initialize();
    });
  }
  /** The well-structured state node definition. */
  get definition() {
    return {
      id: this.id,
      key: this.key,
      version: this.machine.version,
      type: this.type,
      initial: this.initial ? {
        target: this.initial.target,
        source: this,
        actions: this.initial.actions.map(At),
        eventType: null,
        reenter: !1,
        toJSON: () => ({
          target: this.initial.target.map((e) => `#${e.id}`),
          source: `#${this.id}`,
          actions: this.initial.actions.map(At),
          eventType: null
        })
      } : void 0,
      history: this.history,
      states: $n(this.states, (e) => e.definition),
      on: this.on,
      transitions: [...this.transitions.values()].flat().map((e) => ({
        ...e,
        actions: e.actions.map(At)
      })),
      entry: this.entry.map(At),
      exit: this.exit.map(At),
      meta: this.meta,
      order: this.order || -1,
      output: this.output,
      invoke: this.invoke,
      description: this.description,
      tags: this.tags
    };
  }
  /** @internal */
  toJSON() {
    return this.definition;
  }
  /** The logic invoked as actors by this state node. */
  get invoke() {
    return dt(this, "invoke", () => Q(this.config.invoke).map((e, n) => {
      const {
        src: r,
        systemId: o
      } = e, s = e.id ?? En(this.id, n), i = typeof r == "string" ? r : `xstate.invoke.${En(this.id, n)}`;
      return {
        ...e,
        src: i,
        id: s,
        systemId: o,
        toJSON() {
          const {
            onDone: a,
            onError: c,
            ...l
          } = e;
          return {
            ...l,
            type: "xstate.invoke",
            src: i,
            id: s
          };
        }
      };
    }));
  }
  /** The mapping of events to transitions. */
  get on() {
    return dt(this, "on", () => [...this.transitions].flatMap(([e, n]) => n.map((r) => [e, r])).reduce((e, [n, r]) => (e[n] = e[n] || [], e[n].push(r), e), {}));
  }
  get after() {
    return dt(this, "delayedTransitions", () => Rs(this));
  }
  get initial() {
    return dt(this, "initial", () => Hs(this, this.config.initial));
  }
  /** @internal */
  next(e, n) {
    const r = n.type, o = [];
    let s;
    const i = dt(this, `candidates-${r}`, () => zs(this, r));
    for (const a of i) {
      const {
        guard: c
      } = a, l = e.context;
      let p = !1;
      try {
        p = !c || Pt(c, l, n, e);
      } catch (u) {
        const d = typeof c == "string" ? c : typeof c == "object" ? c.type : void 0;
        throw new Error(`Unable to evaluate guard ${d ? `'${d}' ` : ""}in transition for event '${r}' in state node '${this.id}':
${u.message}`);
      }
      if (p) {
        o.push(...a.actions), s = a;
        break;
      }
    }
    return s ? [s] : void 0;
  }
  /** All the event types accepted by this state node and its descendants. */
  get events() {
    return dt(this, "events", () => {
      const {
        states: e
      } = this, n = new Set(this.ownEvents);
      if (e)
        for (const r of Object.keys(e)) {
          const o = e[r];
          if (o.states)
            for (const s of o.events)
              n.add(`${s}`);
        }
      return Array.from(n);
    });
  }
  /**
   * All the events that have transitions directly from this state node.
   *
   * Excludes any inert events.
   */
  get ownEvents() {
    const e = Object.keys(Object.fromEntries(this.transitions)), n = new Set(e.filter((r) => this.transitions.get(r).some((o) => !(!o.target && !o.actions.length && !o.reenter))));
    return Array.from(n);
  }
}
const yi = "#";
class en {
  constructor(e, n) {
    this.config = e, this.version = void 0, this.schemas = void 0, this.implementations = void 0, this.options = void 0, this.__xstatenode = !0, this.idMap = /* @__PURE__ */ new Map(), this.root = void 0, this.id = void 0, this.states = void 0, this.events = void 0, this.id = e.id || "(machine)", this.implementations = {
      actors: n?.actors ?? {},
      actions: n?.actions ?? {},
      delays: n?.delays ?? {},
      guards: n?.guards ?? {}
    }, this.version = this.config.version, this.schemas = this.config.schemas, this.options = {
      maxIterations: 1 / 0,
      ...this.config.options
    }, this.transition = this.transition.bind(this), this.getInitialSnapshot = this.getInitialSnapshot.bind(this), this.getPersistedSnapshot = this.getPersistedSnapshot.bind(this), this.restoreSnapshot = this.restoreSnapshot.bind(this), this.start = this.start.bind(this), this.root = new te(e, {
      _key: this.id,
      _machine: this
    }), this.root._initialize(), Bs(this.root), this.states = this.root.states, this.events = this.root.events;
  }
  /**
   * Clones this state machine with the provided implementations.
   *
   * @param implementations Options (`actions`, `guards`, `actors`, `delays`) to
   *   recursively merge with the existing options.
   * @returns A new `StateMachine` instance with the provided implementations.
   */
  provide(e) {
    const {
      actions: n,
      guards: r,
      actors: o,
      delays: s
    } = this.implementations;
    return new en(this.config, {
      actions: {
        ...n,
        ...e.actions
      },
      guards: {
        ...r,
        ...e.guards
      },
      actors: {
        ...o,
        ...e.actors
      },
      delays: {
        ...s,
        ...e.delays
      }
    });
  }
  resolveState(e) {
    const n = ri(this.root, e.value), r = Yt(Xt(this.root, n));
    return qt({
      _nodes: [...r],
      context: e.context || {},
      children: {},
      status: Ye(r, this.root) ? "done" : e.status || "active",
      output: e.output,
      error: e.error,
      historyValue: e.historyValue
    }, this);
  }
  /**
   * Determines the next snapshot given the current `snapshot` and received
   * `event`. Calculates a full macrostep from all microsteps.
   *
   * @param snapshot The current snapshot
   * @param event The received event
   */
  transition(e, n, r) {
    return xe(e, n, r, []).snapshot;
  }
  /**
   * Determines the next state given the current `state` and `event`. Calculates
   * a microstep.
   *
   * @param state The current state
   * @param event The received event
   */
  microstep(e, n, r) {
    return xe(e, n, r, []).microsteps.map(([o]) => o);
  }
  getTransitionData(e, n) {
    return Ge(this.root, e.value, e, n) || [];
  }
  /**
   * The initial state _before_ evaluating any microsteps. This "pre-initial"
   * state is provided to initial actions executed in the initial state.
   *
   * @internal
   */
  _getPreInitialState(e, n, r) {
    const {
      context: o
    } = this.config, s = qt({
      context: typeof o != "function" && o ? o : {},
      _nodes: [this.root],
      children: {},
      status: "active"
    }, this);
    return typeof o == "function" ? vt(s, n, e, [pt(({
      spawn: i,
      event: a,
      self: c
    }) => o({
      spawn: i,
      input: a.input,
      self: c
    }))], r, void 0) : s;
  }
  /**
   * Returns the initial `State` instance, with reference to `self` as an
   * `ActorRef`.
   */
  getInitialSnapshot(e, n) {
    const r = Ar(n), o = [], s = this._getPreInitialState(e, r, o), [i] = Qs(this.root, s, e, r, o), {
      snapshot: a
    } = xe(i, r, e, o);
    return a;
  }
  start(e) {
    Object.values(e.children).forEach((n) => {
      n.getSnapshot().status === "active" && n.start();
    });
  }
  getStateNodeById(e) {
    const n = Ze(e), r = n.slice(1), o = de(n[0]) ? n[0].slice(yi.length) : n[0], s = this.idMap.get(o);
    if (!s)
      throw new Error(`Child state node '#${o}' does not exist on machine '${this.id}'`);
    return Gt(s, r);
  }
  get definition() {
    return this.root.definition;
  }
  toJSON() {
    return this.definition;
  }
  getPersistedSnapshot(e, n) {
    return di(e, n);
  }
  restoreSnapshot(e, n) {
    const r = {}, o = e.children;
    Object.keys(o).forEach((u) => {
      const d = o[u], f = d.snapshot, h = d.src, g = typeof h == "string" ? We(this, h) : h;
      if (!g)
        return;
      const m = It(g, {
        id: u,
        parent: n.self,
        syncSnapshot: d.syncSnapshot,
        snapshot: f,
        src: h,
        systemId: d.systemId
      });
      r[u] = m;
    });
    function s(u, d) {
      if (d instanceof te)
        return d;
      try {
        return u.machine.getStateNodeById(d.id);
      } catch {
      }
    }
    function i(u, d) {
      if (!d || typeof d != "object")
        return {};
      const f = {};
      for (const h in d) {
        const g = d[h];
        for (const m of g) {
          const x = s(u, m);
          x && (f[h] ??= [], f[h].push(x));
        }
      }
      return f;
    }
    const a = i(this.root, e.historyValue), c = qt({
      ...e,
      children: r,
      _nodes: Array.from(Yt(Xt(this.root, e.value))),
      historyValue: a
    }, this), l = /* @__PURE__ */ new Set();
    function p(u, d) {
      if (!l.has(u)) {
        l.add(u);
        for (const f in u) {
          const h = u[f];
          if (h && typeof h == "object") {
            if ("xstate$$type" in h && h.xstate$$type === Ve) {
              u[f] = d[h.id];
              continue;
            }
            p(h, d);
          }
        }
      }
    }
    return p(c.context, r), c;
  }
}
function vi(t, e, n, r, {
  event: o
}) {
  const s = typeof o == "function" ? o(n, r) : o;
  return [e, {
    event: s
  }, void 0];
}
function xi(t, {
  event: e
}) {
  t.defer(() => t.emit(e));
}
function nn(t) {
  function e(n, r) {
  }
  return e.type = "xstate.emit", e.event = t, e.resolve = vi, e.execute = xi, e;
}
let Pe = /* @__PURE__ */ (function(t) {
  return t.Parent = "#_parent", t.Internal = "#_internal", t;
})({});
function wi(t, e, n, r, {
  to: o,
  event: s,
  id: i,
  delay: a
}, c) {
  const l = e.machine.implementations.delays;
  if (typeof s == "string")
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Only event objects may be used with sendTo; use sendTo({ type: "${s}" }) instead`
    );
  const p = typeof s == "function" ? s(n, r) : s;
  let u;
  if (typeof a == "string") {
    const h = l && l[a];
    u = typeof h == "function" ? h(n, r) : h;
  } else
    u = typeof a == "function" ? a(n, r) : a;
  const d = typeof o == "function" ? o(n, r) : o;
  let f;
  if (typeof d == "string") {
    if (d === Pe.Parent ? f = t.self._parent : d === Pe.Internal ? f = t.self : d.startsWith("#_") ? f = e.children[d.slice(2)] : f = c.deferredActorIds?.includes(d) ? d : e.children[d], !f)
      throw new Error(`Unable to send event to actor '${d}' from machine '${e.machine.id}'.`);
  } else
    f = d || t.self;
  return [e, {
    to: f,
    targetId: typeof d == "string" ? d : void 0,
    event: p,
    id: i,
    delay: u
  }, void 0];
}
function ki(t, e, n) {
  typeof n.to == "string" && (n.to = e.children[n.to]);
}
function Si(t, e) {
  t.defer(() => {
    const {
      to: n,
      event: r,
      delay: o,
      id: s
    } = e;
    if (typeof o == "number") {
      t.system.scheduler.schedule(t.self, n, r, o, s);
      return;
    }
    t.system._relay(
      t.self,
      // at this point, in a deferred task, it should already be mutated by retryResolveSendTo
      // if it initially started as a string
      n,
      r.type === ys ? _r(t.self.id, r.data) : r
    );
  });
}
function rn(t, e, n) {
  function r(o, s) {
  }
  return r.type = "xstate.sendTo", r.to = t, r.event = e, r.id = n?.id, r.delay = n?.delay, r.resolve = wi, r.retryResolve = ki, r.execute = Si, r;
}
function _i(t, e) {
  return rn(Pe.Parent, t, e);
}
function Ai(t, e, n, r, {
  collect: o
}) {
  const s = [], i = function(a) {
    s.push(a);
  };
  return i.assign = (...a) => {
    s.push(pt(...a));
  }, i.cancel = (...a) => {
    s.push(Ue(...a));
  }, i.raise = (...a) => {
    s.push(tn(...a));
  }, i.sendTo = (...a) => {
    s.push(rn(...a));
  }, i.sendParent = (...a) => {
    s.push(_i(...a));
  }, i.spawnChild = (...a) => {
    s.push(Je(...a));
  }, i.stopChild = (...a) => {
    s.push(le(...a));
  }, i.emit = (...a) => {
    s.push(nn(...a));
  }, o({
    context: n.context,
    event: n.event,
    enqueue: i,
    check: (a) => Pt(a, e.context, n.event, e),
    self: t.self,
    system: t.system
  }, r), [e, void 0, s];
}
function $i(t) {
  function e(n, r) {
  }
  return e.type = "xstate.enqueueActions", e.collect = t, e.resolve = Ai, e;
}
function Ei(t, e, n, r, {
  value: o,
  label: s
}) {
  return [e, {
    value: typeof o == "function" ? o(n, r) : o,
    label: s
  }, void 0];
}
function Ci({
  logger: t
}, {
  value: e,
  label: n
}) {
  n ? t(n, e) : t(e);
}
function Ti(t = ({
  context: n,
  event: r
}) => ({
  context: n,
  event: r
}), e) {
  function n(r, o) {
  }
  return n.type = "xstate.log", n.value = t, n.label = e, n.resolve = Ei, n.execute = Ci, n;
}
function Oi(t, e) {
  return new en(t, e);
}
function Hr({
  schemas: t,
  actors: e,
  actions: n,
  guards: r,
  delays: o
}) {
  return {
    assign: pt,
    sendTo: rn,
    raise: tn,
    log: Ti,
    cancel: Ue,
    stopChild: le,
    enqueueActions: $i,
    emit: nn,
    spawnChild: Je,
    createStateConfig: (s) => s,
    createAction: (s) => s,
    createMachine: (s) => Oi({
      ...s,
      schemas: t
    }, {
      actors: e,
      actions: n,
      guards: r,
      delays: o
    }),
    extend: (s) => Hr({
      schemas: t,
      actors: e,
      actions: {
        ...n,
        ...s.actions
      },
      guards: {
        ...r,
        ...s.guards
      },
      delays: {
        ...o,
        ...s.delays
      }
    })
  };
}
const Ii = Hr({
  actors: {
    submitFeedback: pi(async ({ input: t }) => cs(t.anchor.route, t.body, t.anchor))
  },
  actions: {
    assignPick: pt({
      anchor: ({ event: t }) => t.anchor,
      point: ({ event: t }) => t.point
    }),
    setPendingBody: pt({
      pendingBody: ({ event: t }) => t.body
    }),
    clearPending: pt({
      pendingBody: "",
      anchor: null,
      point: null
    })
  }
}).createMachine({
  id: "feedback",
  initial: "idle",
  context: {
    anchor: null,
    point: null,
    pendingBody: ""
  },
  states: {
    idle: {
      on: {
        TOGGLE: "mode"
      }
    },
    mode: {
      type: "compound",
      initial: "picking",
      // Badge tap closes the widget from any sub-mode.
      on: {
        TOGGLE: "idle"
      },
      states: {
        picking: {
          on: {
            PICK: {
              target: "composing",
              actions: "assignPick"
            }
          }
        },
        composing: {
          on: {
            CANCEL: {
              target: "picking",
              actions: "clearPending"
            },
            SUBMIT: {
              target: "submitting",
              actions: "setPendingBody"
            }
          }
        },
        submitting: {
          invoke: {
            src: "submitFeedback",
            input: ({ context: t }) => ({
              anchor: t.anchor,
              body: t.pendingBody
            }),
            // A sent comment ends the session: close the mode back to idle.
            onDone: {
              target: "#feedback.idle",
              actions: ["clearPending", nn({ type: "sent" })]
            },
            onError: "error"
          }
        },
        error: {
          on: {
            RETRY: "submitting",
            CANCEL: {
              target: "picking",
              actions: "clearPending"
            }
          }
        }
      }
    }
  }
}), ze = /* @__PURE__ */ Symbol("store-raw"), gt = /* @__PURE__ */ Symbol("store-node"), F = /* @__PURE__ */ Symbol("store-has"), Fr = /* @__PURE__ */ Symbol("store-self");
function Kr(t) {
  let e = t[st];
  if (!e && (Object.defineProperty(t, st, {
    value: e = new Proxy(t, Mi)
  }), !Array.isArray(t))) {
    const n = Object.keys(t), r = Object.getOwnPropertyDescriptors(t), o = Object.getPrototypeOf(t), s = o !== null && t !== null && typeof t == "object" && !Array.isArray(t) && o !== Object.prototype;
    if (s) {
      const i = Object.getOwnPropertyDescriptors(o);
      n.push(...Object.keys(i)), Object.assign(r, i);
    }
    for (let i = 0, a = n.length; i < a; i++) {
      const c = n[i];
      s && c === "constructor" || r[c].get && Object.defineProperty(t, c, {
        configurable: !0,
        enumerable: r[c].enumerable,
        get: r[c].get.bind(e)
      });
    }
  }
  return e;
}
function ee(t) {
  let e;
  return t != null && typeof t == "object" && (t[st] || !(e = Object.getPrototypeOf(t)) || e === Object.prototype || Array.isArray(t));
}
function Nt(t, e = /* @__PURE__ */ new Set()) {
  let n, r, o, s;
  if (n = t != null && t[ze]) return n;
  if (!ee(t) || e.has(t)) return t;
  if (Array.isArray(t)) {
    Object.isFrozen(t) ? t = t.slice(0) : e.add(t);
    for (let i = 0, a = t.length; i < a; i++)
      o = t[i], (r = Nt(o, e)) !== o && (t[i] = r);
  } else {
    Object.isFrozen(t) ? t = Object.assign({}, t) : e.add(t);
    const i = Object.keys(t), a = Object.getOwnPropertyDescriptors(t);
    for (let c = 0, l = i.length; c < l; c++)
      s = i[c], !a[s].get && (o = t[s], (r = Nt(o, e)) !== o && (t[s] = r));
  }
  return t;
}
function ne(t, e) {
  let n = t[e];
  return n || Object.defineProperty(t, e, {
    value: n = /* @__PURE__ */ Object.create(null)
  }), n;
}
function jt(t, e, n) {
  if (t[e]) return t[e];
  const [r, o] = j(n, {
    equals: !1,
    internal: !0
  });
  return r.$ = o, t[e] = r;
}
function Ni(t, e) {
  const n = Reflect.getOwnPropertyDescriptor(t, e);
  return !n || n.get || !n.configurable || e === st || e === gt || (delete n.value, delete n.writable, n.get = () => t[st][e]), n;
}
function qr(t) {
  $e() && jt(ne(t, gt), Fr)();
}
function ji(t) {
  return qr(t), Reflect.ownKeys(t);
}
const Mi = {
  get(t, e, n) {
    if (e === ze) return t;
    if (e === st) return n;
    if (e === Ae)
      return qr(t), n;
    const r = ne(t, gt), o = r[e];
    let s = o ? o() : t[e];
    if (e === gt || e === F || e === "__proto__") return s;
    if (!o) {
      const i = Object.getOwnPropertyDescriptor(t, e);
      $e() && (typeof s != "function" || Object.prototype.hasOwnProperty.call(t, e)) && !(i && i.get) && (s = jt(r, e, s)());
    }
    return ee(s) ? Kr(s) : s;
  },
  has(t, e) {
    return e === ze || e === st || e === Ae || e === gt || e === F || e === "__proto__" ? !0 : ($e() && jt(ne(t, F), e)(), e in t);
  },
  set() {
    return !0;
  },
  deleteProperty() {
    return !0;
  },
  ownKeys: ji,
  getOwnPropertyDescriptor: Ni
};
function re(t, e, n, r = !1) {
  if (e === "__proto__" || !r && t[e] === n) return;
  const o = t[e], s = t.length;
  n === void 0 ? (delete t[e], t[F] && t[F][e] && o !== void 0 && t[F][e].$()) : (t[e] = n, t[F] && t[F][e] && o === void 0 && t[F][e].$());
  let i = ne(t, gt), a;
  if ((a = jt(i, e, o)) && a.$(() => n), Array.isArray(t) && t.length !== s) {
    for (let c = t.length; c < s; c++) (a = i[c]) && a.$();
    (a = jt(i, "length", s)) && a.$(t.length);
  }
  (a = i[Fr]) && a.$();
}
function Zr(t, e) {
  const n = Object.keys(e);
  for (let r = 0; r < n.length; r += 1) {
    const o = n[r];
    Wr(o) || re(t, o, e[o]);
  }
}
function Wr(t) {
  return t === "__proto__" || t === "constructor" || t === "prototype";
}
function Li(t, e) {
  if (typeof e == "function" && (e = e(t)), e = Nt(e), Array.isArray(e)) {
    if (t === e) return;
    let n = 0, r = e.length;
    for (; n < r; n++) {
      const o = e[n];
      t[n] !== o && re(t, n, o);
    }
    re(t, "length", r);
  } else Zr(t, e);
}
function Et(t, e, n = []) {
  let r, o = t;
  if (e.length > 1) {
    r = e.shift();
    const i = typeof r, a = Array.isArray(t);
    if (i === "string" && (r === "__proto__" || e.length > 1 && Wr(r)))
      return;
    if (Array.isArray(r)) {
      for (let c = 0; c < r.length; c++)
        Et(t, [r[c]].concat(e), n);
      return;
    } else if (a && i === "function") {
      for (let c = 0; c < t.length; c++)
        r(t[c], c) && Et(t, [c].concat(e), n);
      return;
    } else if (a && i === "object") {
      const {
        from: c = 0,
        to: l = t.length - 1,
        by: p = 1
      } = r;
      for (let u = c; u <= l; u += p)
        Et(t, [u].concat(e), n);
      return;
    } else if (e.length > 1) {
      Et(t[r], e, [r].concat(n));
      return;
    }
    o = t[r], n = [r].concat(n);
  }
  let s = e[0];
  typeof s == "function" && (s = s(o, n), s === o) || r === void 0 && s == null || (s = Nt(s), r === void 0 || ee(o) && ee(s) && !Array.isArray(s) ? Zr(o, s) : re(t, r, s));
}
function Pi(...[t, e]) {
  const n = Nt(t || {}), r = Array.isArray(n), o = Kr(n);
  function s(...i) {
    Yn(() => {
      r && i.length === 1 ? Li(n, i[0]) : Et(n, i);
    });
  }
  return [o, s];
}
function oe(t) {
  let e;
  return t != null && typeof t == "object" && (!(e = Object.getPrototypeOf(t)) || e === Object.prototype || Array.isArray(t));
}
const Vr = (t, e) => {
  if (!oe(t))
    return t;
  const n = !Array.isArray(t), [r, o] = n ? [{}, Object.keys(t)] : [[], t];
  e.set(t, r);
  for (let s = 0; s < o.length; ++s) {
    const i = n ? o[s] : s, a = t[i];
    e.has(a) ? r[i] = e.get(a) : r[i] = Vr(a, e);
  }
  return r;
}, zi = (t) => Vr(t, /* @__PURE__ */ new WeakMap()), Ri = (t, e = {}) => {
  let n = e;
  for (let r = 0; r < t.length; r++)
    n = n?.[t[r]];
  return n;
}, Di = (t) => oe(t) ? Array.isArray(t) ? [] : {} : t, Bi = (t, e, n, r) => {
  const o = /* @__PURE__ */ new WeakMap(), s = (i, a, c) => {
    if (a !== i) {
      if (o.has(i)) {
        n(...c, o.get(i));
        return;
      }
      if (!oe(i) || !oe(a)) {
        c[c.length - 1] !== "toString" && n(...c, () => i);
        return;
      }
      if (o.set(i, Ri(c, r)), Array.isArray(i) && Array.isArray(a)) {
        const l = i.length - a.length, p = Math.min(a.length, i.length), u = Math.max(i.length, a.length);
        if (l !== 0)
          for (let d = p; d <= u - 1; d++)
            n(...c, d, Di(i[d]));
        for (let d = 0, f = u - 1; d <= f && (s(i[d], a[d], [...c, d]), d !== f); d++, f--)
          s(i[f], a[f], [...c, f]);
        a.length !== i.length && n(...c, "length", i.length);
      } else {
        const l = Object.keys(i);
        for (let u = 0, d = l.length; u < d; u++)
          s(i[l[u]], a[l[u]], [...c, l[u]]);
        const p = Object.keys(a);
        for (let u = 0, d = p.length; u < d; u++)
          i[p[u]] === void 0 && n(...c, p[u], void 0);
      }
    }
  };
  s(t, e, []);
};
function Hi(t) {
  const [e, n] = Pi(zi(t));
  let r = t;
  return [e, (o) => {
    Yn(() => {
      Bi(o, r, n, e);
    }), r = o;
  }];
}
const Ln = () => {
};
function Fi(t) {
  const e = Z(() => typeof t == "function" ? t() : t), [n, r] = Hi({
    v: e()?.getSnapshot()
  });
  return q((o) => {
    const s = e();
    if (o || r({
      v: s?.getSnapshot()
    }), s) {
      const {
        unsubscribe: i
      } = s.subscribe({
        next: (a) => r({
          v: a
        }),
        error: Ln,
        complete: Ln
      });
      R(i);
    }
    return !1;
  }, !0), () => n.v;
}
function Ki(t, ...[e]) {
  const n = It(t, e);
  return xt(() => {
    n.start(), R(() => n.stop());
  }), n;
}
function qi(t, ...[e]) {
  const n = Ki(t, e);
  return [Fi(n)(), n.send, n];
}
function Zi(t, ...[e]) {
  return qi(t, e);
}
function on(t) {
  return t === void 0 ? "" : typeof t == "string" ? t : Object.entries(t).map(([e, n]) => `${e}.${on(n)}`).join(" ");
}
var Wi = /* @__PURE__ */ O('<svg class=ms viewBox="0 -960 960 960"aria-hidden=true><path>');
const Vi = {
  add: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
  chat_bubble: "M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z",
  close: "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
  delete: "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z",
  list_alt: "M348.5-291.5Q360-303 360-320t-11.5-28.5Q337-360 320-360t-28.5 11.5Q280-337 280-320t11.5 28.5Q303-280 320-280t28.5-11.5Zm0-160Q360-463 360-480t-11.5-28.5Q337-520 320-520t-28.5 11.5Q280-497 280-480t11.5 28.5Q303-440 320-440t28.5-11.5Zm0-160Q360-623 360-640t-11.5-28.5Q337-680 320-680t-28.5 11.5Q280-657 280-640t11.5 28.5Q303-600 320-600t28.5-11.5ZM440-280h240v-80H440v80Zm0-160h240v-80H440v80Zm0-160h240v-80H440v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z"
};
function W(t) {
  return (() => {
    var e = Wi(), n = e.firstChild;
    return P(() => N(n, "d", Vi[t.name])), e;
  })();
}
var Ui = /* @__PURE__ */ O("<div class=feedback-badge-cluster data-feedback-ui><button type=button class=feedback-panel-toggle></button><button type=button class=feedback-badge data-machine=feedback>");
function Ji(t) {
  return (() => {
    var e = Ui(), n = e.firstChild, r = n.nextSibling;
    return Ot(n, "click", t.onOpenPanel), w(n, k(W, {
      name: "list_alt"
    })), Ot(r, "click", t.onToggle), w(r, k(W, {
      get name() {
        return t.active ? "close" : "chat_bubble";
      }
    })), P((o) => {
      var s = t.panelOpen || void 0, i = t.labels.openPanel, a = !!t.active, c = t.stateAttr, l = t.active, p = t.active ? t.labels.endMode : t.labels.startMode;
      return s !== o.e && N(e, "data-panel-open", o.e = s), i !== o.t && N(n, "aria-label", o.t = i), a !== o.a && r.classList.toggle("active", o.a = a), c !== o.o && N(r, "data-state", o.o = c), l !== o.i && N(r, "aria-pressed", o.i = l), p !== o.n && N(r, "aria-label", o.n = p), o;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0,
      i: void 0,
      n: void 0
    }), e;
  })();
}
ie(["click"]);
var Qi = /* @__PURE__ */ O("<p class=error><button type=button class=feedback-composer-retry style=margin-left:8px>"), Yi = /* @__PURE__ */ O('<div class=feedback-composer data-feedback-ui><form class=feedback-composer-form><textarea class=feedback-composer-textarea maxlength=1000 rows=3></textarea><div class=feedback-composer-actions><span class="feedback-composer-count muted"></span><div class=feedback-composer-buttons><button type=button class="feedback-composer-cancel ghost"></button><button type=submit class=feedback-composer-submit>');
const Pn = 1e3;
function Gi(t) {
  const [e, n] = j("");
  let r;
  xt(() => r?.focus());
  const o = () => e().trim().length > 0 && e().trim().length <= Pn && !t.submitting, s = (i) => {
    i.preventDefault(), o() && t.onSubmit(e().trim());
  };
  return (() => {
    var i = Yi(), a = i.firstChild, c = a.firstChild, l = c.nextSibling, p = l.firstChild, u = p.nextSibling, d = u.firstChild, f = d.nextSibling;
    a.addEventListener("submit", s), c.$$input = (g) => n(g.currentTarget.value);
    var h = r;
    return typeof h == "function" ? rr(h, c) : r = c, w(p, () => t.labels.composerCount(e().trim().length, Pn)), Ot(d, "click", t.onCancel), w(d, () => t.labels.composerCancel), w(f, k(W, {
      name: "send"
    }), null), w(f, () => t.labels.composerSubmit, null), w(a, k(I, {
      get when() {
        return t.error;
      },
      get children() {
        var g = Qi(), m = g.firstChild;
        return w(g, () => t.labels.composerError, m), Ot(m, "click", t.onRetry), w(m, () => t.labels.composerRetry), g;
      }
    }), null), P((g) => {
      var m = t.labels.composerPlaceholder, x = t.submitting, b = t.submitting, v = !o();
      return m !== g.e && N(c, "placeholder", g.e = m), x !== g.t && (c.disabled = g.t = x), b !== g.a && (d.disabled = g.a = b), v !== g.o && (f.disabled = g.o = v), g;
    }, {
      e: void 0,
      t: void 0,
      a: void 0,
      o: void 0
    }), P(() => c.value = e()), i;
  })();
}
ie(["input", "click"]);
const Ur = 640, Xi = `(min-width: ${Ur}px)`, sn = "feedback-item-delete";
function Jr(t) {
  return t.composedPath().some((e) => e?.classList?.contains(sn) === !0);
}
var ta = /* @__PURE__ */ O("<div class=feedback-panel data-feedback-ui><div class=feedback-panel-head><h2></h2><div class=feedback-panel-head-actions><button type=button class=icon-btn></button></div></div><div class=feedback-panel-list>"), ea = /* @__PURE__ */ O('<p class="muted center">'), na = /* @__PURE__ */ O("<button type=button>"), ra = /* @__PURE__ */ O('<div class=feedback-item><button type=button class=feedback-item-route></button><button type=button class="feedback-item-text feedback-item-focus"></button><div class=feedback-item-row><span class="muted feedback-item-anchor"></span><span class=muted></span><span class=spacer></span><button type=button class=feedback-item-vote></button><span class=feedback-item-votes>');
function oa(t) {
  const [e, n] = j(!1), [r, o] = j(null);
  xt(() => {
    const l = window.matchMedia(Xi), p = () => n(l.matches);
    p(), l.addEventListener("change", p), R(() => l.removeEventListener("change", p));
  }), q(() => {
    if (r() === null) return;
    const l = (u) => {
      Jr(u) || o(null);
    }, p = (u) => {
      u.key === "Escape" && (u.stopPropagation(), o(null));
    };
    document.addEventListener("pointerdown", l, {
      capture: !0
    }), document.addEventListener("keydown", p), R(() => {
      document.removeEventListener("pointerdown", l, {
        capture: !0
      }), document.removeEventListener("keydown", p);
    });
  }), q(() => {
    const l = r();
    l !== null && !t.items.some((p) => p.id === l) && o(null);
  });
  const s = (l) => {
    if (r() !== l.id) {
      o(l.id);
      return;
    }
    o(null), pr(l) && Lt(), vr(l.id);
  }, i = () => [...t.items].sort((l, p) => p.created_at.localeCompare(l.created_at)), a = So({
    close: () => t.onClose(),
    navigate: (l) => {
      vn(l) && t.onNavigate(l);
    }
  }), c = async (l) => {
    if (e() || t.onClose(), t.currentRoute() !== l.anchor.route) {
      if (!vn(l.anchor.route)) {
        t.onNotify(t.labels.focusNotFound);
        return;
      }
      t.onNavigate(l.anchor.route);
    }
    await ts(l.anchor, t.focusOwner) || t.onNotify(t.labels.focusNotFound);
  };
  return (() => {
    var l = ta(), p = l.firstChild, u = p.firstChild, d = u.nextSibling, f = d.firstChild, h = p.nextSibling;
    return w(u, () => t.labels.panelTitle), w(d, () => _o(t.headerActions, a), f), Ot(f, "click", t.onClose), w(f, k(W, {
      name: "close"
    })), w(h, k(I, {
      get when() {
        return i().length > 0;
      },
      get fallback() {
        return (() => {
          var g = ea();
          return w(g, () => t.labels.panelEmpty), g;
        })();
      },
      get children() {
        return k(Ht, {
          get each() {
            return i();
          },
          children: (g) => (() => {
            var m = ra(), x = m.firstChild, b = x.nextSibling, v = b.nextSibling, _ = v.firstChild, A = _.nextSibling, y = A.nextSibling, S = y.nextSibling, $ = S.nextSibling;
            return x.$$click = () => a.goTo(g.route), w(x, () => g.route), b.$$click = () => {
              c(g);
            }, w(b, () => g.body), w(m, () => t.renderItemMeta?.(g), v), w(_, () => ot().describeAnchor(g.anchor)), w(A, () => t.labels.formatRelativeTime(g.created_at)), S.$$click = () => xr(g.id, 1), w(S, k(W, {
              name: "add"
            })), w($, () => mr(g)), w(v, k(I, {
              get when() {
                return g.author_key === t.authorKey;
              },
              get children() {
                var C = na();
                return C.$$click = () => s(g), De(C, sn), w(C, k(I, {
                  get when() {
                    return r() === g.id;
                  },
                  get fallback() {
                    return k(W, {
                      name: "delete"
                    });
                  },
                  get children() {
                    return t.labels.deleteConfirmText;
                  }
                })), P((M) => {
                  var D = r() === g.id, V = r() === g.id ? t.labels.deleteConfirmHint : t.labels.deleteItem;
                  return D !== M.e && C.classList.toggle("confirming", M.e = D), V !== M.t && N(C, "aria-label", M.t = V), M;
                }, {
                  e: void 0,
                  t: void 0
                }), C;
              }
            }), null), P((C) => {
              var M = t.labels.itemFocusHint, D = t.labels.voteUp;
              return M !== C.e && N(b, "title", C.e = M), D !== C.t && N(S, "aria-label", C.t = D), C;
            }, {
              e: void 0,
              t: void 0
            }), m;
          })()
        });
      }
    })), P(() => N(f, "aria-label", t.labels.close)), l;
  })();
}
ie(["click"]);
var sa = /* @__PURE__ */ O("<div data-feedback-ui>");
function zn(t) {
  const [e, n] = j(null), r = () => {
    const o = ot().resolveAnchor(t.anchor);
    n(o ? o.getBoundingClientRect() : null);
  };
  return xt(() => {
    r(), window.addEventListener("scroll", r, {
      passive: !0,
      capture: !0
    }), window.addEventListener("resize", r);
  }), R(() => {
    window.removeEventListener("scroll", r, !0), window.removeEventListener("resize", r);
  }), q(() => {
    t.anchor, r();
  }), k(I, {
    get when() {
      return e();
    },
    children: (o) => (() => {
      var s = sa();
      return P((i) => {
        var a = t.class ?? "feedback-pick-highlight", c = `${o().left}px`, l = `${o().top}px`, p = `${o().width}px`, u = `${o().height}px`;
        return a !== i.e && De(s, i.e = a), c !== i.t && B(s, "left", i.t = c), l !== i.a && B(s, "top", i.a = l), p !== i.o && B(s, "width", i.o = p), u !== i.i && B(s, "height", i.i = u), i;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0,
        i: void 0
      }), s;
    })()
  });
}
var ia = /* @__PURE__ */ O("<span class=name-avatar>"), aa = /* @__PURE__ */ O('<img class="name-avatar name-avatar-img"referrerpolicy=no-referrer alt>'), ca = /* @__PURE__ */ O("<div class=feedback-pins data-feedback-ui>"), ua = /* @__PURE__ */ O("<span class=feedback-pin-more>+"), la = /* @__PURE__ */ O("<button type=button class=feedback-pin><span class=feedback-pin-stack>"), da = /* @__PURE__ */ O("<div class=feedback-pin-popover data-feedback-ui><button type=button class=feedback-pin-popover-close></button><div class=feedback-pin-popover-list>"), fa = /* @__PURE__ */ O("<button type=button>"), ha = /* @__PURE__ */ O("<div class=feedback-item><div class=feedback-item-author><span class=feedback-item-author-name></span></div><div class=feedback-item-text></div><div class=feedback-item-row><button type=button class=feedback-item-vote></button><span class=feedback-item-votes></span><span class=spacer>");
const pa = 200, ga = 24, we = 3, ma = 360, ke = 16;
function Rn(t) {
  return k(I, {
    get when() {
      return t.picture;
    },
    get fallback() {
      return (() => {
        var e = ia();
        return w(e, () => [...t.name][0] ?? "?"), e;
      })();
    },
    children: (e) => (() => {
      var n = aa();
      return P(() => N(n, "src", e())), n;
    })()
  });
}
function ba(t) {
  const [e, n] = j(0), [r, o] = j(null), [s, i] = j(null), a = () => n((h) => h + 1), c = (h) => {
    const g = Math.min(ma, window.innerWidth - 2 * ke), m = {
      left: `${Math.min(Math.max(h.x, ke + g / 2), window.innerWidth - ke - g / 2)}px`,
      transform: "translateX(-50%)"
    };
    return h.y > window.innerHeight * 0.5 ? m.bottom = `${window.innerHeight - h.y + 36}px` : m.top = `${h.y + 12}px`, m;
  };
  let l, p;
  xt(() => {
    window.addEventListener("scroll", a, {
      passive: !0,
      capture: !0
    }), window.addEventListener("resize", a), l = new MutationObserver(() => {
      p && clearTimeout(p), p = setTimeout(a, pa);
    }), l.observe(document.body, {
      childList: !0,
      subtree: !0,
      attributes: !0
    });
  }), R(() => {
    window.removeEventListener("scroll", a, !0), window.removeEventListener("resize", a), l?.disconnect(), p && clearTimeout(p);
  }), q(() => {
    t.route, t.items, a();
  }), q(() => {
    if (s() === null) return;
    const h = (m) => {
      Jr(m) || i(null);
    }, g = (m) => {
      m.key === "Escape" && (m.stopPropagation(), i(null));
    };
    document.addEventListener("pointerdown", h, {
      capture: !0
    }), document.addEventListener("keydown", g), R(() => {
      document.removeEventListener("pointerdown", h, {
        capture: !0
      }), document.removeEventListener("keydown", g);
    });
  }), q(() => {
    const h = s();
    h !== null && !t.items.some((g) => g.id === h) && i(null);
  });
  const u = (h) => {
    if (s() !== h.id) {
      i(h.id);
      return;
    }
    i(null), pr(h) && Lt(), vr(h.id);
  }, d = Z(() => {
    e();
    const h = t.route, g = ot().resolveAnchor, m = [];
    for (const x of t.items) {
      if (x.anchor.route !== h) continue;
      const b = g(x.anchor);
      if (!b) continue;
      const v = b.getBoundingClientRect();
      m.push({
        item: x,
        el: b,
        x: v.left + v.width * x.anchor.rectRatio.x,
        y: v.top + v.height * x.anchor.rectRatio.y
      });
    }
    return m;
  }), f = Z(() => {
    const h = [];
    for (const g of d()) {
      const m = h.find((x) => x.el === g.el || Math.hypot(x.x - g.x, x.y - g.y) < ga);
      m ? m.items.push(g.item) : h.push({
        x: g.x,
        y: g.y,
        el: g.el,
        items: [g.item]
      });
    }
    return h;
  });
  return (() => {
    var h = ca();
    return w(h, k(Ht, {
      get each() {
        return f();
      },
      children: (g) => (() => {
        var m = la(), x = m.firstChild;
        return m.$$click = () => o({
          items: g.items,
          x: g.x,
          y: g.y
        }), w(x, k(Ht, {
          get each() {
            return g.items.slice(0, we);
          },
          children: (b) => k(Rn, {
            get name() {
              return b.author_name;
            },
            get picture() {
              return b.author_picture;
            }
          })
        }), null), w(x, k(I, {
          get when() {
            return g.items.length > we;
          },
          get children() {
            var b = ua();
            return b.firstChild, w(b, () => g.items.length - we, null), b;
          }
        }), null), P((b) => {
          var v = `${g.x}px`, _ = `${g.y}px`, A = g.items.length > 1 ? t.labels.pinCluster(g.items.length, ot().describeAnchor(g.items[0].anchor)) : ot().describeAnchor(g.items[0].anchor), y = gn(t.pinColor, g.items) !== null || void 0, S = gn(t.pinColor, g.items) ?? void 0;
          return v !== b.e && B(m, "left", b.e = v), _ !== b.t && B(m, "top", b.t = _), A !== b.a && N(m, "aria-label", b.a = A), y !== b.o && N(x, "data-toned", b.o = y), S !== b.i && B(x, "border-color", b.i = S), b;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0,
          i: void 0
        }), m;
      })()
    }), null), w(h, k(I, {
      get when() {
        return r();
      },
      children: (g) => (() => {
        var m = da(), x = m.firstChild, b = x.nextSibling;
        return x.$$click = () => o(null), w(x, k(W, {
          name: "close"
        })), w(b, k(Ht, {
          get each() {
            return g().items;
          },
          children: (v) => (() => {
            var _ = ha(), A = _.firstChild, y = A.firstChild, S = A.nextSibling, $ = S.nextSibling, C = $.firstChild, M = C.nextSibling;
            return M.nextSibling, w(A, k(Rn, {
              get name() {
                return v.author_name;
              },
              get picture() {
                return v.author_picture;
              }
            }), y), w(y, () => v.author_name), w(S, () => v.body), C.$$click = () => xr(v.id, 1), w(C, k(W, {
              name: "add"
            })), w(M, () => mr(v)), w($, k(I, {
              get when() {
                return v.author_key === t.authorKey;
              },
              get children() {
                var D = fa();
                return D.$$click = () => u(v), De(D, sn), w(D, k(I, {
                  get when() {
                    return s() === v.id;
                  },
                  get fallback() {
                    return k(W, {
                      name: "delete"
                    });
                  },
                  get children() {
                    return t.labels.deleteConfirmText;
                  }
                })), P((V) => {
                  var un = s() === v.id, ln = s() === v.id ? t.labels.deleteConfirmHint : t.labels.deleteItem;
                  return un !== V.e && D.classList.toggle("confirming", V.e = un), ln !== V.t && N(D, "aria-label", V.t = ln), V;
                }, {
                  e: void 0,
                  t: void 0
                }), D;
              }
            }), null), _;
          })()
        })), P((v) => {
          var _ = c(g()), A = t.labels.close;
          return v.e = yo(m, _, v.e), A !== v.t && N(x, "aria-label", v.t = A), v;
        }, {
          e: void 0,
          t: void 0
        }), m;
      })()
    }), null), h;
  })();
}
ie(["click"]);
var ya = /* @__PURE__ */ O("<div class=feedback-overlay data-feedback-ui role=presentation><div class=feedback-overlay-hint>"), va = /* @__PURE__ */ O("<div class=feedback-pick-hover data-feedback-ui>");
function xa(t) {
  let e;
  const [n, r] = j(null);
  let o = null, s = null;
  function i(u, d) {
    const f = document.elementsFromPoint(u, d), h = Qo();
    return f.find((g) => !g.closest(h)) ?? null;
  }
  function a() {
    o = null;
    const u = s;
    if (!u) return;
    const d = i(u.x, u.y);
    r(d ? d.getBoundingClientRect() : null);
  }
  function c(u) {
    s = {
      x: u.clientX,
      y: u.clientY
    }, o === null && (o = requestAnimationFrame(a));
  }
  function l(u) {
    u.preventDefault(), u.stopPropagation();
    const d = {
      x: u.clientX,
      y: u.clientY
    }, f = i(d.x, d.y);
    if (!f) return;
    const h = ot().captureAnchor(f, d, t.route);
    t.onPick(h, d);
  }
  function p(u) {
    u.key === "Escape" && (u.preventDefault(), t.onExit());
  }
  return xt(() => {
    e?.addEventListener("pointerdown", l, {
      capture: !0
    }), e?.addEventListener("pointermove", c, {
      capture: !0
    }), window.addEventListener("keydown", p, {
      capture: !0
    });
  }), R(() => {
    e?.removeEventListener("pointerdown", l, {
      capture: !0
    }), e?.removeEventListener("pointermove", c, {
      capture: !0
    }), window.removeEventListener("keydown", p, {
      capture: !0
    }), o !== null && cancelAnimationFrame(o);
  }), (() => {
    var u = ya(), d = u.firstChild, f = e;
    return typeof f == "function" ? rr(f, u) : e = u, w(d, () => t.labels.pickHint), w(u, k(I, {
      get when() {
        return n();
      },
      children: (h) => (() => {
        var g = va();
        return P((m) => {
          var x = `${h().left}px`, b = `${h().top}px`, v = `${h().width}px`, _ = `${h().height}px`;
          return x !== m.e && B(g, "left", m.e = x), b !== m.t && B(g, "top", m.t = b), v !== m.a && B(g, "width", m.a = v), _ !== m.o && B(g, "height", m.o = _), m;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0
        }), g;
      })()
    }), null), u;
  })();
}
function wa(t) {
  const [e, n, r] = Zi(Ii), [o, s] = j(!1), i = () => ko(t.labels);
  t.onActor?.(r);
  const a = r.on("sent", () => t.onNotify(i().sent));
  R(() => a.unsubscribe());
  const c = ds();
  R(c);
  const l = {};
  R(() => Xo(l));
  const p = () => e.matches({
    mode: "picking"
  }), u = () => e.matches({
    mode: "composing"
  }), d = () => e.matches({
    mode: "submitting"
  }), f = () => e.matches({
    mode: "error"
  }), h = () => !e.matches("idle"), g = () => n({
    type: "TOGGLE"
  }), m = (A, y) => n({
    type: "PICK",
    anchor: A,
    point: y
  }), x = (A) => n({
    type: "SUBMIT",
    body: A
  }), b = () => n({
    type: "CANCEL"
  }), v = () => n({
    type: "RETRY"
  }), _ = Z(() => Ao(t.hideItem, is()));
  return rs(_, l), [k(Ji, {
    get stateAttr() {
      return on(e.value);
    },
    get active() {
      return h();
    },
    onToggle: g,
    onOpenPanel: () => s(!0),
    get panelOpen() {
      return o();
    },
    get labels() {
      return i();
    }
  }), k(I, {
    get when() {
      return h();
    },
    get children() {
      return k(ba, {
        get items() {
          return _();
        },
        get route() {
          return t.currentRoute();
        },
        get authorKey() {
          return t.authorKey;
        },
        get labels() {
          return i();
        },
        get pinColor() {
          return t.pinColor;
        }
      });
    }
  }), k(I, {
    get when() {
      return p();
    },
    get children() {
      return k(xa, {
        get route() {
          return t.currentRoute();
        },
        onPick: m,
        onExit: g,
        get labels() {
          return i();
        }
      });
    }
  }), k(I, {
    get when() {
      return go(() => !!(u() || d() || f()))() && e.context.anchor;
    },
    children: (A) => k(zn, {
      get anchor() {
        return A();
      }
    })
  }), k(I, {
    get when() {
      return u() || d() || f();
    },
    get children() {
      return k(Gi, {
        get submitting() {
          return d();
        },
        get error() {
          return f();
        },
        onSubmit: x,
        onCancel: b,
        onRetry: v,
        get labels() {
          return i();
        }
      });
    }
  }), k(I, {
    get when() {
      return hr(l);
    },
    children: (A) => k(zn, {
      get anchor() {
        return A();
      },
      class: "feedback-focus-highlight"
    })
  }), k(I, {
    get when() {
      return o();
    },
    get children() {
      return k(oa, {
        get items() {
          return _();
        },
        onClose: () => s(!1),
        get authorKey() {
          return t.authorKey;
        },
        get currentRoute() {
          return t.currentRoute;
        },
        get onNavigate() {
          return t.onNavigate;
        },
        get onNotify() {
          return t.onNotify;
        },
        get headerActions() {
          return t.panelHeaderActions;
        },
        get renderItemMeta() {
          return t.renderItemMeta;
        },
        get labels() {
          return i();
        },
        focusOwner: l
      });
    }
  })];
}
async function ka(t, e) {
  if (!e.me) return "";
  try {
    return (await e.me()).key;
  } catch {
    return "";
  }
}
const an = `
/* ---------- boundary resets ----------
 * The host page's own resets stop at the shadow boundary, so the handful the
 * widget's markup depends on are re-declared here. box-sizing is load-bearing:
 * the composer textarea (width:100% + padding), the pin popover
 * (width:min(360px,…) + padding) and every pill button assume border-box. */
/* Declare color together with background.
 *
 * This is a gap we actually hit. The panel, popovers and composer all paint
 * background: var(--bg, var(--fb-bg)) but declared no text color, and because
 * :host is display: contents the host page's color was inherited as is. When
 * the page has color-scheme: light dark and no color of its own, a browser
 * that prefers dark renders the body white: white text on a white background
 * (measured: textColor and panelBg both rgb(255,255,255)).
 *
 * The original app never showed it because its page color matched the tokens.
 * The widget is responsible for the text color on the background it paints.
 * Tokens the host defines still win, so the host's look does not change. */
:host { display: contents; color: var(--text, var(--fb-text)); }
/* Default palette. Tokens the host defines win. */
:host {
  --fb-bg: #ffffff; --fb-text: #0f0f0f; --fb-text-secondary: #606060;
  --fb-surface: #f8f8f8; --fb-surface-variant: #f2f2f2;
  --fb-inverse-surface: #0f0f0f; --fb-text-inverse: #f1f1f1;
  --fb-divider: #f2f2f2; --fb-border: #e5e5e5; --fb-link: #065fd4;
}
:host, *, *::before, *::after { box-sizing: border-box; }
/* The top-layer box everything is drawn in (see layer.ts). Undo the UA
 * popover look, cover the viewport without taking a single click, and hand
 * pointer events back to each layer explicitly below — which also survives a
 * host setting body { pointer-events: none } while its own modal is open. */
.fusen-layer {
  position: fixed; inset: 0; width: auto; height: auto; margin: 0; padding: 0;
  border: 0; background: transparent; color: inherit; overflow: visible;
  pointer-events: none;
}
/* No Popover API: a fixed box would be a stacking context trapping 35–39
 * under any positioned host element, so draw as if it were not there. */
.fusen-layer:not([popover]) { display: contents; }
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; }
a { color: var(--link, var(--fb-link)); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Icons are inlined SVG (see Icon.tsx). The class name and the "size it with
 * font-size" idiom are kept so every '.x .ms { font-size: N }' rule below still
 * sizes its icon. */
.ms {
  display: inline-block;
  width: 1em; height: 1em;
  flex: none;
  fill: currentColor;
  line-height: 1;
  -webkit-user-select: none;
  user-select: none;
}

/* ---------- borrowed base classes ---------- */
.name-avatar {
  width: 40px; height: 40px; flex: none; border-radius: var(--r-round, 40px);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--brand-gradient, linear-gradient(135deg, #00cfef, #0093d0)); color: #fff;
  font-size: 16px; font-weight: 500;
}
.name-avatar-img { object-fit: cover; background: none; }
.icon-btn {
  width: 40px; height: 40px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center;
}
.icon-btn .ms { font-size: 24px; }
.icon-btn:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
/* pill button (tonal on surface-variant) */
.ghost {
  display: inline-flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 var(--sp-md, 16px);
  border-radius: var(--r-pill, 18px);
  background: var(--surface-variant, var(--fb-surface-variant));
  color: var(--text, var(--fb-text));
  font-size: 14px; font-weight: 500;
  transition: filter 0.15s;
}
.ghost:hover { filter: brightness(0.96); }
.muted { color: var(--text-secondary, var(--fb-text-secondary)); }
.center { text-align: center; padding: 48px 0; }
.spacer { flex: 1; }
.error { color: #ff0000; margin: 0; text-align: center; font-size: 14px; }

/* ---------- feedback widget ---------- */
.feedback-badge-cluster {
  position: fixed; right: var(--sp-md, 16px);
  bottom: calc(var(--sp-md, 16px) + env(safe-area-inset-bottom));
  /* Above the overlay (35) so ✕ stays tappable while picking; below the
   * composer (37) so it never covers the bottom sheet's Post button (leaving
   * while composing goes through Cancel) */
  z-index: 36; display: flex; flex-direction: column; align-items: flex-end;
  gap: var(--sp-sm, 8px); pointer-events: auto;
}
.feedback-panel-toggle, .feedback-badge {
  width: 48px; height: 48px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; color: #fff;
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
}
.feedback-badge {
  width: 56px; height: 56px;
  background: var(--brand-gradient, linear-gradient(135deg, #00cfef, #0093d0)); color: #fff;
}
.feedback-badge.active {
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
}
.feedback-panel-toggle .ms { font-size: 22px; }
.feedback-badge .ms { font-size: 26px; }

.feedback-overlay {
  position: fixed; inset: 0; z-index: 35;
  background: rgb(0 20 30 / 0.08);
  touch-action: none; cursor: crosshair; pointer-events: auto;
  display: flex; align-items: flex-start; justify-content: center;
}
.feedback-overlay-hint {
  margin-top: calc(var(--sp-lg, 24px) + env(safe-area-inset-top));
  padding: 10px 16px; border-radius: var(--r-pill, 18px);
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 13px; font-weight: 500;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
  pointer-events: none;
}

.feedback-pick-hover {
  position: fixed; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 1.5px dashed var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.06);
}
.feedback-pick-highlight {
  position: fixed; z-index: 35; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 2px solid var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.14);
  box-shadow: 0 0 0 2px rgb(0 207 239 / 0.25);
}

/* The spot of a note tapped in the list. Above pick (35), below pins (38) */
.feedback-focus-highlight {
  position: fixed; z-index: 37; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 2px solid var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.18);
  box-shadow: 0 0 0 4px rgb(0 207 239 / 0.2);
  animation: fusen-focus-pulse 0.9s ease-in-out 2;
}
@keyframes fusen-focus-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgb(0 207 239 / 0.2); }
  50% { box-shadow: 0 0 0 10px rgb(0 207 239 / 0.05); }
}

.feedback-pins { position: fixed; inset: 0; z-index: 38; pointer-events: none; }
.feedback-pin {
  position: fixed; transform: translate(-50%, -100%);
  border-radius: var(--r-round, 40px); pointer-events: auto;
  box-shadow: 0 4px 10px rgb(0 0 0 / 0.3);
}
.feedback-pin-stack { display: flex; align-items: center; }
.feedback-pin-stack > * + * { margin-left: -10px; }
.feedback-pin-stack .name-avatar {
  width: 28px; height: 28px; font-size: 12px;
  border: 2px solid var(--bg, var(--fb-bg));
}
/* A host colour (pinColor) is set inline as the stack's border-color — the
 * stack draws no border of its own — and replaces the ring the avatars already
 * draw against the page. Nothing else about the pin moves. */
.feedback-pin-stack[data-toned] > * { border-color: inherit; }
.feedback-pin-more {
  width: 28px; height: 28px; flex: none; border-radius: var(--r-round, 40px);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 11px; font-weight: 600;
  border: 2px solid var(--bg, var(--fb-bg));
}
/* position (left/top/bottom/transform) is computed inline in Pins.tsx,
 * anchored to the tapped pin cluster's viewport coords — see popoverStyle. */
.feedback-pin-popover {
  position: fixed; z-index: 38; pointer-events: auto;
  width: min(360px, calc(100vw - 2 * var(--sp-md, 16px)));
  background: var(--bg, var(--fb-bg)); border: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-md, 12px);
  padding: var(--sp-md, 16px); box-shadow: 0 12px 30px rgb(0 0 0 / 0.25);
}
/* Square icon-only button: no shorthand \`.ghost\` reuse here — ghost's
 * horizontal pill padding survived past the width/height
 * override and collapsed the content box to 0, which made the grid
 * centering fall back to start-alignment (icon rendered ~7px off-center).
 * Self-contained rule instead. */
.feedback-pin-popover-close {
  position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
  padding: 0; border-radius: var(--r-round, 40px);
  display: grid; place-items: center;
}
.feedback-pin-popover-close:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
.feedback-pin-popover-close .ms { font-size: 16px; }
.feedback-pin-popover-list {
  display: flex; flex-direction: column; gap: var(--sp-sm, 8px);
  max-height: min(40vh, 360px); overflow-y: auto;
}
.feedback-item-author { display: flex; align-items: center; gap: var(--sp-sm, 8px); }
.feedback-item-author .name-avatar { width: 28px; height: 28px; font-size: 12px; }
.feedback-item-author-name { font-size: 13px; font-weight: 500; }

.feedback-composer {
  position: fixed; inset: auto 0 0 0; z-index: 37; pointer-events: auto;
  background: var(--bg, var(--fb-bg)); border-top: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-md, 12px) var(--r-md, 12px) 0 0;
  padding: var(--sp-md, 16px) var(--sp-md, 16px) calc(var(--sp-md, 16px) + env(safe-area-inset-bottom));
  box-shadow: 0 -8px 24px rgb(0 0 0 / 0.2);
}
.feedback-composer-form { display: flex; flex-direction: column; gap: var(--sp-sm, 8px); }
.feedback-composer-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-sm, 8px);
  background: var(--surface, var(--fb-surface)); color: var(--text, var(--fb-text));
  font-size: 15px; font-family: inherit;
  resize: none;
}
.feedback-composer-textarea:focus { outline: none; border-color: var(--aqua-deep, #0093d0); }
.feedback-composer-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-sm, 8px);
}
.feedback-composer-count { font-size: 12px; }
.feedback-composer-buttons { display: flex; gap: var(--sp-sm, 8px); }
.feedback-composer-cancel {
  height: 36px; padding: 0 var(--sp-md, 16px); border-radius: var(--r-pill, 18px);
  font-size: 14px; font-weight: 500;
}
.feedback-composer-submit {
  display: inline-flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 var(--sp-md, 16px); border-radius: var(--r-pill, 18px);
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 14px; font-weight: 500;
}
.feedback-composer-submit:disabled { opacity: 0.4; cursor: default; }
.feedback-composer-submit .ms { font-size: 18px; }
.feedback-composer-retry { font-weight: 500; }

.feedback-panel {
  /* The full-screen panel explicitly covers the whole feedback UI
   * (badge 36 / composer 37 / pins 38). Only the host's toast (40) sits above */
  position: fixed; inset: 0; z-index: 39; pointer-events: auto;
  background: var(--bg, var(--fb-bg)); display: flex; flex-direction: column;
  padding-top: env(safe-area-inset-top);
}
.feedback-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-md, 16px); border-bottom: 1px solid var(--divider, var(--fb-divider)); flex: none;
}
.feedback-panel-head h2 { font-size: 16px; font-weight: 500; margin: 0; }
.feedback-panel-list { flex: 1; overflow-y: auto; padding: var(--sp-md, 16px); }

/* Tablet and up get a drawer docked on the right instead of a full screen.
 * The page behind stays visible, so tapping a list row highlights its spot
 * right next to it. The width is DOCKED_BREAKPOINT_PX from breakpoints.ts —
 * generated from the same constant as Panel.tsx's matchMedia, so they cannot
 * drift apart. */
@media (min-width: ${Ur}px) {
  .feedback-panel {
    --fb-drawer-w: min(380px, 90vw);
    inset: 0 0 0 auto; width: var(--fb-drawer-w);
    border-left: 1px solid var(--divider, var(--fb-divider));
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.18);
  }
  .feedback-badge-cluster {
    transition: right 0.2s ease;
  }
  .feedback-badge-cluster[data-panel-open] {
    right: calc(min(380px, 90vw) + var(--sp-md, 16px));
  }
}

.feedback-item {
  padding: var(--sp-sm, 8px) 0; border-bottom: 1px solid var(--divider, var(--fb-divider));
  display: flex; flex-direction: column; gap: 4px;
}
.feedback-item-route {
  font-size: 12px; color: var(--link, var(--fb-link)); text-align: left; align-self: flex-start;
}
.feedback-item-text {
  font-size: 14px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
}
/* The whole body is a "jump to that spot" button */
.feedback-item-focus {
  width: 100%; text-align: left; color: inherit; background: none;
  padding: 2px 4px; margin: 0 -4px; border-radius: var(--r-sm, 8px);
}
.feedback-item-focus:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
/* Host slot content (renderItemMeta) renders INSIDE this shadow root, so the
 * rules for the "done" status badge and its PR number have to live here too —
 * the host's global sheet cannot reach them. */
.feedback-item-status {
  display: inline-flex; align-items: center; gap: 4px; align-self: flex-start;
  height: 20px; padding: 0 8px; border-radius: var(--r-pill, 18px);
  font-size: 12px; font-weight: 500; white-space: nowrap;
  background: rgb(0 150 90 / 0.12); color: #1a7f4e;
}
.feedback-item-status .ms { font-size: 14px; }
.feedback-item-pr { font-variant-numeric: tabular-nums; opacity: 0.85; }
.feedback-item-row { display: flex; align-items: center; gap: var(--sp-sm, 8px); font-size: 12px; }
.feedback-item-vote {
  width: 28px; height: 28px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; background: var(--surface-variant, var(--fb-surface-variant)); flex: none;
}
.feedback-item-vote .ms { font-size: 16px; }
.feedback-item-votes { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
/* Withdraw button, shown only on your own notes. The two-step confirm that
 * guards against mis-taps is .confirming — the icon turns into a "Withdraw?"
 * label, and that change of shape says "there is one more step"
 * (no window.confirm). */
.feedback-item-delete {
  width: 28px; height: 28px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; background: var(--surface-variant, var(--fb-surface-variant)); flex: none;
  color: var(--text-secondary, var(--fb-text-secondary));
  transition: background-color 0.15s ease, color 0.15s ease, width 0.15s ease, padding 0.15s ease;
}
.feedback-item-delete:hover { color: #ff0000; }
.feedback-item-delete .ms { font-size: 16px; }
.feedback-item-delete.confirming {
  width: auto; padding: 0 10px; border-radius: var(--r-pill, 18px);
  background: rgb(255 0 0 / 0.12); color: #ff0000;
  font-size: 12px; font-weight: 500; white-space: nowrap;
}

/* Host slot on the right of the panel header (panelHeaderActions), before the close button. */
.feedback-panel-head-actions { display: flex; align-items: center; gap: var(--sp-xs, 4px); }
.feedback-panel-triage-link {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: var(--r-pill, 18px);
  background: var(--surface-variant, var(--fb-surface-variant)); color: var(--text, var(--fb-text));
  font-size: 13px; font-weight: 500; white-space: nowrap;
  transition: filter 0.15s;
}
.feedback-panel-triage-link:hover { filter: brightness(0.96); }
.feedback-panel-triage-link .ms { font-size: 18px; }

/* ---------- dark mode ----------
 * The host's tokens, when defined, still win; this swaps only the defaults
 * underneath them, plus the few places that hard-code a colour or a filter
 * direction. */
@media (prefers-color-scheme: dark) {
  :host {
    --fb-bg: #0f0f0f; --fb-text: #f1f1f1; --fb-text-secondary: #aaaaaa;
    --fb-surface: #212121; --fb-surface-variant: #272727;
    --fb-inverse-surface: #f1f1f1; --fb-text-inverse: #0f0f0f;
    --fb-divider: #3f3f3f; --fb-border: #3f3f3f; --fb-link: #3ea6ff;
  }
  .ghost:hover { filter: brightness(1.2); }
  .feedback-panel-triage-link:hover { filter: brightness(1.2); }
  /* Low-alpha fill is shared; only the text goes lighter (keeps the muted tone) */
  .feedback-item-status { color: #7ee2a8; }
}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .feedback-focus-highlight { animation: none; }
  .feedback-item-delete { transition: none; }
  .feedback-badge-cluster { transition: none; }
  .feedback-panel-triage-link { transition: none; }
}
`, Sa = "feedback", _a = "data-machine", Qr = "data-state";
function Aa(t, e = an) {
  const n = new CSSStyleSheet();
  n.replaceSync(e), t.adoptedStyleSheets = [...t.adoptedStyleSheets, n];
}
function $a(t) {
  t.setAttribute(Fe, ""), t.setAttribute(_a, Sa), t.setAttribute(Qr, "idle");
}
function Ea(t, e) {
  const n = (o) => {
    const s = on(o);
    s !== "" && t.setAttribute(Qr, s);
  };
  n(e.getSnapshot().value);
  const r = e.subscribe((o) => n(o.value));
  return () => r.unsubscribe();
}
const Ca = "#f1f1f1", Ta = "#0f0f0f";
function Oa(t) {
  const e = t.trim(), n = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(e);
  if (n) {
    const s = n[1], i = s.length === 3 ? [...s].map((a) => a + a).join("") : s;
    return [0, 2, 4].map((a) => Number.parseInt(i.slice(a, a + 2), 16));
  }
  const r = /^rgba?\(([^)]*)\)$/i.exec(e);
  if (!r) return null;
  const o = r[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return o.length < 3 || o.slice(0, 3).some((s) => !Number.isFinite(s)) ? null : [o[0], o[1], o[2]];
}
function Ia([t, e, n]) {
  const r = (o) => {
    const s = o / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * r(t) + 0.7152 * r(e) + 0.0722 * r(n);
}
function Na(t, e) {
  if (e("--text").trim()) return;
  const n = Oa(e("--bg"));
  n && t.style.setProperty("--text", Ia(n) < 0.5 ? Ca : Ta);
}
let Dt;
const ja = [
  ...new Set([...an.matchAll(/var\((--[\w-]+)/g)].map((t) => t[1]))
].filter((t) => !t.startsWith("--fb-"));
function Ma(t, e) {
  const n = document.createElement("fusen-layer");
  n.setAttribute(Fe, ""), n.style.display = "contents";
  const r = n.attachShadow({ mode: "open" });
  Dt || (Dt = new CSSStyleSheet(), Dt.replaceSync(an)), r.adoptedStyleSheets = [Dt];
  const o = document.createElement("div");
  o.className = "fusen-layer", r.append(o), e.append(n);
  const s = typeof HTMLElement.prototype.showPopover == "function";
  s && (o.popover = "manual");
  const i = () => {
    if (!s || !n.isConnected) return;
    const y = r.activeElement;
    o.matches(":popover-open") && o.hidePopover(), o.showPopover(), y?.focus({ preventScroll: !0 });
  }, a = (y) => y.isConnected && (y.matches("dialog:modal") || y.localName !== "dialog" && y.getAttribute("aria-modal") === "true" && (y.checkVisibility?.() ?? y.getClientRects().length > 0)), c = /* @__PURE__ */ new Set();
  let l = [];
  const p = () => {
    for (const S of c) S.isConnected || c.delete(S);
    const y = [
      ...document.querySelectorAll('dialog:modal, [aria-modal="true"]'),
      ...c
    ].filter(a);
    l = l.filter((S) => y.includes(S));
    for (const S of y) l.includes(S) || l.push(S);
    return l[l.length - 1] ?? null;
  }, u = [], d = (y) => {
    for (const $ of u.splice(0)) n.style.removeProperty($);
    if (!y) return;
    const S = getComputedStyle(t);
    for (const $ of ja) {
      const C = S.getPropertyValue($);
      !C || n.style.getPropertyValue($) || (n.style.setProperty($, C), u.push($));
    }
  }, f = (y) => y.type === "childList" || y.attributeName === "open" && !(y.target instanceof HTMLDialogElement), h = new MutationObserver((y) => {
    const S = n.parentNode, $ = l[l.length - 1], C = S instanceof HTMLDialogElement && S.matches(":modal");
    y.every(
      (M) => M.type === "attributes" && M.target === $ && !g.includes(M.attributeName) || C && f(M)
    ) && (!$ || a($)) || b();
  }), g = ["open", "aria-modal", "inert", "hidden"], m = (y) => {
    h.disconnect();
    const S = y !== null;
    if (h.observe(document.documentElement, {
      subtree: !0,
      childList: S,
      attributes: !0,
      attributeFilter: g
    }), !y) {
      document.body && h.observe(document.body, { childList: !0 });
      return;
    }
    h.observe(y, { attributes: !0 }), y.shadowRoot && h.observe(y.shadowRoot, { childList: !0 });
    for (let $ = y.getRootNode(); $ instanceof ShadowRoot; $ = $.host.getRootNode())
      h.observe($, {
        subtree: !0,
        childList: !0,
        attributes: !0,
        attributeFilter: g
      });
  }, x = (y) => {
    const S = y.composedPath();
    if (!S.includes(n)) {
      for (const $ of S.toReversed())
        $ instanceof Element && $.getRootNode() instanceof ShadowRoot && a($) && c.add($);
      b();
    }
  }, b = () => {
    const y = s ? p() : null, S = y && !(n.parentNode === e && o.checkVisibility?.() === !1) ? y.shadowRoot ?? y : e;
    if (n.parentNode === S) return;
    const $ = r.activeElement;
    d(S !== e), S.append(n), m(S === e ? null : y), i(), $?.focus({ preventScroll: !0 });
  }, v = (y) => {
    !y.target.popover || y.newState !== "open" || r.activeElement || i();
  };
  document.addEventListener("toggle", v, !0), s && document.addEventListener("focusin", x, !0), n.addEventListener("keydown", (y) => {
    y.key === "Escape" && n.parentNode !== e && y.preventDefault();
  });
  const _ = (y) => {
    if (y.key !== "Escape" || n.parentNode === e) return;
    const S = y.composedPath();
    if (!S.includes(n)) return;
    const $ = S[0];
    ($ instanceof HTMLTextAreaElement || $ instanceof HTMLInputElement) && (y.preventDefault(), y.stopPropagation());
  };
  window.addEventListener("keydown", _, !0);
  const A = () => {
    i(), b();
  };
  return m(null), A(), {
    /** Render target. */
    root: o,
    /** The element that moves; `pairSurfaceTokens` writes onto it. */
    host: n,
    /** After `<fusen-widget>` itself was moved: removal hid the popover. */
    refresh: A,
    dispose() {
      h.disconnect(), document.removeEventListener("toggle", v, !0), document.removeEventListener("focusin", x, !0), window.removeEventListener("keydown", _, !0), c.clear(), n.remove();
    }
  };
}
const La = {
  authorKey: "",
  route: "",
  labels: void 0,
  headerActions: void 0,
  renderItemMeta: void 0,
  pinColor: void 0,
  hideItem: void 0
}, Yr = [
  "authorKey",
  "route",
  "labels",
  "headerActions",
  "renderItemMeta",
  "pinColor",
  "hideItem"
], Dn = {
  "author-key": "authorKey",
  route: "route"
};
function nt(t) {
  const [e, n] = j(t);
  return [e, (r) => n(() => r)];
}
function Pa(t, e = Yr) {
  const n = {}, r = t;
  for (const o of e) {
    if (!Object.hasOwn(r, o)) continue;
    const s = r[o];
    delete r[o], s !== void 0 && (n[o] = s);
  }
  return n;
}
function za(t = {}) {
  const e = { ...La, ...t };
  return {
    authorKey: nt(e.authorKey),
    route: nt(e.route),
    labels: nt(e.labels),
    headerActions: nt(e.headerActions),
    renderItemMeta: nt(e.renderItemMeta),
    pinColor: nt(e.pinColor),
    hideItem: nt(e.hideItem)
  };
}
function Ra(t, e) {
  for (const n of Yr) {
    const [r, o] = e[n];
    Object.defineProperty(t, n, {
      get: () => r(),
      set: (s) => o(s),
      enumerable: !0,
      configurable: !0
    });
  }
}
const Da = "fusen-widget", Ba = "feedback-navigate", Ha = "feedback-notify";
function Fa() {
  return class extends HTMLElement {
    static observedAttributes = Object.keys(Dn);
    #e;
    #t = null;
    #n = () => {
    };
    /** Adopting the sheet is once per ELEMENT, not once per connect: one appended
     *  duplicate per reconnect cycle is a leak. */
    #r = !1;
    /**
     * Keys that arrived as a pre-upgrade PROPERTY, still awaiting their initial
     * `attributeChangedCallback`. See that method for why they have to be held.
     */
    #o;
    constructor() {
      super();
      const t = Pa(this);
      this.#o = new Set(Object.keys(t)), this.#e = za(t), Ra(this, this.#e);
    }
    /** The open shadow root. Named `renderRoot` because `host.ts` speaks that
     *  shape. */
    get renderRoot() {
      return this.shadowRoot ?? this.attachShadow({
        mode: "open"
      });
    }
    #s(t, e) {
      this.dispatchEvent(new CustomEvent(t, {
        detail: e,
        bubbles: !0,
        composed: !0
      }));
    }
    connectedCallback() {
      if (this.#t) return this.#n();
      $a(this);
      const t = this.renderRoot;
      this.#r || (Aa(t, ":host { display: contents; }"), this.#r = !0);
      const e = Ma(this, t);
      Na(e.host, (o) => getComputedStyle(this).getPropertyValue(o));
      const n = this.#e;
      n.authorKey[0]() || ka("", it().http).then((o) => {
        o && !n.authorKey[0]() && n.authorKey[1](o);
      }), this.#t = bo(() => {
        const o = this;
        return k(wa, {
          get authorKey() {
            return n.authorKey[0]();
          },
          get currentRoute() {
            return n.route[0];
          },
          onNavigate: (s) => o.#s(Ba, {
            route: s
          }),
          onNotify: (s) => o.#s(Ha, {
            message: s
          }),
          get labels() {
            return n.labels[0]();
          },
          get panelHeaderActions() {
            return n.headerActions[0]();
          },
          get renderItemMeta() {
            return n.renderItemMeta[0]();
          },
          get pinColor() {
            return n.pinColor[0]();
          },
          get hideItem() {
            return n.hideItem[0]();
          },
          onActor: (s) => R(Ea(o, s))
        });
      }, e.root);
      const r = this.#t;
      this.#t = () => {
        r(), e.dispose();
      }, this.#n = e.refresh;
    }
    /**
     * Tear the Solid root down, which disposes every `onCleanup` inside the widget:
     * the realtime subscription, the machine actor, the pick overlay's window
     * listeners and the state reflection. Nothing of ours outlives the element.
     *
     * The microtask wait is what makes a MOVE (remove + re-append, which every
     * framework does when it reorders children) not destroy the widget's state.
     * Only a real detach gets past the `isConnected` check.
     */
    async disconnectedCallback() {
      await Promise.resolve(), !this.isConnected && (this.#t?.(), this.#t = null);
    }
    /**
     * PROPERTY WINS OVER AN INITIAL ATTRIBUTE, which is the standard
     * custom-element precedence and needs enforcing here because of upgrade order:
     * the constructor runs first, then one `attributeChangedCallback` per attribute
     * already in the markup, and only then `connectedCallback`. So for
     * `<fusen-widget route="/a">` where the host also assigned
     * `el.route = "/b"` before the definition loaded, the rescued `/b` would be
     * overwritten by the markup's stale `/a` — the more specific value losing to
     * the less specific one. The first attribute notification for a rescued key is
     * therefore dropped; every later one applies normally.
     */
    attributeChangedCallback(t, e, n) {
      const r = Dn[t];
      r !== void 0 && (this.#o.delete(r) || this.#e[r][1](n ?? ""));
    }
  };
}
function Ka(t = Da) {
  return customElements.get(t) || customElements.define(t, Fa()), t;
}
const qa = 1;
function Za(t) {
  return {
    version: qa,
    dump: () => t.dump(),
    async count() {
      return (await t.dump()).length;
    },
    async routes() {
      const e = /* @__PURE__ */ new Map();
      for (const n of await t.dump()) {
        const r = String(n.route), o = e.get(r) ?? { count: 0, votes: 0 };
        o.count += 1, o.votes += Number(n.votes), e.set(r, o);
      }
      return [...e.entries()].map(([n, r]) => ({ route: n, ...r })).sort((n, r) => r.count - n.count);
    },
    clear: () => t.clear(),
    identity: () => t.identity()
  };
}
function Wa(t) {
  const e = Za(t);
  return globalThis.__fusen = e, e;
}
function Mc(t = {}) {
  const e = new Map(Object.entries(t));
  return {
    async get(n) {
      return e.get(n);
    },
    async set(n, r) {
      e.set(n, r);
    },
    async delete(n) {
      e.delete(n);
    },
    async update(n, r) {
      const o = r(e.get(n));
      return e.set(n, o), o;
    }
  };
}
const Va = "fusen", Ua = "kv";
function Ja(t) {
  return new Promise((e, n) => {
    t.onsuccess = () => e(t.result), t.onerror = () => n(t.error);
  });
}
function Qa(t = Va, e = Ua) {
  let n = null;
  function r() {
    return n || (n = new Promise((s, i) => {
      const a = indexedDB.open(t, 1);
      a.onupgradeneeded = () => {
        a.result.objectStoreNames.contains(e) || a.result.createObjectStore(e);
      }, a.onsuccess = () => s(a.result), a.onerror = () => i(a.error);
    }), n);
  }
  async function o(s, i) {
    const c = (await r()).transaction(e, s), l = await Ja(i(c.objectStore(e)));
    return await new Promise((p, u) => {
      c.oncomplete = () => p(), c.onerror = () => u(c.error), c.onabort = () => u(c.error);
    }), l;
  }
  return {
    get(s) {
      return o("readonly", (i) => i.get(s));
    },
    async set(s, i) {
      await o("readwrite", (a) => a.put(i, s));
    },
    async delete(s) {
      await o("readwrite", (i) => i.delete(s));
    },
    async update(s, i) {
      const c = (await r()).transaction(e, "readwrite"), l = c.objectStore(e);
      let p, u;
      const d = new Promise((h, g) => {
        c.oncomplete = () => h(), c.onerror = () => g(c.error), c.onabort = () => g(c.error);
      }), f = l.get(s);
      f.onsuccess = () => {
        try {
          p = i(f.result), l.put(p, s);
        } catch (h) {
          u = h, c.abort();
        }
      };
      try {
        await d;
      } catch (h) {
        throw u ?? h;
      }
      return p;
    }
  };
}
const $t = "items", Bn = "nextId", Hn = "identity";
async function Fn(t, e) {
  if (e) return e;
  const n = await t.get(Hn);
  if (n) return n;
  const r = { name: "You", key: `local-${Ya()}` };
  return await t.set(Hn, r), r;
}
function Ya() {
  const t = globalThis.crypto;
  if (typeof t?.getRandomValues == "function") {
    const e = t.getRandomValues(new Uint8Array(8));
    return Array.from(e, (n) => n.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
function Ga(t) {
  const e = t.kv, n = t.onChange ?? (() => {
  });
  async function r() {
    return await e.get($t) ?? [];
  }
  async function o() {
    return await e.update(Bn, (i) => (i ?? 1) + 1) - 1;
  }
  function s(i) {
    return [...i].sort((a, c) => Number(c.id) - Number(a.id));
  }
  return {
    async list() {
      return { feedback: s(await r()) };
    },
    async create(i, a, c, l, p) {
      const u = await Fn(e, t.identity), d = {
        id: await o(),
        route: i,
        body: a,
        anchor: c,
        context: l,
        author_name: u.name,
        author_picture: null,
        author_key: u.key,
        votes: 0,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      return await e.update($t, (f) => [...f ?? [], d]), n(d), { feedback: d };
    },
    async vote(i, a, c) {
      let l;
      if (await e.update($t, (p) => {
        const u = p ?? [];
        if (l = u.find((d) => Number(d.id) === i), !l) throw new Error(`no such comment: ${i}`);
        return l.votes = Number(l.votes) + a, u;
      }), !l) throw new Error(`no such comment: ${i}`);
      return n(l), { id: i, votes: l.votes };
    },
    async remove(i, a) {
      return await e.update($t, (c) => {
        const l = c ?? [];
        if (!l.some((p) => Number(p.id) === i))
          throw new Error(`no such comment: ${i}`);
        return l.filter((p) => Number(p.id) !== i);
      }), n({ deletedId: i }), { id: i };
    },
    async dump() {
      return s(await r());
    },
    async clear() {
      await e.delete($t), await e.delete(Bn);
    },
    identity() {
      return Fn(e, t.identity);
    }
  };
}
const Gr = "fusen";
function Xa(t) {
  const e = `local-${Date.now().toString(36)}`, n = t.deletedId;
  return typeof n == "number" ? { type: "deleted", id: n, nonce: e } : { type: "created", feedback: t, nonce: e };
}
function tc(t = Gr) {
  const e = typeof BroadcastChannel == "function" ? new BroadcastChannel(t) : null, n = /* @__PURE__ */ new Set();
  return e && (e.onmessage = (r) => {
    const o = r.data;
    if (!(!o || typeof o.type != "string"))
      for (const s of n) s(o);
  }), {
    transport: {
      subscribe(r, o) {
        return n.add(r), o("live"), () => {
          n.delete(r);
        };
      }
    },
    publish(r) {
      e?.postMessage(Xa(r));
    },
    close() {
      n.clear(), e?.close();
    }
  };
}
const ec = ["state"], Kn = 0.5;
function fe(t) {
  return (t.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}
function he(t) {
  return Array.from(t.children);
}
function nc(t, e) {
  for (const n of Array.from(t.attributes))
    if (n.name === e) return n.value;
}
const rc = 200;
function Xr(t, e) {
  return t.name.startsWith("data-") && !e.has(t.name.slice(5)) && t.value.length <= rc;
}
function to(t, e) {
  const n = {};
  for (const r of Array.from(t.attributes))
    Xr(r, e) && (n[r.name.slice(5)] = r.value);
  return n;
}
function oc(t, e) {
  for (const n of Array.from(t.attributes))
    if (Xr(n, e)) return !0;
  return !1;
}
function sc(t) {
  const e = t.parentElement;
  return e ? he(e).filter((r) => r.tagName === t.tagName).indexOf(t) + 1 : 1;
}
function cn(t) {
  const e = [t];
  for (const n of he(t)) e.push(...cn(n));
  return e;
}
function eo(t) {
  return (t ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}
function qn(t) {
  return Math.min(1, Math.max(0, t));
}
function ic(t) {
  return t.replace(/[\\"]/g, (e) => `\\${e}`);
}
function ac(t) {
  return t.replace(/\\(.)/g, "$1");
}
function cc(t) {
  return t.replace(/[^a-zA-Z0-9_\-\u00a0-\uffff]/g, (e) => `\\${e}`);
}
function uc(t, e) {
  return {
    tag: t.tagName.toLowerCase(),
    id: t.id || void 0,
    dataAttrs: to(t, e),
    classList: fe(t),
    textSnippet: eo(t.textContent)
  };
}
function lc(t, e) {
  const n = t.tagName.toLowerCase();
  if (t.id) return `#${t.id}`;
  const r = to(t, e), o = Object.keys(r).sort();
  if (o.length > 0) {
    const l = o[0];
    return `${n}[data-${l}="${ic(r[l])}"]`;
  }
  const i = fe(t).map((l) => `.${cc(l)}`).join("");
  let a = "";
  const c = t.parentElement;
  if (c) {
    const l = he(c).filter((p) => p.tagName === t.tagName);
    l.length > 1 && (a = `:nth-of-type(${l.indexOf(t) + 1})`);
  }
  return `${n}${i}${a}`;
}
function dc(t, e) {
  const n = [];
  let r = t;
  for (; r && (n.unshift(lc(r, e)), !(r.id || oc(r, e))); )
    r = r.parentElement;
  return n.join(" > ");
}
function fc(t) {
  if (t.startsWith("#")) return { kind: "id", id: t.slice(1) };
  const e = /^([a-zA-Z][a-zA-Z0-9-]*)\[data-([a-zA-Z0-9-]+)="((?:[^"\\]|\\.)*)"\]$/.exec(
    t
  );
  if (e)
    return {
      kind: "data",
      tag: e[1],
      key: e[2],
      value: ac(e[3])
    };
  const n = pc(t);
  return n || { kind: "class", tag: t, classes: [] };
}
const hc = /^:nth-of-type\((\d+)\)$/;
function pc(t) {
  const e = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(t);
  if (!e) return null;
  const n = e[0], r = [];
  let o, s = null, i = n.length;
  const a = () => s === null ? !0 : s === "" ? !1 : (r.push(s), s = null, !0);
  for (; i < t.length; ) {
    const c = t[i];
    if (c === "\\" && i + 1 < t.length) {
      if (s === null) return null;
      s += t[i + 1], i += 2;
      continue;
    }
    if (c === ".") {
      if (!a()) return null;
      s = "", i += 1;
      continue;
    }
    if (c === ":") {
      const l = hc.exec(t.slice(i));
      if (l) {
        o = Number(l[1]);
        break;
      }
      if (s === null) return null;
      s += c, i += 1;
      continue;
    }
    if (s === null) return null;
    s += c, i += 1;
  }
  return a() ? { kind: "class", tag: n, classes: r, nth: o } : null;
}
function Zn(t, e) {
  if (e.kind === "id") return t.id === e.id;
  if (t.tagName.toLowerCase() !== e.tag) return !1;
  if (e.kind === "data") return nc(t, `data-${e.key}`) === e.value;
  const r = fe(t);
  return !(!e.classes.every((o) => r.includes(o)) || e.nth !== void 0 && sc(t) !== e.nth);
}
function gc(t, e) {
  const n = e.split(" > ").filter(Boolean).map(fc);
  if (n.length === 0) return null;
  let r = cn(t).filter((o) => Zn(o, n[0]));
  for (let o = 1; o < n.length && r.length > 0; o++) {
    const s = n[o], i = [];
    for (const a of r)
      for (const c of he(a))
        Zn(c, s) && i.push(c);
    r = i;
  }
  return r[0] ?? null;
}
function mc(t, e, n) {
  if (t.tagName.toLowerCase() !== e.tag) return 0;
  let r = 0, o = 0;
  const s = (u, d) => {
    r += u, o += u * d;
  };
  e.id && s(0.3, t.id === e.id ? 1 : 0);
  const i = Object.keys(e.dataAttrs);
  if (i.length > 0) {
    const u = /* @__PURE__ */ new Map();
    for (const f of Array.from(t.attributes)) {
      if (!f.name.startsWith("data-")) continue;
      const h = f.name.slice(5);
      !n.has(h) && !u.has(h) && u.set(h, f.value);
    }
    const d = i.filter((f) => u.get(f) === e.dataAttrs[f]).length;
    s(0.3, d / i.length);
  }
  const a = new Set(fe(t)), c = new Set(e.classList), l = /* @__PURE__ */ new Set([...a, ...c]), p = l.size === 0 ? 1 : [...c].filter((u) => a.has(u)).length / l.size;
  if (s(0.15, p), e.textSnippet) {
    const u = eo(t.textContent), d = u === e.textSnippet ? 1 : u !== "" && (u.includes(e.textSnippet) || e.textSnippet.includes(u)) ? 0.5 : 0;
    s(0.25, d);
  }
  return r > 0 ? o / r : 0;
}
function no(t) {
  const e = t.fingerprint;
  if (e.textSnippet) return e.textSnippet;
  const n = Object.keys(e.dataAttrs).sort()[0];
  return n ? `${e.tag}[data-${n}="${e.dataAttrs[n]}"]` : e.tag;
}
function bc(t = {}) {
  const e = new Set(
    t.volatileDataKeys ?? ec
  );
  function n(s, i, a) {
    const c = s.getBoundingClientRect(), l = {
      x: c.width > 0 ? qn((i.x - c.left) / c.width) : 0.5,
      y: c.height > 0 ? qn((i.y - c.top) / c.height) : 0.5
    };
    return {
      version: 1,
      route: a,
      selectorPath: dc(s, e),
      fingerprint: uc(s, e),
      rectRatio: l
    };
  }
  function r(s, i) {
    return mc(s, i, e);
  }
  function o(s, i = document.documentElement) {
    const a = gc(i, s.selectorPath);
    if (a && r(a, s.fingerprint) >= Kn) return a;
    let c = null, l = 0;
    for (const p of cn(i)) {
      if (p.tagName.toLowerCase() !== s.fingerprint.tag) continue;
      const u = r(p, s.fingerprint);
      u > l && (l = u, c = p);
    }
    return l >= Kn ? c : null;
  }
  return { captureAnchor: n, scoreCandidate: r, resolveAnchor: o, describeAnchor: no };
}
bc();
function ro(t) {
  return typeof t.source_url == "string" ? t.source_url : void 0;
}
function Y(t) {
  return typeof t == "string" ? t : t == null ? "" : String(t);
}
function oo(t) {
  const e = Number(t);
  return Number.isFinite(e) ? e : 0;
}
function so(t) {
  const e = ro(t);
  return {
    id: Number(t.id),
    route: Y(t.route),
    body: Y(t.body),
    location: no(t.anchor),
    author: Y(t.author_name),
    votes: oo(t.votes),
    created_at: Y(t.created_at),
    ...e ? { source: e } : {}
  };
}
function yc(t) {
  const e = Date.parse(Y(t.created_at));
  return Number.isNaN(e) ? -1 / 0 : e;
}
function vc(t) {
  return t.map((e, n) => ({ item: e, index: n, time: yc(e) })).sort((e, n) => e.time === n.time ? e.index - n.index : e.time < n.time ? 1 : -1).map(({ item: e }) => e);
}
const xc = 50, Wn = 500;
function wc(t) {
  if (t === void 0) return xc;
  if (!Number.isInteger(t) || t < 1 || t > Wn)
    throw new RangeError(`limit must be an integer from 1 to ${Wn}, got ${t}`);
  return t;
}
async function kc(t, e = {}) {
  const n = wc(e.limit), r = await t.list(), o = e.query?.toLowerCase(), s = vc(r).filter((i) => !(e.route !== void 0 && Y(i.route) !== e.route || o && !Y(i.body).toLowerCase().includes(o)));
  return {
    // Report the truncation rather than silently returning a slice: a model that
    // cannot see it was cut off will happily conclude it read everything.
    total: s.length,
    returned: Math.min(s.length, n),
    feedback: s.slice(0, n).map(so)
  };
}
async function Sc(t, e, n) {
  const r = (s) => ({
    ...so(s),
    anchor: s.anchor,
    context: s.context
  }), o = (await t.list()).filter((s) => Number(s.id) === e).filter((s) => n === void 0);
  return o.length === 0 ? null : o.length === 1 ? r(o[0]) : { ambiguous: o.map(r) };
}
async function _c(t) {
  const e = /* @__PURE__ */ new Map();
  for (const n of await t.list()) {
    const r = Y(n.route), o = ro(n), s = `${o ?? ""} ${r}`, i = e.get(s) ?? { route: r, ...o ? { source: o } : {}, count: 0, votes: 0 };
    i.count += 1, i.votes += oo(n.votes), e.set(s, i);
  }
  return { routes: [...e.values()].sort((n, r) => r.count - n.count) };
}
const Lc = [
  "fusen_list_feedback",
  "fusen_get_feedback",
  "fusen_summarize_routes"
];
function Ac(t = globalThis) {
  return t.document?.modelContext ?? t.navigator?.modelContext;
}
function $c(t) {
  return { list: () => t.dump() };
}
function Vn(t) {
  return { content: [{ type: "text", text: JSON.stringify(t, null, 2) }] };
}
async function Se(t) {
  try {
    return Vn(await t());
  } catch (e) {
    return Vn({ error: e instanceof Error ? e.message : String(e) });
  }
}
const _e = { readOnlyHint: !0, untrustedContentHint: !0 };
function Ec(t) {
  return [
    {
      name: "fusen_list_feedback",
      title: "List fusen comments",
      description: "Comments pinned to elements on this page, newest first. Reports `total` next to `returned`.",
      inputSchema: {
        type: "object",
        properties: {
          route: {
            type: "string",
            description: "Only comments posted from this route, e.g. '/watch/1'."
          },
          query: { type: "string", description: "Case-insensitive substring of the comment text." },
          limit: { type: "integer", minimum: 1, maximum: 500, description: "Default 50." }
        }
      },
      annotations: _e,
      execute: (e) => Se(
        () => kc(t, {
          ...typeof e.route == "string" ? { route: e.route } : {},
          ...typeof e.query == "string" ? { query: e.query } : {},
          ...typeof e.limit == "number" ? { limit: e.limit } : {}
        })
      )
    },
    {
      name: "fusen_get_feedback",
      title: "Read one fusen comment",
      description: "One comment in full, with its raw anchor and the page snapshot, if any.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "Comment id." } },
        required: ["id"]
      },
      annotations: _e,
      execute: (e) => Se(async () => {
        const n = Number(e.id);
        return Number.isFinite(n) ? await Sc(t, n) ?? { error: "not found", id: n } : { error: "id must be a number", id: e.id };
      })
    },
    {
      name: "fusen_summarize_routes",
      title: "Comment counts per route",
      description: "Comment and vote counts per route, busiest first. Cheapest way to orient.",
      inputSchema: { type: "object", properties: {} },
      annotations: _e,
      execute: () => Se(() => _c(t))
    }
  ];
}
async function Cc(t) {
  const e = t.modelContext ?? Ac();
  if (!e) return !1;
  const n = t.signal ? { signal: t.signal } : void 0;
  for (const r of Ec(t.reader))
    await e.registerTool(r, n);
  return !0;
}
function Tc(t) {
  return t === "" || t === "on" || t === "true" ? !0 : (t === "off" || t === "false" || console.warn(
    `fusen: unknown data-webmcp value ${JSON.stringify(t)} (expected "on" or "off") — treating it as off, so no tools are published.`
  ), !1);
}
function Oc(t) {
  const e = t.script ?? t.element;
  return e == null ? !1 : Tc(e);
}
function Ic(t) {
  const e = t.querySelector("script[data-webmcp]"), n = t.querySelector("fusen-widget[webmcp]");
  return {
    script: e?.getAttribute("data-webmcp") ?? null,
    element: n?.getAttribute("webmcp") ?? null
  };
}
function Nc(t = {}) {
  const e = t.kv ?? Qa(), n = tc(t.channel ?? Gr), r = Ga({
    kv: e,
    ...t.identity ? { identity: t.identity } : {},
    // Every local write is announced to the OTHER tabs. The writing tab already
    // applied it from the call's return value.
    onChange: (i) => n.publish(i)
  }), o = new AbortController(), s = {
    http: r,
    transport: n.transport,
    store: r,
    close: () => {
      o.abort(), n.close();
    }
  };
  return t.bridge !== !1 && (s.bridge = Wa(r)), t.webmcp && (s.webmcp = Cc({
    reader: $c(r),
    signal: o.signal
  })), s;
}
const Un = Nc({ webmcp: Oc(Ic(document)) });
Jo({ http: Un.http, transport: Un.transport });
Ka();
export {
  qa as BRIDGE_VERSION,
  Gr as DEFAULT_CHANNEL,
  Va as DEFAULT_DB_NAME,
  Ua as DEFAULT_STORE_NAME,
  Lc as WEBMCP_TOOL_NAMES,
  Za as createBridge,
  Nc as createFusenLite,
  Qa as createIndexedDbKv,
  tc as createLocalRealtime,
  Ga as createLocalStore,
  Mc as createMemoryKv,
  Ec as createWebmcpTools,
  Ac as findModelContext,
  Wa as installBridge,
  Ic as readWebmcpInputs,
  $c as readerFromStore,
  Cc as registerWebmcpTools,
  Fn as resolveLocalIdentity,
  Oc as resolveWebmcp
};
