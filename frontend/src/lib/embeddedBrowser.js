export function isEmbeddedBrowser(userAgent = '', { standalone = false } = {}) {
  if (/FBAN\/|FBAV\/|FB_IAB|FBios|Messenger|Instagram|\bLine\/|MicroMessenger/i.test(userAgent)) {
    return true;
  }

  return !standalone
    && /iPhone|iPad|iPod/i.test(userAgent)
    && /AppleWebKit/i.test(userAgent)
    && /Mobile\//i.test(userAgent)
    && !/Safari\/|CriOS\/|FxiOS\/|EdgiOS\/|OPiOS\/|DuckDuckGo\//i.test(userAgent);
}