const DEFAULT_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
];

function renderNow() {
  if (typeof window.renderMathInElement !== 'function') return false;
  window.renderMathInElement(document.body, {
    delimiters: DEFAULT_DELIMITERS,
  });
  return true;
}

export function renderKatexWhenReady(timeoutMs) {
  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 2200;
  if (renderNow()) return;

  const started = Date.now();
  const timer = setInterval(function() {
    if (renderNow()) {
      clearInterval(timer);
      return;
    }
    if (Date.now() - started >= timeout) {
      clearInterval(timer);
    }
  }, 80);
}
