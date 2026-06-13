// Notification bar -- adds/removes transient messages at top-right.
(function (global) {
  'use strict';
  const MAX = 3;
  const bar = () => document.getElementById('notify-bar');
  function ensureBar() {
    let b = bar();
    if (!b) {
      b = document.createElement('div');
      b.id = 'notify-bar';
      b.className = 'notify-bar';
      document.body.appendChild(b);
    }
    return b;
  }
  function show(kind, message) {
    const b = ensureBar();
    const el = document.createElement('div');
    el.className = 'notify ' + kind;
    el.innerHTML = '<span></span><button class="close">x</button>';
    el.querySelector('span').textContent = message;
    el.querySelector('.close').onclick = () => el.remove();
    b.insertBefore(el, b.firstChild);
    while (b.children.length > MAX) b.removeChild(b.lastChild);
    if (kind !== 'error') setTimeout(() => el.remove(), 5000);
  }
  global.Notify = { info: (m) => show('info', m), warn: (m) => show('warn', m), error: (m) => show('error', m) };
})(window);
