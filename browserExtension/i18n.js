function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  const lang = chrome.i18n.getUILanguage();
  document.documentElement.lang = lang.startsWith('zh') ? 'zh-CN' : 'en';
}
