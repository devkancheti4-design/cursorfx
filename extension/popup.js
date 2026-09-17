(function () {
  const lists = CursorFX.list();
  const DEFAULTS = { enabled: true, cursor: 'ring', trail: null, click: 'ripple', sound: false };
  const $ = (id) => document.getElementById(id);
  function fill(sel, items) {
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None';
    sel.appendChild(none);
    items.forEach((it) => { const o = document.createElement('option'); o.value = it.name; o.textContent = it.icon + ' ' + it.label; sel.appendChild(o); });
  }
  fill($('cursor'), lists.cursor); fill($('trail'), lists.trail); fill($('click'), lists.click);
  function read() {
    return { enabled: $('enabled').checked, cursor: $('cursor').value || null, trail: $('trail').value || null, click: $('click').value || null, sound: $('sound').checked };
  }
  function write(s) {
    $('enabled').checked = !!s.enabled; $('cursor').value = s.cursor || ''; $('trail').value = s.trail || ''; $('click').value = s.click || ''; $('sound').checked = !!s.sound;
  }
  chrome.storage.sync.get('cursorfx', (data) => write(Object.assign({}, DEFAULTS, data.cursorfx || {})));
  ['enabled', 'cursor', 'trail', 'click', 'sound'].forEach((id) => $(id).addEventListener('change', () => chrome.storage.sync.set({ cursorfx: read() })));
})();
