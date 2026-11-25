/* دارك وولف — تطبيق طلبات خامات الورش: حسابات + متجر + إدارة */
(function () {
  'use strict';

  var CFG = window.DW_CONFIG || {};
  var OWNER_EMAIL = (CFG.ownerEmail || '').toLowerCase();
  var DW_RECOVERY = /type=recovery/i.test(location.hash);
  var sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var CATS = [
    { value: 'all',      label: 'الكل' },
    { value: 'kitchen',  label: 'إكسسوارات مطابخ' },
    { value: 'aluminum', label: 'ألومنيوم وشبابيك' }
  ];
  var KNOWN_IMAGES = [
    'photo-hinge.jpg','photo-drawer-slide.jpg','photo-handle.jpg','photo-gas-strut.jpg',
    'photo-leg.jpg','photo-led-strip.jpg','photo-alu-profile.jpg','photo-roller.jpg',
    'photo-lock.jpg','photo-epdm.jpg','photo-mesh.jpg','photo-upvc-handle.jpg',
    'photo-tools.jpg',
    'photo-brushes.jpg',
    'photo-rubber.jpg',
    'photo-adhesive.jpg',
    'photo-awning.jpg',
    'photo-pullout.jpg',
    'photo-basket.jpg',
    'photo-upvc-handle-vega.jpg',
  ];

  var BUILD = 'dw-v31';

  var fmt = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 });
  function egp(n) { return fmt.format(n) + ' ج'; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var state = { selColor: {}, 
    user: null,
    isOwner: false,
    products: [],
    categories: [],
    texts: {},
    cart: load('dw-cart', {}),
    editing: {},
    cat: 'all',
    search: '',
    topSellers: [],
    authMode: 'login',
    adminTab: 'orders'
  };

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function toast(msg) {
    var el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- الدخول ---------- */
  function showAuth() {
    $('auth-screen').hidden = false;
    $('app').hidden = true;
  }
  function showApp() {
    $('auth-screen').hidden = true;
    $('app').hidden = false;
  }
  function setAuthMode(mode) {
    state.authMode = mode;
    $('tab-login').classList.toggle('active', mode === 'login');
    $('tab-signup').classList.toggle('active', mode === 'signup');
    $('f-name-wrap').hidden = mode === 'login';
    $('auth-submit').textContent = mode === 'login' ? 'دخول' : 'إنشاء الحساب';
    $('auth-error').hidden = true;
    $('f-password').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    var fl = $('forgot-link'); if (fl) fl.hidden = mode !== 'login';
  }
  function showResetMode() {
    showAuth();
    $('auth-form').hidden = true;
    document.querySelector('.auth-tabs').hidden = true;
    $('reset-wrap').hidden = false;
    $('reset-cancel').hidden = !state.user;
  }
  function leaveResetMode() {
    $('reset-wrap').hidden = true;
    $('reset-error').hidden = true;
    $('auth-form').hidden = false;
    document.querySelector('.auth-tabs').hidden = false;
  }
  function exitResetMode() {
    leaveResetMode();
    setAuthMode('login');
  }
  function authError(msg) {
    var el = $('auth-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function bindAuth() {
    $('tab-login').addEventListener('click', function () { setAuthMode('login'); });
    $('tab-signup').addEventListener('click', function () { setAuthMode('signup'); });
    $('forgot-link').addEventListener('click', function () {
      var email = $('f-email').value.trim();
      if (!email) { authError('اكتب بريدك الإلكتروني فوق الأول.'); return; }
      $('auth-error').hidden = true;
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
        .then(function (r) {
          if (r.error) { authError(translateAuthError(r.error.message)); return; }
          toast('لو البريد ده مسجل عندنا، هيوصلك لينك تغيير كلمة السر. بص على بريدك (ولو مش لاقيه، بص في السبام).');
        })
        .catch(function () { authError('حصلت مشكلة في الاتصال. جرّب تاني.'); });
    });
    $('reset-cancel').addEventListener('click', function () {
      DW_RECOVERY = false;
      if (state.user) { leaveResetMode(); onUser(state.user); }
      else { exitResetMode(); }
    });
    var cp = $('change-pass');
    if (cp) cp.addEventListener('click', function () { showResetMode(); });
    $('reset-save').addEventListener('click', function () {
      var p = $('f-newpass').value;
      var errEl = $('reset-error');
      errEl.hidden = true;
      if (p.length < 6) { errEl.textContent = 'كلمة السر لازم ٦ حروف على الأقل.'; errEl.hidden = false; return; }
      $('reset-save').disabled = true;
      sb.auth.updateUser({ password: p })
        .then(function (r) {
          $('reset-save').disabled = false;
          if (r.error) { errEl.textContent = translateAuthError(r.error.message); errEl.hidden = false; return; }
          toast('اتغيرت كلمة السر ✅');
          DW_RECOVERY = false;
          if (state.user) { leaveResetMode(); onUser(state.user); }
          else { exitResetMode(); }
        })
        .catch(function () { $('reset-save').disabled = false; errEl.textContent = 'حصلت مشكلة في الاتصال. جرّب تاني.'; errEl.hidden = false; });
    });
    $('auth-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = $('f-email').value.trim();
      var pass = $('f-password').value;
      var name = $('f-name').value.trim();
      $('auth-error').hidden = true;
      $('auth-submit').disabled = true;
      var done = function () { $('auth-submit').disabled = false; };
      if (state.authMode === 'signup') {
        if (!name) { authError('اكتب اسمك الأول'); done(); return; }
        sb.auth.signUp({ email: email, password: pass, options: { data: { full_name: name } } })
          .then(function (r) {
            done();
            if (r.error) { authError(translateAuthError(r.error.message)); return; }
            if (!r.data.session) { authError('تم إنشاء الحساب. سجّل دخولك دلوقتي.'); setAuthMode('login'); return; }
            toast('أهلًا بيك يا ' + name);
          })
          .catch(function () { done(); authError('حصلت مشكلة في الاتصال. جرّب تاني.'); });
      } else {
        sb.auth.signInWithPassword({ email: email, password: pass })
          .then(function (r) {
            done();
            if (r.error) { authError(translateAuthError(r.error.message)); }
          })
          .catch(function () { done(); authError('حصلت مشكلة في الاتصال. جرّب تاني.'); });
      }
    });
  }
  function translateAuthError(msg) {
    msg = String(msg || '');
    if (/Invalid login credentials/i.test(msg)) return 'البريد أو كلمة السر غلط.';
    if (/User already registered/i.test(msg)) return 'البريد ده مسجل قبل كده. سجّل دخولك.';
    if (/at least 6/i.test(msg) || /password/i.test(msg) && /short|weak/i.test(msg)) return 'كلمة السر لازم ٦ حروف على الأقل.';
    if (/valid email/i.test(msg)) return 'اكتب بريد إلكتروني صحيح.';
    if (/rate limit|too many/i.test(msg)) return 'محاولات كتير. استنى شوية وجرّب تاني.';
    return 'مشكلة: ' + msg;
  }

  /* ---------- البيانات ---------- */
  var DEFAULT_PAY_NUMBER = '01066683195';
  function paymentNumber() {
    return (state.texts.payment || '').trim() || DEFAULT_PAY_NUMBER;
  }
  function fetchBalance(uid) {
    return sb.from('wallet_ledger').select('kind,status,amount').eq('user_id', uid).limit(500)
      .then(function (r) {
        if (r.error) return 0;
        var bal = 0;
        (r.data || []).forEach(function (x) {
          if (x.status === 'confirmed' || x.status === 'applied') bal += Number(x.amount) || 0;
        });
        return bal;
      })
      .catch(function () { return 0; });
  }
  function fetchLimit(uid) {
    return sb.from('credit_limits').select('limit_amount').eq('user_id', uid).maybeSingle()
      .then(function (r) { return r.data ? Number(r.data.limit_amount) || 0 : 0; })
      .catch(function () { return 0; });
  }

  function loadTexts() {
    return sb.from('settings').select('value').eq('id', 'app').maybeSingle()
      .then(function (r) {
        state.texts = (r.data && r.data.value) || {};
        applyTexts();
      })
      .catch(function () {});
  }
  function applyTexts() {
    var t = state.texts;
    if (t.welcome) $('welcome-text').textContent = t.welcome;
    if (t.description) $('brand-sub').textContent = t.description;
    if (t.footer) $('footer-text').textContent = t.footer;
    var bt = $('build-tag'); if (bt) bt.textContent = BUILD;
    var note = $('demo-note');
    if (t.note) { note.textContent = t.note; note.hidden = false; }
    else { note.hidden = true; }
    var wa = (t.whatsapp || '').replace(/\D/g, '') || '201066683195';
    var wf = $('wa-float');
    if (wf) wf.href = 'https://wa.me/' + wa;
  }
  function loadProducts() {
    return sb.from('products').select('*').order('sort').order('created_at')
      .then(function (r) {
        if (r.error) { toast('مشكلة في تحميل المنتجات'); return; }
        state.products = r.data || [];
        renderGrid();
      })
      .catch(function () { toast('مشكلة في تحميل المنتجات'); });
  }

  /* ---------- المتجر ---------- */
  function ckey(id, color) { return String(id) + '|' + (color || ''); }
  function parseKey(key) {
    var i = String(key).indexOf('|');
    return { id: String(key).slice(0, i), color: String(key).slice(i + 1) || null };
  }
  function setQty(id, qty) {
    if (qty <= 0) { delete state.cart[id]; delete state.editing[id]; } else { state.cart[id] = qty; }
    save('dw-cart', state.cart);
    renderGrid();
    renderCart();
  }
  function updateCartBadge() {
    var n = lines().length;
    var b = $('cart-badge');
    if (!b) return;
    b.textContent = n;
    b.hidden = !n;
  }
  function openCart() {
    $('order-done').hidden = true;
    $('catalog-view').hidden = true;
    $('orders-view').hidden = true;
    $('wallet-view').hidden = true;
    $('admin-view').hidden = true;
    $('cart-view').hidden = false;
    renderCart();
    scrollTo(0, 0);
    pushNav();
  }
  function closeCart() { history.back(); }
  function productById(id) {
    for (var i = 0; i < state.products.length; i++) {
      if (String(state.products[i].id) === String(id)) return state.products[i];
    }
    return null;
  }
  function lines() {
    return Object.keys(state.cart).map(function (key) {
      var k = parseKey(key);
      var p = productById(k.id);
      if (!p || !(state.cart[key] > 0)) return null;
      return { p: p, qty: state.cart[key], color: k.color, total: state.cart[key] * p.price };
    }).filter(Boolean);
  }
  function catLabel(v) {
    var c = catById(v);
    if (c) return c.name;
    for (var i = 0; i < CATS.length; i++) if (CATS[i].value === v) return CATS[i].label;
    return v;
  }
  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return null;
  }
  function parentCats() { return state.categories.filter(function (c) { return !c.parent_id; }); }
  function subCats(pid) { return state.categories.filter(function (c) { return c.parent_id === pid; }); }
  function catHasProducts(c) {
    var ids = [c.id].concat(subCats(c.id).map(function (s) { return s.id; }));
    return state.products.some(function (p) { return p.in_stock && ids.indexOf(p.category_id) >= 0; });
  }
  function loadCategories() {
    return sb.from('categories').select('*').order('sort').order('created_at')
      .then(function (r) {
        state.categories = r.data || [];
        renderCatCards();
        renderFilters();
        renderGrid();
      })
      .catch(function () {});
  }
  function renderCatCards() {
    var box = $('cat-cards');
    if (!box) return;
    box.innerHTML = '';
    if (state.cat !== 'all') { box.hidden = true; return; }
    box.hidden = false;
    var parents = parentCats();
    if (!parents.length) { box.hidden = true; return; }
    parents.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-card';
      var thumb = c.img
        ? '<span class="cat-thumb"><img src="' + esc(c.img) + '" alt="" loading="lazy"></span>'
        : '<span class="cat-thumb placeholder">' + esc(c.name.trim().charAt(0)) + '</span>';
      b.innerHTML = thumb + '<span class="cat-name">' + esc(c.name) + '</span>';
      b.addEventListener('click', function () { state.cat = 'p:' + c.id; renderCatCards(); renderFilters(); renderGrid(); scrollTo(0, 0); pushNav(); });
      box.appendChild(b);
    });
  }

  function renderFilters() {
    var nav = $('filters');
    nav.innerHTML = '';
    if (state.cat === 'all') return;
    var pid = null;
    if (state.cat.indexOf('p:') === 0) pid = state.cat.slice(2);
    else if (state.cat.indexOf('s:') === 0) {
      var sc = catById(state.cat.slice(2));
      pid = sc ? sc.parent_id : null;
    }
    var chips = [{ value: 'all', label: '← كل الأقسام' }];
    if (pid) {
      var pc = catById(pid);
      chips.push({ value: 'p:' + pid, label: 'كل ' + (pc ? pc.name : 'القسم') });
      subCats(pid).forEach(function (s) { chips.push({ value: 's:' + s.id, label: s.name }); });
    }
    chips.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (state.cat === c.value ? ' active' : '');
      b.textContent = c.label;
      b.addEventListener('click', function () { state.cat = c.value; renderCatCards(); renderFilters(); renderGrid(); pushNav(); });
      nav.appendChild(b);
    });
  }
  /* ---------- تنقل + زرار رجوع الموبايل ---------- */
  function currentView() {
    if (!$('orders-view').hidden) return 'orders';
    if (!$('wallet-view').hidden) return 'wallet';
    if (!$('admin-view').hidden) return 'admin';
    if (!$('cart-view').hidden) return 'cart';
    return 'catalog';
  }
  var suppressHash = null;
  function navHash() {
    var v = currentView();
    if (v === 'catalog') return state.cat && state.cat !== 'all' ? '#/c/' + encodeURIComponent(state.cat) : '#/';
    return '#/v/' + v;
  }
  function pushNav() {
    capExitWarnAt = 0;
    var h = navHash();
    if (location.hash === h) return;
    suppressHash = h;
    location.hash = h;
  }
  function parseHash(h) {
    if (h === '#/' || h === '#/home' || h === '') return { v: 'catalog', c: 'all' };
    if (h.indexOf('#/c/') === 0) return { v: 'catalog', c: decodeURIComponent(h.slice(4)) };
    if (h.indexOf('#/v/') === 0) return { v: h.slice(4), c: null };
    return null;
  }
  function applyNav(s) {
    if (s.c != null) state.cat = s.c;
    var v = s.v || 'catalog';
    if (v === 'admin' && !state.isOwner) v = 'catalog';
    $('orders-view').hidden = v !== 'orders';
    $('wallet-view').hidden = v !== 'wallet';
    $('admin-view').hidden = v !== 'admin';
    $('cart-view').hidden = v !== 'cart';
    $('catalog-view').hidden = v !== 'catalog';
    if (v === 'orders') renderMyOrders();
    if (v === 'wallet') renderWallet();
    if (v === 'admin') setAdminTab(state.adminTab || 'orders');
    if (v === 'cart') renderCart();
    renderCatCards(); renderFilters(); renderGrid();
    scrollTo(0, 0);
  }
  function goHome() {
    state.cat = 'all';
    applyNav({ v: 'catalog', c: 'all' });
    pushNav();
  }
  /* ---------- تكبير صورة المنتج ---------- */
  function openLightbox(src, name) {
    if (!src) return;
    $('lightbox-img').src = src;
    $('lightbox-img').alt = name || '';
    $('lightbox').hidden = false;
    document.body.classList.add('lb-open');
    suppressHash = '#/lb';
    location.hash = '#/lb';
  }
  function closeLightbox(fromPop) {
    if ($('lightbox').hidden) return;
    $('lightbox').hidden = true;
    $('lightbox-img').src = '';
    document.body.classList.remove('lb-open');
    if (!fromPop) { try { history.back(); } catch (e) {} }
  }
  /* ---------- تنقل الرجوع (hash) + تأكيد الخروج ---------- */
  var rearmTimer = null;
  var navBooted = false;
  window.addEventListener('hashchange', function () {
    if (!state.user || DW_RECOVERY) return;
    var h = location.hash;
    if (h === suppressHash) { suppressHash = null; return; }
    suppressHash = null;
    if (h.indexOf('#/') !== 0 && h !== '') return; // روابط مش بتاعتنا (زي رموز الدخول)
    if (h === '#/lb') return; // اللايت بوكس اتفتح للتو
    if (!$('lightbox').hidden) closeLightbox(true);
    if (h === '#/home' || h === '') {
      // ده أصل السجل: رجوع وهو في الرئيسية = حذر الخروج
      applyNav({ v: 'catalog', c: 'all' });
      toast('اضغط رجوع مرة تانية للخروج');
      clearTimeout(rearmTimer);
      rearmTimer = setTimeout(function () {
        if (state.user && currentView() === 'catalog' && state.cat === 'all' && (location.hash === '#/home' || location.hash === '')) {
          suppressHash = '#/';
          location.hash = '#/';
        }
      }, 2000);
      return;
    }
    var s = parseHash(h);
    if (s) applyNav(s);
  });
  /* ---------- زرار رجوع الموبايل جوه التطبيق المثبت (Capacitor) ---------- */
  // من غير الليسنر ده، الويفيو بتاع الأندرويد بيقفل التطبيق على طول مع أي ضغطة رجوع.
  var capExitWarnAt = 0;
  (function () {
    var C = window.Capacitor;
    if (!C || !C.Plugins || !C.Plugins.App) return;
    C.Plugins.App.addListener('backButton', function () {
      if (DW_RECOVERY) return;
      if (!state.user) { C.Plugins.App.exitApp(); return; }
      var h = location.hash;
      if (h === '#/home' || h === '' || h === '#/') {
        // في الرئيسية: خروج بضغطتين متتاليتين بس
        var now = Date.now();
        if (now - capExitWarnAt < 3000) { capExitWarnAt = 0; C.Plugins.App.exitApp(); return; }
        capExitWarnAt = now;
        toast('اضغط رجوع مرة تانية للخروج');
        return;
      }
      history.back(); // أي صفحة تانية: رجع خطوة واحدة عن طريق الهاش
    });
  })();
  /* ---------- إشعارات حالة الطلب ---------- */
  function showNotif(msg) {
    var el = $('notif-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'notif-bar'; el.className = 'notif-bar';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span></span><button type="button" class="notif-x" aria-label="اقفل">✕</button>';
    el.querySelector('span').textContent = msg;
    el.querySelector('.notif-x').addEventListener('click', function () { el.classList.remove('show'); });
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 9000);
  }
  function checkOrderNotifs(initial) {
    if (!state.user || state.isOwner) return;
    sb.from('orders').select('id,status').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(20)
      .then(function (r) {
        if (r.error || !r.data) return;
        var map = {};
        try { map = JSON.parse(localStorage.getItem('dw-order-status') || '{}'); } catch (e) {}
        var changed = [];
        r.data.forEach(function (o) {
          if (map[o.id] && map[o.id] !== o.status) {
            changed.push('طلب #' + String(o.id).slice(0, 8) + ': ' + statusLabel(o.status));
          }
          map[o.id] = o.status;
        });
        try { localStorage.setItem('dw-order-status', JSON.stringify(map)); } catch (e) {}
        if (!initial && changed.length) showNotif(changed.join(' · '));
      })
      .catch(function () {});
  }
  setInterval(function () { if (state.user && !state.isOwner) checkOrderNotifs(false); }, 60000);
  function norm(s) {
    return String(s || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  }
  function buildCard(p) {
    var colors = (p.colors || []).filter(Boolean);
    if (colors.length && (!state.selColor[p.id] || colors.indexOf(state.selColor[p.id]) < 0)) {
      state.selColor[p.id] = colors[0];
    }
    var key = ckey(p.id, colors.length ? state.selColor[p.id] : null);
    var qty = state.cart[key] || 0;
    var card = document.createElement('article');
    card.className = 'card';
    var imgHtml = p.img ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '';
    var priceHtml = egp(p.price) + ' <span>/ ' + esc(p.unit) + '</span>';
    if (p.old_price && Number(p.old_price) > Number(p.price)) {
      priceHtml = '<s class="old-price">' + egp(p.old_price) + '</s> ' + priceHtml +
        ' <span class="offer-badge">خصم ' + Math.round((1 - p.price / p.old_price) * 100) + '%</span>';
    }
    card.innerHTML =
      '<div class="thumb">' + imgHtml + '</div>' +
      '<div class="info">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="price">' + priceHtml + '</p>' +
        (colors.length ? '<div class="color-chips"></div>' : '') +
        '<div class="row"></div>' +
      '</div>';
    var thumbImg = card.querySelector('.thumb img');
    if (thumbImg) {
      thumbImg.addEventListener('click', function () { openLightbox(p.img, p.name); });
    }
    if (colors.length) {
      var chipBox = card.querySelector('.color-chips');
      colors.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'color-chip' + (state.selColor[p.id] === c ? ' active' : '');
        b.textContent = c;
        b.addEventListener('click', function () { state.selColor[p.id] = c; renderGrid(); });
        chipBox.appendChild(b);
      });
    }
    var row = card.querySelector('.row');
    if (qty === 0) {
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'btn primary'; add.textContent = 'أضف للسلة';
      add.addEventListener('click', function () { state.editing[key] = true; setQty(key, 1); });
      row.appendChild(add);
    } else if (state.editing[key]) {
      row.appendChild(stepper(key, qty));
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn primary done-btn'; ok.textContent = 'تم';
      ok.addEventListener('click', function () {
        delete state.editing[key];
        renderGrid();
        toast('اتضاف للسلة: ' + qty + ' × ' + p.name);
      });
      row.appendChild(ok);
    } else {
      var inCart = document.createElement('div');
      inCart.className = 'in-cart';
      inCart.innerHTML = '<span>✓ في السلة: <b>' + qty + '</b></span>';
      var ed = document.createElement('button');
      ed.type = 'button'; ed.className = 'btn ghost small'; ed.textContent = 'تعديل';
      ed.addEventListener('click', function () { state.editing[key] = true; renderGrid(); });
      inCart.appendChild(ed);
      row.appendChild(inCart);
    }
    return card;
  }
  function renderHomeSections() {
    var atHome = state.cat === 'all' && !state.search;
    var offers = atHome ? state.products.filter(function (p) { return p.is_offer && p.in_stock; }) : [];
    var oSec = $('offers-sec');
    if (oSec) {
      oSec.hidden = !offers.length;
      var oRow = $('offers-row');
      oRow.innerHTML = '';
      offers.forEach(function (p) { oRow.appendChild(buildCard(p)); });
    }
    var bSec = $('best-sec');
    if (bSec) {
      var best = [];
      if (atHome && state.topSellers.length) {
        state.topSellers.forEach(function (t) {
          var p = state.products.filter(function (x) { return norm(x.name) === norm(t.name) && x.in_stock; })[0];
          if (p && best.indexOf(p) < 0) best.push(p);
        });
      }
      bSec.hidden = !best.length;
      var bRow = $('best-row');
      bRow.innerHTML = '';
      best.forEach(function (p) { bRow.appendChild(buildCard(p)); });
    }
  }
  function loadBest() {
    if (!sb.rpc) return;
    sb.rpc('top_products', { lim: 8 }).then(function (r) {
      if (r.error || !r.data) { state.topSellers = []; }
      else { state.topSellers = r.data; }
      renderHomeSections();
    }).catch(function () { state.topSellers = []; });
  }
  function renderGrid() {
    var grid = $('grid');
    grid.innerHTML = '';
    var q = norm(state.search);
    var cc = $('cat-cards'); if (cc) cc.hidden = !!q;
    var fl = $('filters'); if (fl) fl.hidden = !!q;
    var shown = state.products.filter(function (p) {
      if (!p.in_stock) return false;
      if (q) return norm(p.name).indexOf(q) >= 0;
      if (state.cat === 'all') return true;
      if (state.cat.indexOf('s:') === 0) return p.category_id === state.cat.slice(2);
      if (state.cat.indexOf('p:') === 0) {
        var pid = state.cat.slice(2);
        if (p.category_id === pid) return true;
        var pc = catById(p.category_id);
        return !!pc && pc.parent_id === pid;
      }
      return p.cat === state.cat;
    });
    renderHomeSections();
    if (!shown.length) {
      grid.innerHTML = q ? '<p class="empty">مفيش نتائج لـ"' + esc(state.search) + '".</p>' : '<p class="empty">مفيش منتجات متاحة هنا دلوقتي.</p>';
      return;
    }
    shown.forEach(function (p) { grid.appendChild(buildCard(p)); });
  }
  function stepper(id, qty) {
    var wrap = document.createElement('div');
    wrap.className = 'stepper';
    var minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'أنقص');
    var val = document.createElement('span'); val.textContent = qty;
    var plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'زود');
    plus.addEventListener('click', function () { setQty(id, qty + 1); });
    minus.addEventListener('click', function () { setQty(id, qty - 1); });
    wrap.appendChild(minus); wrap.appendChild(val); wrap.appendChild(plus);
    return wrap;
  }
  function renderCart() {
    updateCartBadge();
    var ls = lines();
    if (!$('order-done').hidden) return;
    $('cart-empty').hidden = ls.length > 0;
    $('cart-body').hidden = ls.length === 0;
    if (!ls.length) return;
    var ul = $('lines');
    ul.innerHTML = '';
    var total = 0;
    ls.forEach(function (l, idx) {
      total += l.total;
      var key = ckey(l.p.id, l.color);
      var li = document.createElement('li');
      li.className = 'line';
      var colors = (l.p.colors || []).filter(Boolean);
      var colorHtml = colors.length
        ? '<select class="l-color-sel">' + colors.map(function (c) { return '<option' + (c === l.color ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
        : '';
      li.innerHTML =
        '<div class="line-top"><span class="l-num">' + (idx + 1) + '</span><span class="l-name">' + esc(l.p.name) + '</span>' +
        '<button type="button" class="l-del" aria-label="احذف">✕</button></div>' +
        '<div class="line-mid">' + colorHtml + '<span class="l-unit">' + egp(l.p.price) + ' / ' + esc(l.p.unit) + '</span></div>' +
        '<div class="line-bot"><span class="l-step"></span><strong>' + egp(l.total) + '</strong></div>';
      li.querySelector('.l-step').appendChild(stepper(key, l.qty));
      li.querySelector('.l-del').addEventListener('click', function () { setQty(key, 0); });
      var sel = li.querySelector('.l-color-sel');
      if (sel) {
        sel.addEventListener('change', function () {
          var newKey = ckey(l.p.id, sel.value);
          var qty = state.cart[key] || 0;
          delete state.cart[key];
          state.cart[newKey] = (state.cart[newKey] || 0) + qty;
          state.selColor[l.p.id] = sel.value;
          save('dw-cart', state.cart);
          renderGrid();
          renderCart();
        });
      }
      ul.appendChild(li);
    });
    $('grand-total').textContent = egp(total);
    var cnt = $('cart-count'); if (cnt) cnt.textContent = ls.length + ' صنف';
    var balEl = $('pay-wallet-balance');
    if (balEl && state.user) {
      fetchBalance(state.user.id).then(function (b) {
        balEl.textContent = '(رصيدك: ' + egp(b) + ')';
      });
    }
  }

  /* ---------- بيانات العميل المحفوظة ---------- */
  var PROF_FIELDS = { name: 'f-workshop', phone: 'f-phone', city: 'f-city', address: 'f-address', landmark: 'f-landmark' };
  function profKey() { return 'dw-profile-' + (state.user ? state.user.id : ''); }
  function profValid(p) { return p && p.name && /^01[0-9]{9}$/.test(String(p.phone || '')) && p.city && p.address; }
  function readProf() {
    var p = {};
    Object.keys(PROF_FIELDS).forEach(function (k) { p[k] = $(PROF_FIELDS[k]).value.trim(); });
    p.phone = p.phone.replace(/[^0-9]/g, '');
    return p;
  }
  function showProfSummary() {
    var p = readProf();
    var ok = profValid(p) && !state.profEditing;
    $('cust-summary').hidden = !ok;
    $('cust-fields').hidden = ok;
    if (ok) $('cust-text').textContent = p.name + ' · ' + p.phone + ' · ' + p.city + ' — ' + p.address + (p.landmark ? ' (' + p.landmark + ')' : '');
  }
  function loadProf() {
    if (!state.user) return;
    var p = load(profKey(), null);
    var md = state.user.user_metadata && state.user.user_metadata.profile;
    if (md && (!p || !profValid(p))) p = md;
    p = p || {};
    if (!p.name) p.name = (state.user.user_metadata && state.user.user_metadata.full_name) || load('dw-workshop', '') || '';
    Object.keys(PROF_FIELDS).forEach(function (k) { $(PROF_FIELDS[k]).value = p[k] || ''; });
    state.profEditing = false;
    showProfSummary();
  }
  function saveProf(remote) {
    if (!state.user) return;
    var p = readProf();
    save(profKey(), p);
    if (remote && profValid(p) && sb.auth.updateUser) {
      sb.auth.updateUser({ data: { profile: p } }).then(function () {}).catch(function () {});
    }
  }
  function orderPayload() {
    var ls = lines();
    var city = $('f-city').value.trim();
    var addr = $('f-address').value.trim();
    var landmark = $('f-landmark').value.trim();
    var address = city + ' — ' + addr + (landmark ? ' (علامة مميزة: ' + landmark + ')' : '');
    return {
      customer_name: $('f-workshop').value.trim(),
      phone: $('f-phone').value.replace(/[^0-9]/g, ''),
      city: city,
      address: address,
      notes: $('f-notes').value.trim(),
      items: ls.map(function (l) {
        return { name: l.p.name, qty: l.qty, unit: l.p.unit, price: l.p.price, total: l.total, color: l.color || null };
      }),
      total: ls.reduce(function (s, l) { return s + l.total; }, 0)
    };
  }
  function sendOrder() {
    var payload = orderPayload();
    var hint = $('send-hint');
    if (!payload.customer_name) { hint.textContent = 'اكتب الاسم الأول.'; return; }
    if (!/^01[0-9]{9}$/.test(payload.phone)) { hint.textContent = 'اكتب رقم موبايل صح: 11 رقم يبدأ بـ 01.'; return; }
    if (!payload.city) { hint.textContent = 'اكتب المدينة / المنطقة.'; return; }
    if (!$('f-address').value.trim()) { hint.textContent = 'اكتب عنوان التوصيل بالتفصيل.'; return; }
    hint.textContent = '';
    var payMethod = (document.querySelector('input[name="pay-method"]:checked') || {}).value || 'cod';
    var btn = $('send-order');
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال…';
    if (payMethod === 'wallet') {
      Promise.all([fetchBalance(state.user.id), fetchLimit(state.user.id)]).then(function (res) {
        var bal = res[0], limit = res[1];
        if (bal - payload.total < -limit) {
          btn.disabled = false;
          btn.textContent = 'إرسال الطلب';
          hint.textContent = 'الرصيد مش كافي حتى مع الآجل (رصيدك: ' + egp(bal) + '، حد الآجل: ' + egp(limit) + '). اشحن رصيدك أو اختار الدفع عند الاستلام.';
          return;
        }
        doInsert(payload, payMethod, btn, hint);
      });
      return;
    }
    doInsert(payload, payMethod, btn, hint);
  }
  function doInsert(payload, payMethod, btn, hint) {
    sb.from('orders').insert({
      customer_name: payload.customer_name,
      phone: payload.phone,
      address: payload.address,
      notes: payload.notes || null,
      items: payload.items,
      total: payload.total,
      pay_method: payMethod
    }).select('id').single()
      .then(function (r) {
        btn.disabled = false;
        btn.textContent = 'إرسال الطلب';
        if (r.error) { hint.textContent = 'الطلب ما اتبعتش. جرّب تاني.'; return; }
        if (payMethod === 'wallet') {
          sb.from('wallet_ledger').insert({
            kind: 'order', status: 'applied', amount: -payload.total,
            order_id: r.data.id, customer_name: payload.customer_name
          }).then(function (w) {
            if (w.error) hint.textContent = 'الطلب اتسجل بس في مشكلة في خصم الرصيد، كلم صاحب الورشة.';
          });
        }
        state.cart = {};
        save('dw-cart', state.cart);
        saveProf(true);
        renderGrid();
        updateCartBadge();
        var id = String(r.data.id).slice(0, 8);
        $('cart-body').hidden = true;
        $('cart-empty').hidden = true;
        $('order-done').hidden = false;
        $('order-id').textContent = id;
        toast('اتبعت الطلب');
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'إرسال الطلب';
        hint.textContent = 'الطلب ما اتبعتش. جرّب تاني.';
      });
  }

  /* ---------- الإدارة ---------- */
  function openAdmin() {
    $('catalog-view').hidden = true;
    $('orders-view').hidden = true;
    $('wallet-view').hidden = true;
    $('admin-view').hidden = false;
    setAdminTab('orders');
    window.scrollTo(0, 0);
    pushNav();
  }
  function closeAdmin() {
    history.back();
    loadProducts();
  }
  function setAdminTab(tab) {
    state.adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    $('admin-orders').hidden = tab !== 'orders';
    $('admin-wallets').hidden = tab !== 'wallets';
    $('admin-cats').hidden = tab !== 'cats';
    $('admin-products').hidden = tab !== 'products';
    $('admin-texts').hidden = tab !== 'texts';
    $('admin-books').hidden = tab !== 'books';
    if (tab === 'orders') renderAdminOrders();
    if (tab === 'wallets') renderAdminWallets();
    if (tab === 'cats') renderAdminCats();
    if (tab === 'products') renderAdminProducts();
    if (tab === 'texts') fillTextsForm();
    if (tab === 'books') bkRender();
  }

  function renderAdminOrders() {
    refreshOrderBadge();
    var box = $('admin-orders');
    box.innerHTML = '<p class="empty">بيتم التحميل…</p>';
    sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (r) {
        if (r.error) { box.innerHTML = '<p class="empty">مشكلة في تحميل الطلبات.</p>'; return; }
        var orders = r.data || [];
        if (!orders.length) { box.innerHTML = '<p class="empty">مفيش طلبات لسه.</p>'; return; }
        box.innerHTML = '';
        orders.forEach(function (o) {
          var card = document.createElement('article');
          card.className = 'order-card' + (o.status === 'done' ? ' done' : '') + (o.status === 'cancelled' ? ' cancelled' : '');
          var when = new Date(o.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
          var items = (o.items || []).map(function (it) {
            return '<li>' + esc(it.name) + (it.color ? ' (' + esc(it.color) + ')' : '') + ' — ' + it.qty + ' ' + esc(it.unit || '') + ' × ' + egp(it.price) + '</li>';
          }).join('');
          card.innerHTML =
            '<div class="order-top"><strong>' + esc(o.customer_name) + '</strong>' +
            '<span class="order-when">' + when + '</span></div>' +
            '<div class="order-phone" dir="ltr">' + esc(o.phone) + '</div>' +
            (o.address ? '<div class="order-address">' + esc(o.address) + '</div>' : '') +
            (o.pay_method === 'wallet' ? '<div class="order-pay">الدفع: من المحفظة</div>' : '') +
            (o.notes ? '<div class="order-notes">' + esc(o.notes) + '</div>' : '') +
            '<ul class="order-items">' + items + '</ul>' +
            '<div class="order-foot"><strong>' + egp(o.total) + '</strong>' +
            (o.status === 'cancelled'
              ? '<span class="order-status s-cancelled">ملغي من العميل</span></div>'
              : '<button type="button" class="btn small ' + (o.status === 'done' ? 'ghost' : 'primary') + '">' +
                (o.status === 'done' ? 'تم ✓ — اضغط للتراجع' : 'تحديد كمُنفَّذ') + '</button></div>');
          var toggleBtn = card.querySelector('button');
          if (toggleBtn) toggleBtn.addEventListener('click', function () {
            var next = o.status === 'done' ? 'new' : 'done';
            sb.from('orders').update({ status: next }).eq('id', o.id).then(function (u) {
              if (u.error) { toast('مشكلة في التحديث'); return; }
              var bk = next === 'done' ? booksDeliverOrder(o) : booksUndoOrder(o.id);
              bk.then(function () { if (next === 'done') toast('اتخصم من المخزن واتسجل في الحسابات'); })
                .catch(function () { toast('الأوردر اتحدث بس مشكلة في المخزن، راجع الأرصدة'); });
              renderAdminOrders();
              refreshOrderBadge();
            });
          });
          box.appendChild(card);
        });
      })
      .catch(function () { box.innerHTML = '<p class="empty">مشكلة في تحميل الطلبات.</p>'; });
  }

  function renderAdminProducts() {
    var box = $('product-list');
    box.innerHTML = '<p class="empty">بيتم التحميل…</p>';
    sb.from('products').select('*').order('sort').order('created_at')
      .then(function (r) {
        if (r.error) { box.innerHTML = '<p class="empty">مشكلة في تحميل المنتجات.</p>'; return; }
        var list = r.data || [];
        box.innerHTML = list.length ? '' : '<p class="empty">مفيش منتجات. ضيف أول منتج.</p>';
        list.forEach(function (p) {
          var row = document.createElement('div');
          row.className = 'product-row' + (p.in_stock ? '' : ' out');
          row.innerHTML =
            '<div class="product-main"><strong>' + esc(p.name) + '</strong>' +
            '<span>' + egp(p.price) + ' / ' + esc(p.unit) + ' — ' + esc(catLabel(p.cat)) + '</span></div>' +
            '<label class="check small"><input type="checkbox" ' + (p.in_stock ? 'checked' : '') + '> متاح</label>' +
            '<button type="button" class="btn ghost small edit">تعديل</button>' +
            '<button type="button" class="btn ghost small danger del">حذف</button>';
          row.querySelector('input[type=checkbox]').addEventListener('change', function (ev) {
            sb.from('products').update({ in_stock: ev.target.checked }).eq('id', p.id).then(function (u) {
              if (u.error) { toast('مشكلة في التحديث'); return; }
              toast(ev.target.checked ? 'المنتج بقى متاح' : 'المنتج اتحفظ كغير متاح');
              renderAdminProducts();
            });
          });
          row.querySelector('.edit').addEventListener('click', function () { openProductForm(p); });
          row.querySelector('.del').addEventListener('click', function () {
            if (!confirm('تمسح "' + p.name + '" نهائي؟')) return;
            sb.from('products').delete().eq('id', p.id).then(function (d) {
              if (d.error) { toast('مشكلة في المسح'); return; }
              toast('اتمسح المنتج');
              renderAdminProducts();
            });
          });
          box.appendChild(row);
        });
      })
      .catch(function () { box.innerHTML = '<p class="empty">مشكلة في تحميل المنتجات.</p>'; });
  }
  function fillImageOptions() {
    var sel = $('p-img');
    sel.innerHTML = '<option value="">بدون صورة</option>';
    KNOWN_IMAGES.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    });
  }
  function openProductForm(p) {
    $('product-form').hidden = false;
    $('product-form-title').textContent = p ? 'تعديل منتج' : 'منتج جديد';
    $('p-id').value = p ? p.id : '';
    $('p-name').value = p ? p.name : '';
    $('p-price').value = p ? p.price : '';
    $('p-unit').value = p ? p.unit : 'قطعة';
    fillProductCatOptions();
    $('p-cat').value = p && p.category_id ? p.category_id : '';
    $('p-img').value = p && p.img ? p.img : '';
    $('p-stock').checked = p ? !!p.in_stock : true;
    $('p-colors').value = p && p.colors ? p.colors.join('، ') : '';
    $('p-offer').checked = !!(p && p.is_offer);
    $('p-oldprice').value = p && p.old_price ? p.old_price : '';
    $('p-name').focus();
  }
  function saveProduct() {
    var id = $('p-id').value;
    var data = {
      name: $('p-name').value.trim(),
      price: Number($('p-price').value) || 0,
      unit: $('p-unit').value.trim() || 'قطعة',
      category_id: $('p-cat').value || null,
      img: $('p-img').value || null,
      in_stock: $('p-stock').checked,
      colors: $('p-colors').value.split(/[،,]/).map(function (s) { return s.trim(); }).filter(Boolean),
      is_offer: $('p-offer').checked,
      old_price: Number($('p-oldprice').value) || null
    };
    if (!data.name) { toast('اكتب اسم المنتج'); return; }
    var q = id
      ? sb.from('products').update(data).eq('id', id)
      : sb.from('products').insert(data);
    q.then(function (r) {
      if (r.error) { toast('مشكلة في الحفظ: ' + r.error.message); return; }
      toast('اتحفظ المنتج');
      $('product-form').hidden = true;
      renderAdminProducts();
    }).catch(function () { toast('مشكلة في الحفظ'); });
  }

  function fillProductCatOptions() {
    var sel = $('p-cat');
    sel.innerHTML = '<option value="">بدون قسم</option>';
    parentCats().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
      subCats(c.id).forEach(function (s) {
        var so = document.createElement('option');
        so.value = s.id; so.textContent = '— ' + s.name;
        sel.appendChild(so);
      });
    });
  }

  /* ---------- أقسام الإدارة ---------- */
  function renderAdminCats() {
    var box = $('cat-list');
    box.innerHTML = state.categories.length ? '' : '<p class="empty">مفيش أقسام. ضيف أول قسم.</p>';
    parentCats().forEach(function (c) {
      box.appendChild(catRow(c, false));
      subCats(c.id).forEach(function (s) { box.appendChild(catRow(s, true)); });
    });
  }
  function catRow(c, isSub) {
    var row = document.createElement('div');
    row.className = 'product-row' + (isSub ? ' sub' : '');
    row.innerHTML =
      '<div class="product-main"><strong>' + (isSub ? '— ' : '') + esc(c.name) + '</strong>' +
      '<span>' + (c.img ? esc(c.img) : 'بدون صورة') + ' · ترتيب ' + (c.sort || 0) + '</span></div>' +
      '<button type="button" class="btn ghost small edit">تعديل</button>' +
      '<button type="button" class="btn ghost small danger del">حذف</button>';
    row.querySelector('.edit').addEventListener('click', function () { openCatForm(c); });
    row.querySelector('.del').addEventListener('click', function () {
      if (!confirm('حذف قسم "' + c.name + '"؟ المنتجات اللي فيه هتفضل من غير قسم.')) return;
      sb.from('categories').delete().eq('id', c.id).then(function (r) {
        if (r.error) { toast('مشكلة في الحذف'); return; }
        toast('اتحذف القسم');
        loadCategories().then(renderAdminCats);
      });
    });
    return row;
  }
  function openCatForm(c) {
    $('cat-form').hidden = false;
    $('cat-form-title').textContent = c ? 'تعديل قسم' : 'قسم جديد';
    $('c-id').value = c ? c.id : '';
    $('c-name').value = c ? c.name : '';
    var ps = $('c-parent');
    ps.innerHTML = '<option value="">— قسم رئيسي —</option>';
    parentCats().forEach(function (p) {
      if (c && p.id === c.id) return;
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      ps.appendChild(o);
    });
    ps.value = c && c.parent_id ? c.parent_id : '';
    var is = $('c-img');
    is.innerHTML = '<option value="">بدون صورة</option>';
    KNOWN_IMAGES.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f; o.textContent = f;
      is.appendChild(o);
    });
    is.value = c && c.img ? c.img : '';
    $('c-sort').value = c ? (c.sort || 0) : (state.categories.length + 1);
    $('c-name').focus();
  }
  function saveCat() {
    var id = $('c-id').value;
    var data = {
      name: $('c-name').value.trim(),
      parent_id: $('c-parent').value || null,
      img: $('c-img').value || null,
      sort: Number($('c-sort').value) || 0
    };
    if (!data.name) { toast('اكتب اسم القسم'); return; }
    var q = id
      ? sb.from('categories').update(data).eq('id', id)
      : sb.from('categories').insert(data);
    q.then(function (r) {
      if (r.error) { toast('مشكلة في الحفظ: ' + r.error.message); return; }
      toast('اتحفظ القسم');
      $('cat-form').hidden = true;
      loadCategories().then(renderAdminCats);
    }).catch(function () { toast('مشكلة في الحفظ'); });
  }

  function fillTextsForm() {
    $('t-welcome').value = state.texts.welcome || '';
    $('t-description').value = state.texts.description || '';
    $('t-note').value = state.texts.note || '';
    $('t-footer').value = state.texts.footer || '';
    $('t-payment').value = (state.texts.payment || '').trim() || DEFAULT_PAY_NUMBER;
    $('t-whatsapp').value = (state.texts.whatsapp || '').replace(/\D/g, '') || '201066683195';
  }
  function saveTexts() {
    var value = {
      welcome: $('t-welcome').value.trim(),
      description: $('t-description').value.trim(),
      note: $('t-note').value.trim(),
      footer: $('t-footer').value.trim(),
      payment: $('t-payment').value.trim() || DEFAULT_PAY_NUMBER,
      whatsapp: $('t-whatsapp').value.replace(/\D/g, '') || '201066683195'
    };
    sb.from('settings').upsert({ id: 'app', value: value })
      .then(function (r) {
        if (r.error) { toast('مشكلة في الحفظ: ' + r.error.message); return; }
        state.texts = value;
        applyTexts();
        toast('اتحفظت النصوص');
      })
      .catch(function () { toast('مشكلة في الحفظ'); });
  }

  /* ---------- المخزن والحسابات (للمالك بس) ---------- */
  var BK = { tab: 'stock', moves: [], cash: [], low: 5, pend: [], month: '' };
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function bkKey(name, color) { return norm(name) + '|' + (color || ''); }
  function loadBooks() {
    return Promise.all([
      sb.from('stock_moves').select('*').order('move_date').order('created_at').limit(5000),
      sb.from('books_cash').select('*').order('move_date').order('created_at').limit(5000),
      sb.from('books_settings').select('low_stock').eq('id', 1).maybeSingle()
    ]).then(function (r) {
      if (r[0].error || r[1].error) throw new Error('books');
      BK.moves = r[0].data || [];
      BK.cash = r[1].data || [];
      if (r[2].data && r[2].data.low_stock != null) BK.low = Number(r[2].data.low_stock);
    });
  }
  function bkStock(moves) {
    var st = {};
    moves.forEach(function (m) {
      var k = bkKey(m.product_name, m.color);
      var s = st[k] || (st[k] = { name: m.product_name, color: m.color || null, qty: 0, cq: 0, cs: 0, lastSale: null, first: m.move_date });
      var q = Number(m.qty);
      s.qty += q;
      if (m.kind !== 'sale' && q > 0 && m.unit_cost != null) { s.cq += q; s.cs += q * Number(m.unit_cost); }
      if (m.kind === 'sale' && (!s.lastSale || m.move_date > s.lastSale)) s.lastSale = m.move_date;
      if (m.move_date < s.first) s.first = m.move_date;
    });
    Object.keys(st).forEach(function (k) { var s = st[k]; s.avg = s.cq ? s.cs / s.cq : 0; s.value = Math.max(s.qty, 0) * s.avg; });
    return st;
  }
  function bkCashTotal() { return BK.cash.reduce(function (s, c) { return s + Number(c.amount); }, 0); }
  function bkAvg(name, color) {
    var s = bkStock(BK.moves)[bkKey(name, color)];
    return s && s.cq ? s.avg : null;
  }
  function productByName(name) {
    var n = norm(name);
    for (var i = 0; i < state.products.length; i++) if (norm(state.products[i].name) === n) return state.products[i];
    return null;
  }
  // لما الأوردر يتحدد "منفذ": يخصم من المخزن ويزود الكاش. التراجع بيلغيهم.
  function booksUndoOrder(orderId) {
    return sb.from('stock_moves').delete().eq('order_id', orderId).eq('kind', 'sale').then(function (a) {
      if (a.error) throw a.error;
      return sb.from('books_cash').delete().eq('order_id', orderId).eq('kind', 'sale');
    }).then(function (b) { if (b.error) throw b.error; });
  }
  function booksDeliverOrder(o) {
    return loadBooks().then(function () { return booksUndoOrder(o.id); }).then(function () { return loadBooks(); }).then(function () {
      var rows = (o.items || []).map(function (it) {
        var p = productByName(it.name);
        return {
          kind: 'sale', product_id: p ? p.id : null, product_name: it.name, color: it.color || null,
          qty: -Number(it.qty), unit_cost: bkAvg(it.name, it.color || null), unit_price: Number(it.price),
          order_id: o.id, move_date: todayStr()
        };
      });
      return sb.from('stock_moves').insert(rows).then(function (a) {
        if (a.error) throw a.error;
        return sb.from('books_cash').insert({ kind: 'sale', amount: Number(o.total), order_id: o.id, move_date: todayStr(), note: 'أوردر ' + String(o.id).slice(0, 8) });
      }).then(function (b) { if (b.error) throw b.error; });
    });
  }
  function bkRender() {
    var box = $('admin-books');
    box.innerHTML = '<p class="empty">بيتم التحميل…</p>';
    loadBooks().then(function () {
      var tabs = [['stock', 'الأرصدة'], ['buy', 'شراء'], ['rep', 'التقارير'], ['set', 'إعدادات']];
      var h = '<nav class="bk-tabs">' + tabs.map(function (t) {
        return '<button type="button" class="bk-tab' + (BK.tab === t[0] ? ' active' : '') + '" data-bk="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</nav><div id="bk-body"></div>';
      box.innerHTML = h;
      box.querySelectorAll('.bk-tab').forEach(function (b) {
        b.addEventListener('click', function () { BK.tab = b.getAttribute('data-bk'); bkRender(); });
      });
      var body = $('bk-body');
      if (BK.tab === 'stock') bkStockView(body);
      else if (BK.tab === 'buy') bkBuyView(body);
      else if (BK.tab === 'rep') bkRepView(body);
      else bkSetView(body);
    }).catch(function () { box.innerHTML = '<p class="empty">مشكلة في تحميل المخزن. جرب تاني.</p>'; });
  }
  function bkSummaryHtml(st) {
    var cash = bkCashTotal();
    var sv = 0; Object.keys(st).forEach(function (k) { sv += st[k].value; });
    return '<div class="bk-sum"><div><span>الكاش</span><strong>' + egp(cash) + '</strong></div>' +
      '<div><span>قيمة المخزن</span><strong>' + egp(sv) + '</strong></div>' +
      '<div><span>الإجمالي</span><strong>' + egp(cash + sv) + '</strong></div></div>';
  }
  function bkStockView(body) {
    var st = bkStock(BK.moves);
    var list = Object.keys(st).map(function (k) { return st[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    var lows = list.filter(function (s) { return s.qty <= BK.low; });
    var h = bkSummaryHtml(st);
    if (lows.length) h += '<div class="bk-alert">⚠ تحت الحد (' + BK.low + ' أو أقل): ' + lows.map(function (s) { return esc(s.name + (s.color ? ' ' + s.color : '')) + ' (' + s.qty + ')'; }).join('، ') + '</div>';
    if (!list.length) h += '<p class="empty">المخزن فاضي. سجل أول شراء من تبويب "شراء".</p>';
    else {
      h += '<ul class="bk-list">' + list.map(function (s) {
        return '<li class="' + (s.qty <= BK.low ? 'low' : '') + '"><div><strong>' + esc(s.name) + '</strong>' + (s.color ? ' <small>' + esc(s.color) + '</small>' : '') +
          '<small>متوسط التكلفة: ' + (s.cq ? egp(Math.round(s.avg * 100) / 100) : 'مجهولة') + '</small></div>' +
          '<div class="bk-qty">' + s.qty + '<small>' + egp(Math.round(s.value)) + '</small></div></li>';
      }).join('') + '</ul>';
    }
    body.innerHTML = h;
  }
  function bkProdOptions() {
    return state.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
  }
  function bkBuyView(body) {
    var h = '<div class="bk-form"><h3>إضافة للمخزن</h3>' +
      '<label class="field">المنتج<select id="bb-prod">' + bkProdOptions() + '</select></label>' +
      '<label class="field" id="bb-color-wrap">اللون<select id="bb-color"></select></label>' +
      '<label class="field">الكمية<input id="bb-qty" type="number" inputmode="decimal" min="0" step="any"></label>' +
      '<label class="field">سعر شراء القطعة (سيبه فاضي لو هتكتب إجمالي الفاتورة تحت)<input id="bb-cost" type="number" inputmode="decimal" min="0" step="any"></label>' +
      '<button id="bb-add" class="btn ghost" type="button">+ أضف الصنف للفاتورة</button>' +
      '<ul id="bb-pend" class="bk-list"></ul>' +
      '<label class="field">إجمالي اللي دفعته للفاتورة كلها (اختياري: بيتوزع على الأصناف بنسبة سعر بيعها)<input id="bb-total" type="number" inputmode="decimal" min="0" step="any"></label>' +
      '<label class="field">التاريخ<input id="bb-date" type="date" value="' + todayStr() + '"></label>' +
      '<label class="check"><input id="bb-open" type="checkbox"> ده رصيد موجود عندي من قبل (مش بيخصم من الكاش)</label>' +
      '<button id="bb-save" class="btn primary" type="button">سجّل الشراء</button><p id="bb-hint" class="hint"></p></div>';
    body.innerHTML = h;
    function fillColors() {
      var p = productById($('bb-prod').value);
      var cols = ((p && p.colors) || []).filter(Boolean);
      $('bb-color-wrap').hidden = !cols.length;
      $('bb-color').innerHTML = cols.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    }
    function drawPend() {
      $('bb-pend').innerHTML = BK.pend.map(function (l, i) {
        return '<li><div><strong>' + esc(l.name) + '</strong>' + (l.color ? ' <small>' + esc(l.color) + '</small>' : '') +
          '<small>' + l.qty + ' قطعة' + (l.cost != null ? ' × ' + egp(l.cost) : '') + '</small></div><button type="button" class="l-del" data-i="' + i + '">✕</button></li>';
      }).join('');
      $('bb-pend').querySelectorAll('.l-del').forEach(function (b) {
        b.addEventListener('click', function () { BK.pend.splice(Number(b.getAttribute('data-i')), 1); drawPend(); });
      });
    }
    fillColors(); drawPend();
    $('bb-prod').addEventListener('change', fillColors);
    $('bb-add').addEventListener('click', function () {
      var p = productById($('bb-prod').value);
      var qty = Number($('bb-qty').value);
      var costRaw = $('bb-cost').value;
      var hint = $('bb-hint');
      if (!p || !(qty > 0)) { hint.textContent = 'اكتب الكمية.'; return; }
      BK.pend.push({ pid: p.id, name: p.name, price: Number(p.price), color: $('bb-color-wrap').hidden ? null : $('bb-color').value, qty: qty, cost: costRaw === '' ? null : Number(costRaw) });
      $('bb-qty').value = ''; $('bb-cost').value = ''; hint.textContent = '';
      drawPend();
    });
    $('bb-save').addEventListener('click', function () { bkSavePurchase(); });
  }
  function bkSavePurchase() {
    var hint = $('bb-hint');
    var lines = BK.pend.slice();
    if (!lines.length) { hint.textContent = 'ضيف صنف واحد على الأقل بزرار "أضف الصنف".'; return; }
    var total = Number($('bb-total').value);
    if (total > 0) {
      var w = lines.reduce(function (s, l) { return s + l.qty * (l.price || 1); }, 0) || 1;
      lines.forEach(function (l) { l.cost = Math.round((total * (l.qty * (l.price || 1)) / w / l.qty) * 100) / 100; });
    } else if (lines.some(function (l) { return l.cost == null || isNaN(l.cost); })) {
      hint.textContent = 'اكتب سعر الشراء لكل صنف، أو اكتب إجمالي الفاتورة.'; return;
    }
    var opening = $('bb-open').checked;
    var date = $('bb-date').value || todayStr();
    var batch = uuid();
    var cost = lines.reduce(function (s, l) { return s + l.qty * l.cost; }, 0);
    var btn = $('bb-save'); btn.disabled = true;
    var rows = lines.map(function (l) {
      return { kind: opening ? 'adjust' : 'purchase', product_id: l.pid, product_name: l.name, color: l.color, qty: l.qty, unit_cost: l.cost, batch_id: batch, move_date: date };
    });
    var cash = bkCashTotal();
    var topup = !opening && cash < cost ? Math.round((cost - cash) * 100) / 100 : 0;
    var p = Promise.resolve({});
    if (topup > 0) p = sb.from('books_cash').insert({ kind: 'capital_add', amount: topup, batch_id: batch, move_date: date, note: 'زيادة رأس مال لتغطية الشراء' });
    p.then(function (a) {
      if (a.error) throw a.error;
      if (!opening) return sb.from('books_cash').insert({ kind: 'purchase', amount: -cost, batch_id: batch, move_date: date, note: 'شراء' });
      return {};
    }).then(function (b) {
      if (b.error) throw b.error;
      return sb.from('stock_moves').insert(rows);
    }).then(function (c) {
      btn.disabled = false;
      if (c.error) throw c.error;
      BK.pend = [];
      toast(topup > 0 ? 'اتسجل الشراء وزيادة رأس المال ' + egp(topup) : 'اتسجل الشراء');
      BK.tab = 'stock'; bkRender();
    }).catch(function () { btn.disabled = false; hint.textContent = 'مشكلة في الحفظ. راجع الأرصدة قبل ما تعيد.'; });
  }
  function bkMonthsList() {
    var set = {};
    BK.moves.forEach(function (m) { if (m.kind === 'sale') set[String(m.move_date).slice(0, 7)] = 1; });
    return Object.keys(set).sort().reverse();
  }
  function bkRepView(body) {
    var months = bkMonthsList();
    var sel = BK.month || 'all';
    var sales = BK.moves.filter(function (m) { return m.kind === 'sale' && (sel === 'all' || String(m.move_date).slice(0, 7) === sel || (sel.length === 4 && String(m.move_date).slice(0, 4) === sel)); });
    var years = {}; months.forEach(function (m) { years[m.slice(0, 4)] = 1; });
    var opts = '<option value="all"' + (sel === 'all' ? ' selected' : '') + '>كل الفترة</option>' +
      Object.keys(years).sort().reverse().map(function (y) { return '<option value="' + y + '"' + (sel === y ? ' selected' : '') + '>سنة ' + y + '</option>'; }).join('') +
      months.map(function (m) { return '<option value="' + m + '"' + (sel === m ? ' selected' : '') + '>شهر ' + m + '</option>'; }).join('');
    var per = {}; var unknown = 0; var rev = 0, cogs = 0;
    sales.forEach(function (m) {
      var q = -Number(m.qty);
      var r = q * Number(m.unit_price || 0);
      var c = q * Number(m.unit_cost || 0);
      if (m.unit_cost == null) unknown++;
      var p = per[m.product_name] || (per[m.product_name] = { name: m.product_name, qty: 0, rev: 0, cogs: 0, unk: false });
      p.qty += q; p.rev += r; p.cogs += c; if (m.unit_cost == null) p.unk = true;
      rev += r; cogs += c;
    });
    var arr = Object.keys(per).map(function (k) { var p = per[k]; p.profit = p.rev - p.cogs; p.margin = p.rev ? p.profit / p.rev * 100 : 0; return p; });
    var h = '<label class="field">الفترة<select id="rp-sel">' + opts + '</select></label>';
    h += '<div class="bk-sum"><div><span>مبيعات</span><strong>' + egp(Math.round(rev)) + '</strong></div><div><span>تكلفتها</span><strong>' + egp(Math.round(cogs)) + '</strong></div><div><span>الربح</span><strong>' + egp(Math.round(rev - cogs)) + '</strong></div></div>';
    if (unknown) h += '<div class="bk-alert">فيه ' + unknown + ' صنف اتباع من غير تكلفة شراء مسجلة، فالربح بتاعه محسوب عالي. سجل شراءه.</div>';
    if (!arr.length) h += '<p class="empty">مفيش مبيعات مسجلة في الفترة دي. الربح بيتحسب لما تحدد الأوردر "منفذ".</p>';
    else {
      arr.sort(function (a, b) { return b.profit - a.profit; });
      h += '<h3>الربح لكل منتج</h3><ul class="bk-list">' + arr.map(function (p) {
        return '<li><div><strong>' + esc(p.name) + '</strong><small>' + p.qty + ' قطعة — هامش ' + Math.round(p.margin) + '%' + (p.unk ? ' (تكلفة ناقصة)' : '') + '</small></div><div class="bk-qty">' + egp(Math.round(p.profit)) + '</div></li>';
      }).join('') + '</ul>';
      var byM = arr.filter(function (p) { return !p.unk; }).sort(function (a, b) { return b.margin - a.margin; });
      if (byM.length >= 2) {
        h += '<h3>أعلى هامش</h3><p>' + byM.slice(0, 3).map(function (p) { return esc(p.name) + ' (' + Math.round(p.margin) + '%)'; }).join('، ') + '</p>' +
          '<h3>أضعف هامش</h3><p>' + byM.slice(-3).reverse().map(function (p) { return esc(p.name) + ' (' + Math.round(p.margin) + '%)'; }).join('، ') + '</p>';
      }
    }
    // راكد + استهلاك شهري + إعادة الطلب
    var st = bkStock(BK.moves);
    var now = new Date();
    var slow = [], reorder = [];
    Object.keys(st).forEach(function (k) {
      var s = st[k];
      var sold = BK.moves.filter(function (m) { return m.kind === 'sale' && bkKey(m.product_name, m.color) === k; });
      var days = s.lastSale ? Math.floor((now - new Date(s.lastSale)) / 86400000) : Math.floor((now - new Date(s.first)) / 86400000);
      if (s.qty > 0 && days >= 60) slow.push(esc(s.name + (s.color ? ' ' + s.color : '')) + ' (' + s.qty + ' قطعة، من ' + days + ' يوم من غير بيع)');
      var spanDays = Math.min(365, Math.max(30, Math.floor((now - new Date(s.first)) / 86400000)));
      var tot = sold.reduce(function (a, m) { return a + (-Number(m.qty)); }, 0);
      var avg = tot / (spanDays / 30);
      if (avg > 0 && s.qty < avg) reorder.push(esc(s.name + (s.color ? ' ' + s.color : '')) + ': بيستهلك ~' + Math.round(avg * 10) / 10 + ' في الشهر، الموجود ' + s.qty + '، اطلب ~' + Math.ceil(2 * avg - s.qty));
    });
    h += '<h3>راكد (من غير بيع 60 يوم أو أكتر)</h3>' + (slow.length ? '<ul class="bk-plain"><li>' + slow.join('</li><li>') + '</li></ul>' : '<p class="empty">مفيش.</p>');
    h += '<h3>اقتراح إعادة الطلب (يكفي شهرين)</h3>' + (reorder.length ? '<ul class="bk-plain"><li>' + reorder.join('</li><li>') + '</li></ul>' : '<p class="empty">مفيش حاجة محتاجة دلوقتي، أو لسه مفيش مبيعات تكفي للحساب.</p>');
    body.innerHTML = h;
    $('rp-sel').addEventListener('change', function () { BK.month = $('rp-sel').value; bkRepView(body); });
  }
  function bkSetView(body) {
    var start = BK.cash.filter(function (c) { return c.kind === 'capital_start'; })[0];
    body.innerHTML = '<div class="bk-form"><h3>رأس المال</h3>' +
      '<p class="empty">الكاش الحالي: ' + egp(bkCashTotal()) + (start ? ' — رأس المال المبدئي المسجل: ' + egp(start.amount) : ' — لسه مفيش رأس مال مبدئي مسجل') + '</p>' +
      '<label class="field">رأس المال المبدئي (كاش)<input id="bs-start" type="number" inputmode="decimal" min="0" step="any" value="' + (start ? esc(start.amount) : '') + '"></label>' +
      '<button id="bs-start-save" class="btn primary" type="button">احفظ</button>' +
      '<h3>تنبيه المخزن</h3>' +
      '<label class="field">نبهني لما رصيد أي صنف يوصل لـ (أو أقل)<input id="bs-low" type="number" inputmode="decimal" min="0" step="any" value="' + esc(BK.low) + '"></label>' +
      '<button id="bs-low-save" class="btn primary" type="button">احفظ</button></div>';
    $('bs-start-save').addEventListener('click', function () {
      var v = Number($('bs-start').value);
      if (!(v >= 0) || $('bs-start').value === '') { toast('اكتب رقم صح'); return; }
      sb.from('books_cash').delete().eq('kind', 'capital_start').then(function (d) {
        if (d.error) throw d.error;
        return sb.from('books_cash').insert({ kind: 'capital_start', amount: v, move_date: todayStr(), note: 'رأس المال المبدئي' });
      }).then(function (r) { if (r.error) throw r.error; toast('اتحفظ'); bkRender(); }).catch(function () { toast('مشكلة في الحفظ'); });
    });
    $('bs-low-save').addEventListener('click', function () {
      var v = Number($('bs-low').value);
      if (!(v >= 0)) { toast('اكتب رقم صح'); return; }
      sb.from('books_settings').update({ low_stock: v }).eq('id', 1).select('id').then(function (r) {
        if (r.error || !r.data || !r.data.length) { toast('مشكلة في الحفظ'); return; }
        toast('اتحفظ'); bkRender();
      });
    });
  }

  /* ---------- تشغيل ---------- */
  function onUser(user) {
    state.user = user;
    state.isOwner = !!user && String(user.email || '').toLowerCase() === OWNER_EMAIL;
    if (!user) { showAuth(); return; }
    var name = (user.user_metadata && user.user_metadata.full_name) || user.email;
    $('user-name').textContent = name;
    $('admin-open').hidden = !state.isOwner;
    loadProf();
    showApp();
    if (!navBooted) {
      navBooted = true;
      try {
        if (location.hash.indexOf('#/') !== 0) {
          suppressHash = '#/home';
          location.hash = '#/home';
        } else {
          history.replaceState(null, '', '#/home');
        }
      } catch (e) {}
      var armGuard = function () {
        try {
          if (location.hash === '#/home') { suppressHash = '#/'; location.hash = '#/'; }
        } catch (e) {}
      };
      if (document.readyState === 'complete') setTimeout(armGuard, 50);
      else window.addEventListener('load', function () { setTimeout(armGuard, 50); });
    }
    loadTexts();
    loadProducts();
    loadCategories();
    renderFilters();
    renderCart();
    refreshOrderBadge();
    loadBest();
    checkOrderNotifs(true);
  }
  function refreshOrderBadge() {
    var badge = $('admin-badge');
    if (!state.isOwner) { badge.hidden = true; return; }
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(function (r) {
        var n = r.count || 0;
        badge.textContent = n;
        badge.hidden = !n;
      })
      .catch(function () {});
  }
  /* ---------- طلباتي ---------- */
  function statusLabel(s) {
    if (s === 'done') return 'تم التنفيذ ✓';
    if (s === 'cancelled') return 'ملغي';
    return 'قيد المراجعة';
  }
  function openMyOrders() {
    $('catalog-view').hidden = true;
    $('admin-view').hidden = true;
    $('wallet-view').hidden = true;
    $('orders-view').hidden = false;
    renderMyOrders();
    scrollTo(0, 0);
    pushNav();
  }
  function closeMyOrders() { history.back(); }
  function renderMyOrders() {
    var box = $('my-orders');
    box.innerHTML = '<p class="empty">بيتم التحميل…</p>';
    sb.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(50)
      .then(function (r) {
        if (r.error) { box.innerHTML = '<p class="empty">مشكلة في تحميل الطلبات.</p>'; return; }
        var orders = r.data || [];
        if (!orders.length) { box.innerHTML = '<p class="empty">مفيش طلبات لسه.</p>'; return; }
        box.innerHTML = '';
        orders.forEach(function (o) {
          var card = document.createElement('article');
          card.className = 'order-card' + (o.status === 'cancelled' ? ' cancelled' : (o.status === 'done' ? ' done' : ''));
          var when = new Date(o.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
          var items = (o.items || []).map(function (it) {
            return '<li>' + esc(it.name) + (it.color ? ' (' + esc(it.color) + ')' : '') + ' — ' + it.qty + ' ' + esc(it.unit || '') + ' × ' + egp(it.price) + '</li>';
          }).join('');
          card.innerHTML =
            '<div class="order-top"><strong>طلب ' + String(o.id).slice(0, 8) + '</strong>' +
            '<span class="order-when">' + when + '</span></div>' +
            '<div class="order-status s-' + esc(o.status) + '">' + statusLabel(o.status) + '</div>' +
            '<div class="order-pay">' + (o.pay_method === 'wallet' ? 'الدفع: من المحفظة' : 'الدفع: عند الاستلام') + '</div>' +
            '<ul class="order-items">' + items + '</ul>' +
            '<div class="order-foot"><strong>' + egp(o.total) + '</strong>' +
            (o.status === 'new' ? '<button type="button" class="btn small danger ghost">إلغاء الطلب</button>' : '') + '</div>';
          var btn = card.querySelector('button');
          if (btn) {
            btn.addEventListener('click', function () {
              if (!confirm('متأكد إنك عايز تلغي الطلب ده؟')) return;
              sb.from('orders').update({ status: 'cancelled' }).eq('id', o.id).eq('status', 'new').select('id')
                .then(function (u) {
                  if (u.error || !u.data || !u.data.length) { toast('مشكلة في الإلغاء. جرّب تاني.'); renderMyOrders(); return; }
                  if (o.pay_method === 'wallet') {
                    sb.from('wallet_ledger').insert({
                      kind: 'refund', status: 'applied', amount: Number(o.total) || 0,
                      order_id: o.id, customer_name: o.customer_name
                    }).then(function () {});
                  }
                  toast(o.pay_method === 'wallet' ? 'اتلغى الطلب ورجع المبلغ لمحفظتك' : 'اتلغى الطلب');
                  renderMyOrders();
                });
            });
          }
          box.appendChild(card);
        });
      })
      .catch(function () { box.innerHTML = '<p class="empty">مشكلة في تحميل الطلبات.</p>'; });
  }

  /* ---------- المحفظة ---------- */
  function openWallet() {
    $('catalog-view').hidden = true;
    $('admin-view').hidden = true;
    $('orders-view').hidden = true;
    $('wallet-view').hidden = false;
    renderWallet();
    scrollTo(0, 0);
    pushNav();
  }
  function closeWallet() { history.back(); }
  function renderWallet() {
    $('wallet-pay-number').textContent = paymentNumber();
    $('wallet-history').innerHTML = '<p class="empty">بيتم التحميل…</p>';
    fetchBalance(state.user.id).then(function (b) { $('wallet-balance').textContent = egp(b); });
    fetchLimit(state.user.id).then(function (l) {
      $('wallet-limit').textContent = l > 0 ? 'حد الآجل: ' + egp(l) : '';
    });
    sb.from('wallet_ledger').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(50)
      .then(function (r) {
        if (r.error) { $('wallet-history').innerHTML = '<p class="empty">مشكلة في التحميل.</p>'; return; }
        var rows = r.data || [];
        if (!rows.length) { $('wallet-history').innerHTML = '<p class="empty">مفيش حركات لسه.</p>'; return; }
        $('wallet-history').innerHTML = '';
        rows.forEach(function (x) {
          var div = document.createElement('div');
          div.className = 'ledger-row';
          var label = x.kind === 'topup'
            ? ('شحن رصيد' + (x.method === 'instapay' ? ' (إنستاباي)' : ' (فودافون كاش)'))
            : x.kind === 'order' ? 'دفع طلب' : x.kind === 'payment' ? 'سداد رصيد' : 'استرجاع طلب ملغي';
          var st = x.status === 'pending' ? ' — مستني التأكيد' : x.status === 'rejected' ? ' — مرفوض' : '';
          var when = new Date(x.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
          var amt = Number(x.amount) || 0;
          div.innerHTML = '<span>' + label + st + '<br><small>' + when + '</small></span>' +
            '<span class="ledger-amt ' + (amt >= 0 ? 'pos' : 'neg') + '">' + (amt >= 0 ? '+' : '-') + egp(Math.abs(amt)) + '</span>';
          $('wallet-history').appendChild(div);
        });
      })
      .catch(function () { $('wallet-history').innerHTML = '<p class="empty">مشكلة في التحميل.</p>'; });
  }
  function readScreenshot(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 800 / img.width);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function submitTopup() {
    var hint = $('topup-hint');
    var amount = Number($('topup-amount').value);
    var method = $('topup-method').value;
    var sender = $('topup-sender').value.replace(/\D/g, '');
    var ref = $('topup-ref').value.trim();
    var file = $('topup-shot').files && $('topup-shot').files[0];
    if (!amount || amount <= 0) { hint.textContent = 'اكتب المبلغ اللي حولته.'; return; }
    if (!/^01[0-9]{9}$/.test(sender)) { hint.textContent = 'اكتب رقم الموبايل اللي حوّلت منه: 11 رقم يبدأ بـ 01.'; return; }
    if (!file) { hint.textContent = 'ارفع سكرين شوت التحويل، صاحب الورشة هيراجعها قبل تأكيد الشحن.'; return; }
    hint.textContent = '';
    var btn = $('topup-submit');
    btn.disabled = true;
    btn.textContent = 'جاري التسجيل…';
    var name = (state.user.user_metadata && state.user.user_metadata.full_name) || state.user.email;
    readScreenshot(file).then(function (shot) {
      if (!shot) {
        btn.disabled = false; btn.textContent = 'تسجيل طلب الشحن';
        hint.textContent = 'الصورة مش واضحة. جرّب صورة تانية.'; return;
      }
      sb.from('wallet_ledger').insert({
        kind: 'topup', status: 'pending', amount: amount, method: method,
        sender_phone: sender, reference: ref || null, screenshot_data: shot, customer_name: name
      })
        .then(function (r) {
          btn.disabled = false; btn.textContent = 'تسجيل طلب الشحن';
          if (r.error) { hint.textContent = 'الطلب ما اتسجلش. جرّب تاني.'; return; }
          $('topup-amount').value = '';
          $('topup-sender').value = '';
          $('topup-ref').value = '';
          $('topup-shot').value = '';
          toast('طلب الشحن اتسجل، هيضاف لرصيدك بعد المراجعة');
          renderWallet();
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'تسجيل طلب الشحن'; hint.textContent = 'الطلب ما اتسجلش. جرّب تاني.'; });
    });
  }

  /* ---------- محافظ الإدارة ---------- */
  function renderAdminWallets() {
    var topupsBox = $('admin-topups'), balBox = $('admin-balances'), ledBox = $('admin-ledger');
    topupsBox.innerHTML = balBox.innerHTML = ledBox.innerHTML = '<p class="empty">بيتم التحميل…</p>';
    sb.from('wallet_ledger').select('*').order('created_at', { ascending: false }).limit(300)
      .then(function (r) {
        if (r.error) { topupsBox.innerHTML = '<p class="empty">مشكلة في التحميل.</p>'; balBox.innerHTML = ''; ledBox.innerHTML = ''; return; }
        var rows = r.data || [];
        var pending = rows.filter(function (x) { return x.kind === 'topup' && x.status === 'pending'; });
        topupsBox.innerHTML = pending.length ? '' : '<p class="empty">مفيش طلبات شحن مستنية.</p>';
        pending.forEach(function (x) {
          var card = document.createElement('article');
          card.className = 'order-card';
          var when = new Date(x.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
          card.innerHTML =
            '<div class="order-top"><strong>' + esc(x.customer_name || 'عميل') + '</strong><span class="order-when">' + when + '</span></div>' +
            '<div>' + egp(x.amount) + ' — ' + (x.method === 'instapay' ? 'إنستاباي' : 'فودافون كاش') + '</div>' +
            '<div class="order-phone" dir="ltr">' + esc(x.sender_phone || '') + '</div>' +
            (x.reference ? '<div class="order-notes" dir="ltr">Ref: ' + esc(x.reference) + '</div>' : '') +
            (x.screenshot_data ? '<img class="topup-shot" src="' + x.screenshot_data + '" alt="سكرين شوت التحويل">' : '') +
            '<div class="order-foot"><button type="button" class="btn small primary">تأكيد الشحن</button>' +
            '<button type="button" class="btn small danger ghost">رفض</button></div>';
          var btns = card.querySelectorAll('button');
          btns[0].addEventListener('click', function () { setTopup(x.id, 'confirmed'); });
          btns[1].addEventListener('click', function () { setTopup(x.id, 'rejected'); });
          topupsBox.appendChild(card);
        });
        var map = {};
        rows.forEach(function (x) {
          if (x.status !== 'confirmed' && x.status !== 'applied') return;
          if (!map[x.user_id]) map[x.user_id] = { name: x.customer_name || 'عميل', bal: 0 };
          if (x.customer_name) map[x.user_id].name = x.customer_name;
          map[x.user_id].bal += Number(x.amount) || 0;
        });
        sb.from('credit_limits').select('*').then(function (cr) {
          (cr.data || []).forEach(function (c) {
            if (!map[c.user_id]) map[c.user_id] = { name: c.customer_name || 'عميل', bal: 0 };
            map[c.user_id].limit = Number(c.limit_amount) || 0;
            if (c.customer_name) map[c.user_id].name = c.customer_name;
          });
          var custs = Object.keys(map);
          balBox.innerHTML = custs.length ? '' : '<p class="empty">مفيش أرصدة لسه.</p>';
          custs.forEach(function (uid) {
            var c = map[uid];
            var card = document.createElement('article');
            card.className = 'order-card';
            var owed = c.bal < 0;
            var avail = c.bal + (c.limit || 0);
            card.innerHTML =
              '<div class="order-top"><strong>' + esc(c.name) + '</strong>' +
              '<span class="ledger-amt ' + (c.bal >= 0 ? 'pos' : 'neg') + '">' + (owed ? 'عليه: ' : 'رصيد: ') + egp(Math.abs(c.bal)) + '</span></div>' +
              '<div class="order-pay">متاح آجل دلوقتي: ' + egp(avail) + '</div>' +
              '<div class="wallet-admin-row">حد الآجل: <input type="number" min="0" step="50" value="' + (c.limit || 0) + '" data-role="limit"> <button type="button" class="btn small ghost" data-role="save-limit">حفظ الحد</button></div>' +
              '<div class="wallet-admin-row">تسجيل سداد: <input type="number" min="1" step="1" placeholder="المبلغ" data-role="pay"> <button type="button" class="btn small primary" data-role="save-pay">سداد</button></div>';
            card.querySelector('[data-role="save-limit"]').addEventListener('click', function () {
              var v = Number(card.querySelector('[data-role="limit"]').value) || 0;
              sb.from('credit_limits').upsert({ user_id: uid, limit_amount: v, customer_name: c.name })
                .then(function (rr) { toast(rr.error ? 'مشكلة في الحفظ' : 'اتحفظ حد الآجل'); });
            });
            card.querySelector('[data-role="save-pay"]').addEventListener('click', function () {
              var v = Number(card.querySelector('[data-role="pay"]').value);
              if (!v || v <= 0) { toast('اكتب مبلغ السداد الأول'); return; }
              sb.from('wallet_ledger').insert({ user_id: uid, kind: 'payment', status: 'applied', amount: v, customer_name: c.name })
                .then(function (rr) {
                  if (rr.error) { toast('مشكلة في التسجيل'); return; }
                  toast('اتسجل السداد');
                  renderAdminWallets();
                });
            });
            balBox.appendChild(card);
          });
        });
        ledBox.innerHTML = rows.length ? '' : '<p class="empty">مفيش حركات.</p>';
        rows.slice(0, 40).forEach(function (x) {
          var d = document.createElement('div');
          d.className = 'ledger-row';
          var label = x.kind === 'topup' ? 'شحن' : x.kind === 'order' ? 'دفع طلب' : x.kind === 'payment' ? 'سداد' : 'استرجاع';
          var st = x.status === 'pending' ? ' (مستني)' : x.status === 'rejected' ? ' (مرفوض)' : '';
          var when = new Date(x.created_at).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          var amt = Number(x.amount) || 0;
          d.innerHTML = '<span>' + esc(x.customer_name || 'عميل') + ' — ' + label + st + '<br><small>' + when + '</small></span>' +
            '<span class="ledger-amt ' + (amt >= 0 ? 'pos' : 'neg') + '">' + (amt >= 0 ? '+' : '-') + egp(Math.abs(amt)) + '</span>';
          ledBox.appendChild(d);
        });
      })
      .catch(function () { topupsBox.innerHTML = '<p class="empty">مشكلة في التحميل.</p>'; });
  }
  function setTopup(id, status) {
    sb.from('wallet_ledger').update({ status: status }).eq('id', id)
      .then(function (r) {
        if (r.error) { toast('مشكلة في التحديث'); return; }
        toast(status === 'confirmed' ? 'اتأكد الشحن واتضاف للرصيد' : 'اترفض الطلب');
        renderAdminWallets();
      })
      .catch(function () { toast('مشكلة في التحديث'); });
  }

  function bind() {
    bindAuth();
    $('logout').addEventListener('click', function () {
      sb.auth.signOut().then(function () { toast('سجلت خروجك'); });
    });
    $('admin-open').addEventListener('click', openAdmin);
    $('admin-close').addEventListener('click', closeAdmin);
    var brandEl = document.querySelector('.brand');
    if (brandEl) brandEl.addEventListener('click', function (e) { if (e.target.closest('button')) return; if (state.user) goHome(); });
    document.querySelectorAll('.admin-tab').forEach(function (b) {
      b.addEventListener('click', function () { setAdminTab(b.getAttribute('data-tab')); });
    });
    $('send-order').addEventListener('click', sendOrder);
    $('cart-open').addEventListener('click', openCart);
    $('cart-close').addEventListener('click', closeCart);
    $('cart-continue').addEventListener('click', closeCart);
    $('my-orders-open').addEventListener('click', openMyOrders);
    $('my-orders-close').addEventListener('click', closeMyOrders);
    $('wallet-open').addEventListener('click', openWallet);
    $('wallet-close').addEventListener('click', closeWallet);
    $('topup-submit').addEventListener('click', submitTopup);
    $('cat-add').addEventListener('click', function () { openCatForm(null); });
    $('c-save').addEventListener('click', saveCat);
    $('c-cancel').addEventListener('click', function () { $('cat-form').hidden = true; });
    $('product-add').addEventListener('click', function () { openProductForm(null); });
    $('p-save').addEventListener('click', saveProduct);
    var searchEl = $('search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.search = searchEl.value.trim();
        renderGrid();
      });
    }
    $('lightbox-close').addEventListener('click', function () { closeLightbox(false); });
    $('lightbox').addEventListener('click', function (e) {
      if (e.target === this) closeLightbox(false);
    });
    $('p-cancel').addEventListener('click', function () { $('product-form').hidden = true; });
    $('t-save').addEventListener('click', saveTexts);
    Object.keys(PROF_FIELDS).forEach(function (k) {
      $(PROF_FIELDS[k]).addEventListener('input', function () { saveProf(false); });
    });
    $('cust-edit').addEventListener('click', function () { state.profEditing = true; showProfSummary(); });
    fillImageOptions();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    setAuthMode('login');
    sb.auth.getSession().then(function (r) {
      var u = r.data.session ? r.data.session.user : null;
      if (DW_RECOVERY) {
        if (u) { state.user = u; showResetMode(); }
        else { onUser(null); authError('لينك تغيير كلمة السر ده اتستخدم أو انتهى. اطلب لينك جديد من "نسيت كلمة السر؟".'); }
        return;
      }
      onUser(u);
    });
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') { if (session) state.user = session.user; showResetMode(); return; }
      if (DW_RECOVERY && session) { state.user = session.user; showResetMode(); return; }
      onUser(session ? session.user : null);
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (reg) { reg.update().catch(function () {}); }).catch(function () {});
      var dwReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (dwReloaded) return;
        dwReloaded = true;
        location.reload();
      });
    }
  });
})();
