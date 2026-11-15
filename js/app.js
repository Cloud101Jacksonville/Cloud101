/* Cloud 101 — in-store menu app (no ordering, no checkout). */
(function () {
  "use strict";

  var M = window.CLOUD101_MENU;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var PAGE = 48;
  var STORE = {
    get: function (k) { try { return window.localStorage.getItem("c101:" + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("c101:" + k, v); } catch (e) { /* storage unavailable */ } }
  };

  /* ---------- Data prep ---------- */
  var catBySlug = {};
  var subBySlug = {};
  M.categories.forEach(function (c) {
    catBySlug[c.slug] = c;
    c.count = 0;
    c.subs.forEach(function (s) { s.count = 0; s.cat = c.slug; subBySlug[c.slug + "/" + s.slug] = s; });
  });

  M.products.forEach(function (p, i) {
    p.order = i;
    // Show options that have a photo first (stable order otherwise).
    p.v = p.v.map(function (v, j) { return { v: v, j: j }; })
      .sort(function (a, b) { return (b.v.i ? 1 : 0) - (a.v.i ? 1 : 0) || a.j - b.j; })
      .map(function (x) { return x.v; });
    p.now = p.sp || p.p;
    p.off = p.sp && p.p > p.sp ? Math.round((1 - p.sp / p.p) * 100) : 0;
    p.key = [p.n, p.b, p.z, p.p, p.sp || ""].join("|").toLowerCase();
    var sub = p.s ? subBySlug[p.c + "/" + p.s] : null;
    p.subName = sub ? sub.name : "";
    p.hay = (p.n + " " + p.b + " " + p.subName + " " + catBySlug[p.c].name + " " + p.v.map(function (v) { return v.d || ""; }).join(" ")).toLowerCase();
  });

  // Some items are listed under more than one sub-category (e.g. pods under Vapes and Vape Pods).
  // Aggregate views (whole menu / whole category) show each item once.
  function dedupe(list) {
    var seen = {};
    return list.filter(function (p) {
      if (seen[p.key]) return false;
      seen[p.key] = 1;
      return true;
    });
  }
  M.categories.forEach(function (c) {
    var inCat = M.products.filter(function (p) { return p.c === c.slug; });
    c.count = dedupe(inCat).reduce(function (n, p) { return n + p.v.length; }, 0);
    c.subs.forEach(function (s) {
      s.count = inCat.filter(function (p) { return p.s === s.slug; }).reduce(function (n, p) { return n + p.v.length; }, 0);
    });
  });
  var TOTAL = dedupe(M.products).reduce(function (n, p) { return n + p.v.length; }, 0);

  function img(src) {
    if (!src) return "";
    var m = /^([a-z]):(.*)$/.exec(src);
    return m && M.imgPrefixes[m[1]] ? M.imgPrefixes[m[1]] + m[2] : src;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function sizeLabel(z) {
    if (!z) return "";
    if (/^\d+$/.test(z)) return z === "1" ? "Single" : z + " ct";
    return z;
  }
  function placeholder(p) {
    return '<div class="ph"><div><img src="assets/img/logo-sm.webp" alt="" /><span>' + esc(p.b) + "</span></div></div>";
  }
  function imageTag(p, src, cls) {
    if (!src) return placeholder(p);
    return '<img src="' + esc(img(src)) + '" alt="' + esc(p.n) + '" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : "") + ' onerror="this.onerror=null;this.outerHTML=window.C101PH(' + p.id + ')" />';
  }
  window.C101PH = function (id) { return placeholder(byId[id]); };
  var byId = {};
  M.products.forEach(function (p) { byId[p.id] = p; });

  function card(p) {
    var v = p.v[0] || {};
    var badges = "";
    if (p.off) badges = '<span class="badge sale">Sale</span><span class="badge off">-' + p.off + "%</span>";
    var flav = p.v.length > 1 ? '<span class="flavors">' + p.v.length + " options</span>" : "";
    return (
      '<button type="button" class="p-card" data-pid="' + p.id + '" aria-label="' + esc(p.n + ", " + money(p.now)) + '">' +
        '<div class="p-img">' + imageTag(p, v.i) + '<div class="p-badges">' + badges + "</div>" + flav + "</div>" +
        '<div class="p-body">' +
          '<span class="p-brand">' + esc(p.b) + "</span>" +
          '<h3 class="p-name">' + esc(p.n) + "</h3>" +
          '<span class="p-size">' + esc(sizeLabel(p.z)) + (p.v.length > 1 ? " · " + p.v.length + " options" : "") + "</span>" +
          '<div class="price"><b>' + money(p.now) + "</b>" + (p.off ? "<s>" + money(p.p) + "</s>" : "") + (p.off ? ' <span class="p-tag">SALE</span>' : "") + "</div>" +
        "</div>" +
      "</button>"
    );
  }

  /* ---------- Store hours (America/New_York, 9 AM – 2 AM daily) ---------- */
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function jaxNow() {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (x) { o[x.type] = x.value; });
      return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday), h: +o.hour % 24, m: +o.minute };
    } catch (e) {
      var d = new Date();
      return { day: d.getDay(), h: d.getHours(), m: d.getMinutes() };
    }
  }
  function updateStatus() {
    var t = jaxNow();
    var open = t.h >= 9 || t.h < 2;
    var text;
    if (open) {
      var minsLeft = t.h < 2 ? (2 - t.h) * 60 - t.m : (26 - t.h) * 60 - t.m;
      text = minsLeft <= 60 ? "Open now · Closes 2 AM" : "Open now · Until 2 AM";
    } else {
      text = "Closed · Opens 9 AM";
    }
    $$("[data-status]").forEach(function (el) {
      el.classList.toggle("closed", !open);
      $("[data-status-text]", el).textContent = text;
    });
    var tbl = $("[data-hours]");
    if (tbl) {
      // Between midnight and 2 AM we're still in "yesterday's" business day.
      var today = t.h < 2 ? (t.day + 6) % 7 : t.day;
      tbl.innerHTML = DAYS.map(function (d, i) {
        return '<tr class="' + (i === today ? "today" : "") + '"><td>' + d + (i === today ? " · Today" : "") + "</td><td>9:00 AM – 2:00 AM</td></tr>";
      }).join("");
    }
  }

  /* ---------- Static renders ---------- */
  function renderStatic() {
    $$("[data-count]").forEach(function (el) { el.textContent = fmt(Math.floor(TOTAL / 10) * 10); });
    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

    var cats = M.categories.map(function (c) {
      return (
        '<a class="cat-card" href="#/menu/' + c.slug + '">' +
          '<div class="img"><span class="count">' + fmt(c.count) + ' items</span><img src="assets/img/categories/' + c.slug + '.webp" alt="" loading="lazy" /></div>' +
          '<div class="body"><h3>' + esc(c.name) + "</h3><p>" + esc(c.tagline) + '</p><span class="go">View ' + esc(c.name) + ' <svg width="16" height="16"><use href="#i-arrow" /></svg></span></div>' +
        "</a>"
      );
    }).join("");
    $$("[data-cat-grid]").forEach(function (el) { el.innerHTML = cats; });

    // Mega menu + drawer + footer
    $("[data-mega]").innerHTML = M.categories.map(function (c) {
      return '<div><h4><a href="#/menu/' + c.slug + '">' + esc(c.name) + "</a></h4><ul>" +
        c.subs.map(function (s) { return '<li><a href="#/menu/' + c.slug + "/" + s.slug + '">' + esc(s.name) + "</a></li>"; }).join("") +
        (c.subs.length ? "" : '<li><a href="#/menu/' + c.slug + '">' + esc(c.tagline) + "</a></li>") +
        "</ul></div>";
    }).join("") + '<div class="all"><span>' + fmt(TOTAL) + ' items across 7 categories</span><a class="btn sm primary" href="#/menu">Full menu</a></div>';

    $("[data-drawer-nav]").innerHTML = '<a href="#/">Home</a><a href="#/about">About</a><a href="#/menu">Full Menu</a>' +
      M.categories.map(function (c) { return '<a class="sub" href="#/menu/' + c.slug + '">' + esc(c.name) + "</a>"; }).join("") +
      '<a href="#/menu?deals=1">Deals</a><a href="#/visit">Visit Us</a>';

    $("[data-footer-cats]").innerHTML = M.categories.map(function (c) {
      return '<li><a href="#/menu/' + c.slug + '">' + esc(c.name) + "</a></li>";
    }).join("");

    // Deals: biggest % off, one per brand+line so it's varied.
    var seenLine = {};
    var deals = dedupe(M.products).filter(function (p) { return p.off >= 20 && p.v[0] && p.v[0].i; })
      .sort(function (a, b) { return b.off - a.off || b.p - a.p; })
      .filter(function (p) {
        var k = p.b.toLowerCase();
        if ((seenLine[k] = (seenLine[k] || 0) + 1) > 2) return false;
        return true;
      }).slice(0, 14);
    $("[data-deals]").innerHTML = deals.map(card).join("");

    // Brand marquee
    var brands = [["geek-bar", "geek bar"], ["raz", "raz"], ["off-stamp", "off stamp"], ["foger", "foger"], ["beri", "beri"], ["al-fakher", "al fakher"]];
    var row = brands.map(function (b) {
      return '<a href="#/menu?q=' + encodeURIComponent(b[1]) + '" aria-label="' + b[1] + '"><img src="assets/img/brands/' + b[0] + '.webp" alt="' + b[1] + '" loading="lazy" /></a>';
    }).join("");
    $("[data-marquee]").innerHTML = row + row + row + row;
  }

  /* ---------- Menu view ---------- */
  var state = { cat: "", sub: "", q: "", brand: "", sort: STORE.get("sort") || "featured", deals: false, layout: STORE.get("layout") || "grid" };
  var list = [];
  var shown = 0;
  var io = null;

  function baseList() {
    var l = M.products.filter(function (p) {
      if (state.cat && p.c !== state.cat) return false;
      if (state.sub && p.s !== state.sub) return false;
      return true;
    });
    return state.sub ? l : dedupe(l);
  }

  function computeList() {
    var l = baseList();
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      l = l.filter(function (p) {
        return terms.every(function (t) { return p.hay.indexOf(t) !== -1 || p.hay.replace(/[-\s]/g, "").indexOf(t.replace(/-/g, "")) !== -1; });
      });
    }
    if (state.brand) l = l.filter(function (p) { return p.b.toLowerCase() === state.brand; });
    if (state.deals) l = l.filter(function (p) { return p.off > 0; });
    var s = state.sort;
    l = l.slice().sort(function (a, b) {
      if (s === "low") return a.now - b.now || a.order - b.order;
      if (s === "high") return b.now - a.now || a.order - b.order;
      if (s === "az") return a.n.localeCompare(b.n);
      if (s === "deal") return b.off - a.off || a.order - b.order;
      return a.order - b.order;
    });
    return l;
  }

  function renderBrandSelect() {
    var counts = {};
    var names = {};
    baseList().forEach(function (p) {
      var k = p.b.toLowerCase();
      counts[k] = (counts[k] || 0) + p.v.length;
      names[k] = names[k] || p.b;
    });
    var keys = Object.keys(counts).sort(function (a, b) { return names[a].localeCompare(names[b]); });
    if (state.brand && !counts[state.brand]) state.brand = "";
    $("[data-brand]").innerHTML = '<option value="">All brands (' + keys.length + ")</option>" +
      keys.map(function (k) { return '<option value="' + esc(k) + '"' + (k === state.brand ? " selected" : "") + ">" + esc(names[k]) + " (" + counts[k] + ")</option>"; }).join("");
  }

  function renderMenuChrome() {
    var c = state.cat ? catBySlug[state.cat] : null;
    var s = c && state.sub ? subBySlug[state.cat + "/" + state.sub] : null;
    var title = s ? s.name : c ? c.name : "The Menu";
    var intro = s ? s.intro : c ? c.intro : "The full Cloud 101 lineup — " + fmt(TOTAL) + " items across vapes, hemp, smoking essentials, convenience, kratom, nicotine pouches and novelty. Browse here, buy in-store.";
    $("[data-menu-title]").textContent = title;
    $("[data-menu-intro]").textContent = intro;
    document.title = title + " · Cloud 101 Menu";

    var crumbs = '<a href="#/">Home</a><span class="sep">/</span>' + (c ? '<a href="#/menu">Menu</a>' : "<span>Menu</span>");
    if (c) crumbs += '<span class="sep">/</span>' + (s ? '<a href="#/menu/' + c.slug + '">' + esc(c.name) + "</a>" : "<span>" + esc(c.name) + "</span>");
    if (s) crumbs += '<span class="sep">/</span><span>' + esc(s.name) + "</span>";
    $("[data-crumbs]").innerHTML = crumbs;

    $("[data-tabs]").innerHTML = '<a class="tab' + (!c ? " active" : "") + '" href="#/menu">All <small>' + fmt(TOTAL) + "</small></a>" +
      M.categories.map(function (x) {
        return '<a class="tab' + (c === x ? " active" : "") + '" href="#/menu/' + x.slug + '">' + esc(x.name) + " <small>" + fmt(x.count) + "</small></a>";
      }).join("");
    var subtabs = $("[data-subtabs]");
    if (c && c.subs.length) {
      subtabs.hidden = false;
      subtabs.innerHTML = '<a class="tab subtab' + (!s ? " active" : "") + '" href="#/menu/' + c.slug + '">All ' + esc(c.name) + "</a>" +
        c.subs.map(function (x) {
          return '<a class="tab subtab' + (s === x ? " active" : "") + '" href="#/menu/' + c.slug + "/" + x.slug + '">' + esc(x.name) + " <small>" + fmt(x.count) + "</small></a>";
        }).join("");
    } else {
      subtabs.hidden = true;
      subtabs.innerHTML = "";
    }

    $("[data-side]").innerHTML = "<h3>Categories</h3>" +
      '<a class="cat' + (!c ? " active" : "") + '" href="#/menu">Full Menu <em>' + fmt(TOTAL) + "</em></a>" +
      M.categories.map(function (x) {
        return '<a class="cat' + (c === x && !s ? " active" : "") + '" href="#/menu/' + x.slug + '">' + esc(x.name) + " <em>" + fmt(x.count) + "</em></a>" +
          x.subs.map(function (y) {
            return '<a class="sub' + (s === y ? " active" : "") + '" href="#/menu/' + x.slug + "/" + y.slug + '">' + esc(y.name) + " <em>" + fmt(y.count) + "</em></a>";
          }).join("");
      }).join("");

    $("[data-q]").value = state.q;
    $("[data-sort]").value = state.sort;
    $("[data-deals-only]").setAttribute("aria-pressed", String(state.deals));
    $$("[data-layout]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-layout") === state.layout)); });
    renderBrandSelect();
  }

  function renderResults() {
    list = computeList();
    shown = 0;
    var box = $("[data-results]");
    var items = list.reduce(function (n, p) { return n + p.v.length; }, 0);
    $("[data-result-count]").innerHTML = "<b>" + fmt(items) + "</b> item" + (items === 1 ? "" : "s") + (list.length !== items ? " · " + fmt(list.length) + " listings" : "");
    $("[data-clear]").hidden = !(state.q || state.brand || state.deals);
    if (!list.length) {
      box.innerHTML = '<div class="empty"><div class="display">No clouds here</div><p>Nothing matches that search. Try a different flavor or brand — or give us a call, we might have it in the back.</p><button class="btn sm primary" type="button" data-clear-2>Clear filters</button></div>';
      return;
    }
    box.innerHTML = '<div class="p-grid' + (state.layout === "board" ? " board" : "") + '" data-grid></div>';
    more();
    requestAnimationFrame(fill);
  }

  function more() {
    var grid = $("[data-grid]");
    if (!grid || shown >= list.length) return;
    var next = list.slice(shown, shown + PAGE);
    grid.insertAdjacentHTML("beforeend", next.map(card).join(""));
    shown += next.length;
  }

  // Keep adding rows while the end of the list is near the viewport.
  function fill() {
    var s = $("[data-sentinel]");
    var guard = 0;
    while (currentView === "menu" && shown < list.length && s.getBoundingClientRect().top < window.innerHeight + 900 && guard++ < 50) more();
  }

  function setupInfinite() {
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) fill();
      }, { rootMargin: "900px 0px" });
      io.observe($("[data-sentinel]"));
    }
    window.addEventListener("scroll", fill, { passive: true });
  }

  /* ---------- Product modal ---------- */
  var modal = $("[data-modal]");
  var lastFocus = null;
  var current = null;

  function openProduct(id, variant) {
    var p = byId[id];
    if (!p) return;
    current = { p: p, v: variant || 0 };
    lastFocus = document.activeElement;
    renderModal();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    $(".box", modal).scrollTop = 0;
    $(".close", modal).focus();
  }
  function closeModal() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function related(p) {
    var same = dedupe(M.products).filter(function (x) { return x !== p && x.key !== p.key && x.b.toLowerCase() === p.b.toLowerCase(); });
    if (same.length < 4) {
      same = same.concat(dedupe(M.products).filter(function (x) { return x !== p && x.key !== p.key && x.c === p.c && x.s === p.s && same.indexOf(x) === -1; }));
    }
    return same.slice(0, 10);
  }
  function renderModal() {
    var p = current.p;
    var v = p.v[current.v] || {};
    var c = catBySlug[p.c];
    var desc = v.d || p.g;
    var nicotine = p.c === "nicotine-pouches" || p.c === "vape-products";
    var thumbs = "";
    if (p.v.length > 1) {
      thumbs = '<div class="thumbs-label">' + p.v.length + " options — tap to preview</div><div class=\"thumbs\">" +
        p.v.map(function (x, i) {
          return '<button type="button" data-variant="' + i + '" aria-pressed="' + (i === current.v) + '" aria-label="Option ' + (i + 1) + '">' +
            (x.i ? '<img src="' + esc(img(x.i)) + '" alt="" loading="lazy" />' : '<span style="font-size:11px;color:var(--dim)">' + (i + 1) + "</span>") + "</button>";
        }).join("") + "</div>";
    }
    var rel = related(p);
    $("[data-modal-body]").innerHTML =
      '<div class="pd">' +
        '<div class="pd-media"><div class="pd-main">' + imageTag(p, v.i) +
          '<div class="p-badges">' + (p.off ? '<span class="badge sale">Sale</span><span class="badge off">-' + p.off + "%</span>" : "") + "</div></div>" + thumbs + "</div>" +
        '<div class="pd-info">' +
          '<span class="p-brand">' + esc(p.b) + "</span>" +
          '<h2 id="pd-title">' + esc(p.n) + "</h2>" +
          '<div class="pd-meta">' + (p.z ? "<span>" + esc(sizeLabel(p.z)) + "</span>" : "") + "<span>" + esc(c.name) + "</span>" + (p.subName && p.subName !== c.name ? "<span>" + esc(p.subName) + "</span>" : "") + (p.v.length > 1 ? "<span>Option " + (current.v + 1) + " of " + p.v.length + "</span>" : "") + "</div>" +
          '<div class="pd-price"><b>' + money(p.now) + "</b>" + (p.off ? "<s>" + money(p.p) + '</s><span class="save">You save ' + money(p.p - p.sp) + " (" + p.off + "%)</span>" : "") + "</div>" +
          '<div class="pd-desc">' + esc(desc) + "</div>" +
          '<div class="pd-note"><svg><use href="#i-info" /></svg><span>In-store only — this menu is for browsing. Prices and availability can change, so call ahead to make sure it\'s on the shelf. 21+ with valid ID.</span></div>' +
          '<div class="pd-actions"><a class="btn primary" href="tel:+19048013241"><svg><use href="#i-phone" /></svg> Call to check</a><a class="btn" href="https://maps.app.goo.gl/ioFf5GBgNXjV5i1bA" target="_blank" rel="noopener"><svg><use href="#i-pin" /></svg> Directions</a></div>' +
          (nicotine ? '<div class="pd-warn">WARNING: This product contains nicotine. Nicotine is an addictive chemical.</div>' : "") +
        "</div>" +
      "</div>" +
      (rel.length ? '<div class="pd-related"><h3>More like this</h3><div class="scroller">' + rel.map(card).join("") + "</div></div>" : "");
  }

  modal.addEventListener("click", function (e) {
    var t = e.target.closest("[data-variant]");
    if (t) {
      current.v = +t.getAttribute("data-variant");
      var scrollTop = $(".thumbs", modal) ? $(".thumbs", modal).scrollTop : 0;
      renderModal();
      if ($(".thumbs", modal)) $(".thumbs", modal).scrollTop = scrollTop;
      var b = $('[data-variant="' + current.v + '"]', modal);
      if (b) b.focus();
      return;
    }
    if (e.target.closest("[data-modal-close]")) closeModal();
  });

  /* ---------- Router ---------- */
  var currentView = "";
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?");
    var path = qi === -1 ? h : h.slice(0, qi);
    var params = {};
    if (qi !== -1) {
      h.slice(qi + 1).split("&").forEach(function (kv) {
        var i = kv.indexOf("=");
        if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
      });
    }
    return { parts: path.split("/").filter(Boolean), params: params };
  }

  function show(view) {
    var changed = view !== currentView;
    currentView = view;
    $$("[data-view]").forEach(function (el) { el.classList.toggle("active", el.getAttribute("data-view") === view); });
    $$("[data-nav]").forEach(function (el) { el.classList.toggle("active", el.getAttribute("data-nav") === view); });
    if (view === "visit") {
      var f = $("iframe[data-src]");
      if (f && !f.src) f.src = f.getAttribute("data-src");
    }
    return changed;
  }

  function route() {
    closeModal();
    closeDrawer();
    var r = parseHash();
    var first = r.parts[0] || "";
    if (first === "menu") {
      var cat = catBySlug[r.parts[1]] ? r.parts[1] : "";
      var sub = cat && subBySlug[cat + "/" + r.parts[2]] ? r.parts[2] : "";
      var changedScope = cat !== state.cat || sub !== state.sub;
      state.cat = cat;
      state.sub = sub;
      state.q = r.params.q || "";
      state.deals = r.params.deals === "1";
      state.brand = (r.params.brand || "").toLowerCase();
      var changedView = show("menu");
      renderMenuChrome();
      renderResults();
      if (changedView || changedScope) window.scrollTo(0, 0);
      if (r.params.item) openProduct(+r.params.item);
      return;
    }
    var view = first === "about" ? "about" : first === "visit" || first === "contact" ? "visit" : "home";
    document.title = view === "home" ? "Cloud 101 · Jacksonville Smoke Shop & Vape Menu" : (view === "about" ? "About" : "Visit Us") + " · Cloud 101";
    show(view);
    window.scrollTo(0, 0);
  }

  // Update filters in the URL without a full re-route/scroll.
  function syncUrl() {
    var path = "#/menu" + (state.cat ? "/" + state.cat : "") + (state.sub ? "/" + state.sub : "");
    var qs = [];
    if (state.q) qs.push("q=" + encodeURIComponent(state.q));
    if (state.brand) qs.push("brand=" + encodeURIComponent(state.brand));
    if (state.deals) qs.push("deals=1");
    var url = path + (qs.length ? "?" + qs.join("&") : "");
    if (location.hash !== url) history.replaceState(null, "", url);
  }

  /* ---------- Events ---------- */
  var qTimer;
  $("[data-q]").addEventListener("input", function (e) {
    clearTimeout(qTimer);
    var v = e.target.value;
    qTimer = setTimeout(function () {
      state.q = v.trim();
      syncUrl();
      renderResults();
    }, 140);
  });
  $("[data-brand]").addEventListener("change", function (e) { state.brand = e.target.value; syncUrl(); renderResults(); });
  $("[data-sort]").addEventListener("change", function (e) { state.sort = e.target.value; STORE.set("sort", state.sort); renderResults(); });
  $("[data-deals-only]").addEventListener("click", function () {
    state.deals = !state.deals;
    this.setAttribute("aria-pressed", String(state.deals));
    syncUrl();
    renderResults();
  });
  $$("[data-layout]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.layout = b.getAttribute("data-layout");
      STORE.set("layout", state.layout);
      $$("[data-layout]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      var g = $("[data-grid]");
      if (g) g.classList.toggle("board", state.layout === "board");
    });
  });
  function clearFilters() {
    state.q = "";
    state.brand = "";
    state.deals = false;
    syncUrl();
    renderMenuChrome();
    renderResults();
  }
  $("[data-clear]").addEventListener("click", clearFilters);
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-clear-2]")) { clearFilters(); return; }
    var pc = e.target.closest("[data-pid]");
    if (pc) { openProduct(+pc.getAttribute("data-pid")); return; }
    var yt = e.target.closest("[data-yt] button");
    if (yt) {
      var box = yt.parentNode;
      box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + box.getAttribute("data-yt") + '?autoplay=1&rel=0" title="' + esc(box.getAttribute("data-yt-title")) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    }
    var ddBtn = e.target.closest(".dd > button");
    var dd = $(".dd");
    if (ddBtn) {
      var open = !dd.classList.contains("open");
      dd.classList.toggle("open", open);
      ddBtn.setAttribute("aria-expanded", String(open));
    } else if (!e.target.closest(".mega")) {
      dd.classList.remove("open");
      $(".dd > button").setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeModal();
      closeDrawer();
      $(".dd").classList.remove("open");
      return;
    }
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea" && tag !== "select" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (currentView !== "menu") location.hash = "#/menu";
      setTimeout(function () { $("[data-q]").focus(); }, 30);
    }
    if (modal.classList.contains("open") && current && current.p.v.length > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft") && e.target.closest && e.target.closest(".thumbs")) {
      e.preventDefault();
      var n = current.p.v.length;
      current.v = (current.v + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
      renderModal();
      var b = $('[data-variant="' + current.v + '"]', modal);
      if (b) b.focus();
    }
    // Keep focus inside the open modal.
    if (e.key === "Tab" && modal.classList.contains("open")) {
      var f = $$('button, a[href], input, select, [tabindex]:not([tabindex="-1"])', $(".box", modal)).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var firstEl = f[0];
      var lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  });

  // Drawer
  var drawer = $("[data-drawer]");
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    if (!modal.classList.contains("open")) document.body.classList.remove("locked");
  }
  $("[data-drawer-open]").addEventListener("click", function () {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
    var c = $("[data-drawer-close]", $(".panel", drawer));
    if (c) c.focus();
  });
  $$("[data-drawer-close]").forEach(function (b) { b.addEventListener("click", closeDrawer); });
  drawer.addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });

  // Back to top
  var topBtn = $("[data-top]");
  window.addEventListener("scroll", function () { topBtn.classList.toggle("show", window.scrollY > 900); }, { passive: true });
  topBtn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  // Age gate
  var age = $("[data-age]");
  if (STORE.get("age21") !== "yes") {
    age.classList.add("open");
    document.body.classList.add("locked");
    setTimeout(function () { $("[data-age-yes]").focus(); }, 50);
  }
  $("[data-age-yes]").addEventListener("click", function () {
    STORE.set("age21", "yes");
    age.classList.remove("open");
    document.body.classList.remove("locked");
  });
  $("[data-age-no]").addEventListener("click", function () {
    $("[data-age-msg]").textContent = "Sorry — you must be 21 or older to view this menu.";
    $(".row", age).hidden = true;
  });

  /* ---------- Boot ---------- */
  renderStatic();
  updateStatus();
  setInterval(updateStatus, 60 * 1000);
  setupInfinite();
  window.addEventListener("hashchange", route);
  route();
})();
