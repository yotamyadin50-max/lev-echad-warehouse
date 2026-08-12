(function () {
  'use strict';

  var STORAGE_KEY = 'levEchadWarehouseData_v1';
  var LAST_UPDATED_KEY = 'levEchadWarehouseLastUpdated_v1';
  var LOW_STOCK_RATIO = 0.15;

  // ---------- Starting data ----------
  // Ships empty on purpose: real warehouses, equipment, and managers are entered
  // by the org itself via the "+" actions on each page, never fabricated placeholder content.
  function emptyData() {
    return { warehouses: [], items: [], managers: [] };
  }

  // ---------- Storage ----------
  function getData() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      var fresh = emptyData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      var reset = emptyData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
      return reset;
    }
  }

  function setData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(LAST_UPDATED_KEY, String(Date.now()));
  }

  function getLastUpdated() {
    var raw = localStorage.getItem(LAST_UPDATED_KEY);
    return raw ? Number(raw) : null;
  }

  function formatLastUpdated(ts) {
    if (!ts) return 'אין עדיין פעולות';
    var d = new Date(ts);
    var time = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(d);
    var date = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' }).format(d);
    return 'עודכן לאחרונה: ' + date + ', ' + time;
  }

  function newId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return prefix + '-' + window.crypto.randomUUID();
    }
    return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
  }

  // ---------- Derived data ----------
  function warehouseById(data, id) {
    return data.warehouses.filter(function (w) { return w.id === id; })[0];
  }

  function itemsForWarehouse(data, warehouseId) {
    return data.items.filter(function (it) { return it.warehouseId === warehouseId; });
  }

  function warehouseTotals(data, warehouseId) {
    var items = itemsForWarehouse(data, warehouseId);
    var totalTypes = items.length;
    var totalQty = 0, available = 0, inUse = 0;
    items.forEach(function (it) {
      totalQty += it.qtyAvailable + it.qtyInUse;
      available += it.qtyAvailable;
      inUse += it.qtyInUse;
    });
    return { totalTypes: totalTypes, totalQty: totalQty, available: available, inUse: inUse };
  }

  function grandTotals(data) {
    var totalTypesSet = {};
    var totalQty = 0, available = 0, inUse = 0;
    data.items.forEach(function (it) {
      totalTypesSet[it.name] = true;
      totalQty += it.qtyAvailable + it.qtyInUse;
      available += it.qtyAvailable;
      inUse += it.qtyInUse;
    });
    return {
      totalTypes: Object.keys(totalTypesSet).length,
      totalQty: totalQty,
      available: available,
      inUse: inUse
    };
  }

  function uniqueItemNames(data) {
    var seen = {};
    var names = [];
    data.items.forEach(function (it) {
      if (!seen[it.name]) {
        seen[it.name] = true;
        names.push(it.name);
      }
    });
    names.sort(function (a, b) { return a.localeCompare(b, 'he'); });
    return names;
  }

  function rollupByName(data) {
    var map = {};
    data.items.forEach(function (it) {
      if (!map[it.name]) {
        map[it.name] = { name: it.name, totalQty: 0, available: 0 };
      }
      map[it.name].totalQty += it.qtyAvailable + it.qtyInUse;
      map[it.name].available += it.qtyAvailable;
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return b.totalQty - a.totalQty; });
    return rows;
  }

  // ---------- Helpers ----------
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function fmt(n) {
    return new Intl.NumberFormat('he-IL').format(n);
  }

  var toastTimer = null;
  function showToast(message) {
    var host = document.querySelector('.toast');
    if (!host) return;
    var body = host.querySelector('.toast__body');
    body.textContent = message;
    body.classList.add('toast__body--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      body.classList.remove('toast__body--visible');
    }, 1600);
  }

  function qs(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  // ---------- Shell (header/nav) ----------
  // No login, no per-person identity: the link itself is the access control.
  // This only highlights the active nav item.
  function renderShell(activePage) {
    var navItems = document.querySelectorAll('[data-nav-item]');
    navItems.forEach(function (a) {
      if (a.getAttribute('data-nav-item') === activePage) {
        a.classList.add('nav__item--active');
      }
    });
  }

  // ---------- Page: home ----------
  function initHomePage() {
    renderShell('home');

    var data = getData();
    var totals = grandTotals(data);

    setTileValue('tile-types', totals.totalTypes);
    setTileValue('tile-available', totals.available);
    setTileValue('tile-inuse', totals.inUse);

    var updatedEl = document.querySelector('[data-last-updated]');
    if (updatedEl) updatedEl.textContent = formatLastUpdated(getLastUpdated());

    var listHost = document.querySelector('[data-rollup-list]');
    var emptyHost = document.querySelector('[data-rollup-empty]');
    var rows = rollupByName(data);

    if (rows.length === 0) {
      emptyHost.hidden = false;
      return;
    }
    emptyHost.hidden = true;

    rows.forEach(function (row) {
      var rowEl = el('li', 'row');
      var name = el('div', 'row__name', row.name);
      var meta = el('div', 'row__meta');

      var isLow = row.totalQty > 0 && (row.available / row.totalQty) <= LOW_STOCK_RATIO;

      var qtyBlock = el('div', '');
      var qtyVal = el('span', 'row__qty numeric', fmt(row.totalQty));
      var qtyLabel = el('span', 'row__qty-label', 'סה"כ');
      qtyBlock.appendChild(qtyVal);
      qtyBlock.appendChild(qtyLabel);

      var availBlock = el('div', '');
      var availVal = el('span', 'row__qty numeric', fmt(row.available));
      availVal.style.color = isLow ? 'var(--color-error)' : 'var(--color-accent)';
      var availLabel = el('span', 'row__qty-label', isLow ? 'זמין · מלאי נמוך' : 'זמין');
      if (isLow) availLabel.style.color = 'var(--color-error)';
      availBlock.appendChild(availVal);
      availBlock.appendChild(availLabel);

      meta.appendChild(qtyBlock);
      meta.appendChild(availBlock);

      rowEl.appendChild(name);
      rowEl.appendChild(meta);
      listHost.appendChild(rowEl);
    });
  }

  function setTileValue(key, value) {
    var e = document.querySelector('[data-tile="' + key + '"]');
    if (e) e.textContent = fmt(value);
  }

  // ---------- Page: warehouses ----------
  function initWarehousesPage() {
    renderShell('warehouses');

    var listHost = document.querySelector('[data-warehouse-list]');
    var emptyHost = document.querySelector('[data-warehouse-empty]');

    function render() {
      listHost.innerHTML = '';
      var data2 = getData();
      if (data2.warehouses.length === 0) {
        emptyHost.hidden = false;
      } else {
        emptyHost.hidden = true;
        data2.warehouses.forEach(function (w) {
          var totals = warehouseTotals(data2, w.id);
          var a = el('a', 'card-link');
          a.href = 'warehouse.html?id=' + encodeURIComponent(w.id);

          var title = el('div', 'card-link__title', w.name);
          var loc = el('div', 'card-link__location', w.location || '');
          var stats = el('div', 'card-link__stats');

          stats.appendChild(statBlock('סוגי ציוד', totals.totalTypes));
          stats.appendChild(statBlock('סה"כ', totals.totalQty));
          stats.appendChild(statBlock('זמין', totals.available));

          a.appendChild(title);
          if (w.location) a.appendChild(loc);
          a.appendChild(stats);

          var li = el('li', '');
          li.appendChild(a);
          listHost.appendChild(li);
        });
      }
    }

    function statBlock(label, value) {
      var wrap = el('div', 'stat');
      var val = el('div', 'stat__value numeric', fmt(value));
      var lab = el('div', 'stat__label', label);
      wrap.appendChild(val);
      wrap.appendChild(lab);
      return wrap;
    }

    render();

    var addTrigger = document.querySelector('[data-add-warehouse-trigger]');
    var addForm = document.querySelector('[data-add-warehouse-form]');
    addTrigger.addEventListener('click', function () {
      addForm.hidden = !addForm.hidden;
      if (!addForm.hidden) document.querySelector('[data-warehouse-name-input]').focus();
    });

    document.querySelector('[data-add-warehouse-cancel]').addEventListener('click', function () {
      addForm.hidden = true;
    });

    addForm.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var nameInput = document.querySelector('[data-warehouse-name-input]');
      var locInput = document.querySelector('[data-warehouse-location-input]');
      var name = nameInput.value.trim();
      if (!name) return;
      var d = getData();
      d.warehouses.push({ id: newId('w'), name: name, location: locInput.value.trim() });
      setData(d);
      nameInput.value = '';
      locInput.value = '';
      addForm.hidden = true;
      render();
      showToast('בוצע');
    });
  }

  // ---------- Page: warehouse detail ----------
  function initWarehouseDetailPage() {
    renderShell('warehouses');

    var id = qs('id');
    var data = getData();
    var warehouse = warehouseById(data, id);

    if (!warehouse) {
      document.querySelector('[data-warehouse-title]').textContent = 'המחסן הזה לא קיים';
      var notFound = document.querySelector('[data-warehouse-not-found]');
      if (notFound) notFound.hidden = false;
      var body = document.querySelector('[data-warehouse-body]');
      if (body) body.hidden = true;
      return;
    }

    document.querySelector('[data-warehouse-title]').textContent = warehouse.name;
    if (warehouse.location) {
      document.querySelector('[data-warehouse-location]').textContent = warehouse.location;
    }

    var openPanel = null;

    var switchEl = document.querySelector('[data-warehouse-switch]');
    if (switchEl) {
      data.warehouses.forEach(function (w) {
        var opt = el('option', '', w.name);
        opt.value = w.id;
        if (w.id === id) opt.selected = true;
        switchEl.appendChild(opt);
      });
      if (data.warehouses.length <= 1) {
        var switchField = switchEl.closest('.field');
        if (switchField) switchField.hidden = true;
      }
      switchEl.addEventListener('change', function () {
        window.location.href = 'warehouse.html?id=' + encodeURIComponent(switchEl.value);
      });
    }

    function render() {
      var d = getData();
      var items = itemsForWarehouse(d, id);

      var availableItems = items.filter(function (it) { return it.qtyAvailable > 0; });
      var inUseItems = items.filter(function (it) { return it.qtyInUse > 0; });

      var availHost = document.querySelector('[data-available-list]');
      var availEmpty = document.querySelector('[data-available-empty]');
      var inuseHost = document.querySelector('[data-inuse-list]');
      var inuseEmpty = document.querySelector('[data-inuse-empty]');

      availHost.innerHTML = '';
      inuseHost.innerHTML = '';

      if (availableItems.length === 0) {
        availEmpty.hidden = false;
      } else {
        availEmpty.hidden = true;
        availableItems.forEach(function (it) {
          availHost.appendChild(buildItemRow(it, 'available'));
        });
      }

      if (inUseItems.length === 0) {
        inuseEmpty.hidden = false;
      } else {
        inuseEmpty.hidden = true;
        inUseItems.forEach(function (it) {
          inuseHost.appendChild(buildItemRow(it, 'inuse'));
        });
      }

      var suggestList = document.querySelector('[data-item-name-suggestions]');
      if (suggestList) {
        suggestList.innerHTML = '';
        uniqueItemNames(d).forEach(function (name) {
          var opt = document.createElement('option');
          opt.value = name;
          suggestList.appendChild(opt);
        });
      }
    }

    function buildItemRow(item, mode) {
      var rowEl = el('li', 'row row--' + mode);
      var top = el('div', 'row__name', item.name);

      var meta = el('div', 'row__meta');
      var qtyVal = mode === 'available' ? item.qtyAvailable : item.qtyInUse;
      var qtyBlock = el('div', '');
      var qtyNum = el('span', 'row__qty numeric', fmt(qtyVal));
      var qtyLabel = el('span', 'row__qty-label', mode === 'available' ? 'זמין' : 'בשימוש');
      qtyBlock.appendChild(qtyNum);
      qtyBlock.appendChild(qtyLabel);

      var actionBtn = el('button', mode === 'available' ? 'btn btn--accent' : 'btn btn--primary', mode === 'available' ? 'הוצא' : 'החזר');
      actionBtn.type = 'button';

      meta.appendChild(qtyBlock);
      meta.appendChild(actionBtn);

      var otherWarehouseCount = data.warehouses.length - 1;
      var transferBtn = null;
      if (mode === 'available' && otherWarehouseCount > 0) {
        transferBtn = el('button', 'btn btn--ghost', 'העבר למחסן אחר');
        transferBtn.type = 'button';
        meta.appendChild(transferBtn);
      }

      var wrap = el('div', '');
      wrap.style.width = '100%';
      wrap.appendChild(top);
      wrap.appendChild(meta);

      var panel = buildStepperPanel(item, mode, qtyVal);
      wrap.appendChild(panel);

      actionBtn.addEventListener('click', function () {
        if (openPanel && openPanel !== panel) openPanel.hidden = true;
        panel.hidden = !panel.hidden;
        openPanel = panel.hidden ? null : panel;
      });

      if (transferBtn) {
        var transferPanel = buildTransferPanel(item, qtyVal);
        wrap.appendChild(transferPanel);
        transferBtn.addEventListener('click', function () {
          if (openPanel && openPanel !== transferPanel) openPanel.hidden = true;
          transferPanel.hidden = !transferPanel.hidden;
          openPanel = transferPanel.hidden ? null : transferPanel;
        });
      }

      rowEl.appendChild(wrap);
      return rowEl;
    }

    function buildTransferPanel(item, maxVal) {
      var panel = el('div', 'stepper-panel');
      panel.hidden = true;

      var destField = el('div', 'field');
      var destLabel = el('label', '', 'העבר אל');
      var destSelectId = newId('transfer-dest');
      destLabel.setAttribute('for', destSelectId);
      var destSelect = document.createElement('select');
      destSelect.id = destSelectId;
      getData().warehouses.forEach(function (w) {
        if (w.id === id) return;
        var opt = el('option', '', w.name);
        opt.value = w.id;
        destSelect.appendChild(opt);
      });
      destField.appendChild(destLabel);
      destField.appendChild(destSelect);

      var stepperRow = el('div', 'stepper-row');
      var minusBtn = el('button', 'stepper__btn', '−');
      minusBtn.type = 'button';
      minusBtn.setAttribute('aria-label', 'הפחת כמות');
      var valueEl = el('div', 'stepper__value numeric', '1');
      var plusBtn = el('button', 'stepper__btn', '+');
      plusBtn.type = 'button';
      plusBtn.setAttribute('aria-label', 'הוסף כמות');
      stepperRow.appendChild(minusBtn);
      stepperRow.appendChild(valueEl);
      stepperRow.appendChild(plusBtn);

      var maxEl = el('div', 'stepper__max', 'מקסימום זמין: ' + fmt(maxVal));
      var errEl = el('div', 'stepper__error', 'אין מספיק זמין');
      errEl.hidden = true;

      var actions = el('div', 'stepper__actions');
      var confirmBtn = el('button', 'btn btn--primary', 'העבר');
      confirmBtn.type = 'button';
      var cancelBtn = el('button', 'btn btn--ghost', 'ביטול');
      cancelBtn.type = 'button';
      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);

      panel.appendChild(destField);
      panel.appendChild(stepperRow);
      panel.appendChild(maxEl);
      panel.appendChild(errEl);
      panel.appendChild(actions);

      var current = 1;

      function refresh() {
        valueEl.textContent = String(current);
        var invalid = current > maxVal || current < 1;
        confirmBtn.disabled = invalid || maxVal === 0 || !destSelect.value;
        errEl.hidden = current <= maxVal;
      }

      minusBtn.addEventListener('click', function () {
        current = Math.max(1, current - 1);
        refresh();
      });

      plusBtn.addEventListener('click', function () {
        current = Math.min(maxVal, current + 1);
        refresh();
      });

      cancelBtn.addEventListener('click', function () {
        current = 1;
        refresh();
        panel.hidden = true;
      });

      confirmBtn.addEventListener('click', function () {
        if (confirmBtn.disabled) return;
        if (current > maxVal || current < 1) return;
        var destId = destSelect.value;
        if (!destId) return;
        confirmBtn.disabled = true;
        var d = getData();
        var source = d.items.filter(function (it) { return it.id === item.id; })[0];
        if (!source) return;
        // Re-validate against the freshly-read value, same discipline as check-out/check-in.
        if (current > source.qtyAvailable) {
          confirmBtn.disabled = false;
          showToast('הנתון השתנה, רעננו את הדף ונסו שוב');
          return;
        }
        source.qtyAvailable -= current;
        var dest = d.items.filter(function (it) { return it.warehouseId === destId && it.name === source.name; })[0];
        if (dest) {
          dest.qtyAvailable += current;
        } else {
          d.items.push({ id: newId('i'), warehouseId: destId, name: source.name, qtyAvailable: current, qtyInUse: 0 });
        }
        setData(d);
        current = 1;
        panel.hidden = true;
        render();
        showToast('הועבר');
      });

      refresh();
      return panel;
    }

    function buildStepperPanel(item, mode, maxVal) {
      var panel = el('div', 'stepper-panel');
      panel.hidden = true;

      var stepperRow = el('div', 'stepper-row');
      var minusBtn = el('button', 'stepper__btn', '−');
      minusBtn.type = 'button';
      minusBtn.setAttribute('aria-label', 'הפחת כמות');
      var valueEl = el('div', 'stepper__value numeric', '1');
      var plusBtn = el('button', 'stepper__btn', '+');
      plusBtn.type = 'button';
      plusBtn.setAttribute('aria-label', 'הוסף כמות');

      stepperRow.appendChild(minusBtn);
      stepperRow.appendChild(valueEl);
      stepperRow.appendChild(plusBtn);

      var maxEl = el('div', 'stepper__max', 'מקסימום ' + (mode === 'available' ? 'זמין' : 'בשימוש') + ': ' + fmt(maxVal));
      var errEl = el('div', 'stepper__error', 'אין מספיק ' + (mode === 'available' ? 'זמין' : 'בשימוש'));
      errEl.hidden = true;

      var actions = el('div', 'stepper__actions');
      var confirmBtn = el('button', 'btn btn--' + (mode === 'available' ? 'accent' : 'primary'), 'אישור');
      confirmBtn.type = 'button';
      var cancelBtn = el('button', 'btn btn--ghost', 'ביטול');
      cancelBtn.type = 'button';
      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);

      panel.appendChild(stepperRow);
      panel.appendChild(maxEl);
      panel.appendChild(errEl);
      panel.appendChild(actions);

      var current = 1;

      function refresh() {
        valueEl.textContent = String(current);
        var invalid = current > maxVal || current < 1;
        confirmBtn.disabled = invalid || maxVal === 0;
        errEl.hidden = current <= maxVal;
      }

      minusBtn.addEventListener('click', function () {
        current = Math.max(1, current - 1);
        refresh();
      });

      plusBtn.addEventListener('click', function () {
        current = Math.min(maxVal, current + 1);
        refresh();
      });

      cancelBtn.addEventListener('click', function () {
        current = 1;
        refresh();
        panel.hidden = true;
      });

      confirmBtn.addEventListener('click', function () {
        if (confirmBtn.disabled) return;
        if (current > maxVal || current < 1) return;
        confirmBtn.disabled = true;
        var d = getData();
        var target = d.items.filter(function (it) { return it.id === item.id; })[0];
        if (!target) return;
        // Re-validate against the freshly-read value, not the maxVal this panel was built with:
        // the row could be stale if another tab/window changed this same item since render().
        var freshMax = mode === 'available' ? target.qtyAvailable : target.qtyInUse;
        if (current > freshMax) {
          confirmBtn.disabled = false;
          showToast('הנתון השתנה, רעננו את הדף ונסו שוב');
          return;
        }
        if (mode === 'available') {
          target.qtyAvailable -= current;
          target.qtyInUse += current;
        } else {
          target.qtyInUse -= current;
          target.qtyAvailable += current;
        }
        setData(d);
        current = 1;
        panel.hidden = true;
        render();
        showToast('בוצע');
      });

      refresh();
      return panel;
    }

    render();

    var addTrigger = document.querySelector('[data-add-item-trigger]');
    var addForm = document.querySelector('[data-add-item-form]');
    addTrigger.addEventListener('click', function () {
      addForm.hidden = !addForm.hidden;
      if (!addForm.hidden) document.querySelector('[data-item-name-input]').focus();
    });
    document.querySelector('[data-add-item-cancel]').addEventListener('click', function () {
      addForm.hidden = true;
    });

    addForm.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var nameInput = document.querySelector('[data-item-name-input]');
      var qtyInput = document.querySelector('[data-item-qty-input]');
      var name = nameInput.value.trim();
      var qty = parseInt(qtyInput.value, 10);
      if (!name || !qty || qty < 1) return;
      var d = getData();
      var existing = d.items.filter(function (it) { return it.warehouseId === id && it.name === name; })[0];
      if (existing) {
        existing.qtyAvailable += qty;
      } else {
        d.items.push({ id: newId('i'), warehouseId: id, name: name, qtyAvailable: qty, qtyInUse: 0 });
      }
      setData(d);
      nameInput.value = '';
      qtyInput.value = '';
      addForm.hidden = true;
      render();
      showToast('בוצע');
    });
  }

  // ---------- Page: managers ----------
  function initManagersPage() {
    renderShell('managers');

    var listHost = document.querySelector('[data-manager-list]');
    var emptyHost = document.querySelector('[data-manager-empty]');
    var addForm = document.querySelector('[data-add-manager-form]');
    var warehouseChecksHost = document.querySelector('[data-manager-warehouse-checks]');
    var noWarehousesNote = document.querySelector('[data-manager-no-warehouses]');

    function renderWarehouseChecks() {
      var data = getData();
      warehouseChecksHost.innerHTML = '';
      if (data.warehouses.length === 0) {
        noWarehousesNote.hidden = false;
        return;
      }
      noWarehousesNote.hidden = true;
      data.warehouses.forEach(function (w) {
        var label = el('label', 'field');
        label.style.flexDirection = 'row';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.value = w.id;
        input.name = 'manager-warehouse';
        var span = el('span', '', w.name);
        span.style.color = 'var(--color-ink)';
        span.style.fontSize = '15px';
        label.appendChild(input);
        label.appendChild(span);
        warehouseChecksHost.appendChild(label);
      });
    }

    function render() {
      var data = getData();
      listHost.innerHTML = '';

      if (data.managers.length === 0) {
        emptyHost.hidden = false;
      } else {
        emptyHost.hidden = true;
        data.managers.forEach(function (m) {
          var li = el('li', '');
          var card = el('div', 'card-link');

          var title = el('div', 'card-link__title', m.name);
          var phone = el('a', 'card-link__location tel-link', m.phone + ' · התקשר');
          phone.href = 'tel:' + m.phone.replace(/[^0-9+]/g, '');

          var warehouseNames = m.warehouseIds.map(function (wid) {
            var w = warehouseById(data, wid);
            return w ? w.name : '';
          }).filter(Boolean).join(', ');

          var tag = el('div', 'tag', warehouseNames ? 'אחראי/ת על: ' + warehouseNames : 'טרם שויך למחסן');

          card.appendChild(title);
          card.appendChild(phone);
          card.appendChild(tag);
          li.appendChild(card);
          listHost.appendChild(li);
        });
      }
      renderWarehouseChecks();
    }

    render();

    var addTrigger = document.querySelector('[data-add-manager-trigger]');
    addTrigger.addEventListener('click', function () {
      addForm.hidden = !addForm.hidden;
      if (!addForm.hidden) document.querySelector('[data-manager-name-input]').focus();
    });
    document.querySelector('[data-add-manager-cancel]').addEventListener('click', function () {
      addForm.hidden = true;
    });

    addForm.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var nameInput = document.querySelector('[data-manager-name-input]');
      var phoneInput = document.querySelector('[data-manager-phone-input]');
      var name = nameInput.value.trim();
      var phone = phoneInput.value.trim();
      if (!name || !phone) return;

      var checked = Array.from(warehouseChecksHost.querySelectorAll('input[type="checkbox"]:checked')).map(function (i) { return i.value; });

      var d = getData();
      d.managers.push({ id: newId('m'), name: name, phone: phone, warehouseIds: checked });
      setData(d);
      nameInput.value = '';
      phoneInput.value = '';
      addForm.hidden = true;
      render();
      showToast('בוצע');
    });
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');
    if (page === 'home') initHomePage();
    else if (page === 'warehouses') initWarehousesPage();
    else if (page === 'warehouse') initWarehouseDetailPage();
    else if (page === 'managers') initManagersPage();
  });
})();
