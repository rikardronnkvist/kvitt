export function isEmbeddedBrowser(userAgent = '') {
  return /FBAN\/|FBAV\/|FB_IAB|FBios|Messenger|Instagram|\bLine\/|MicroMessenger/i.test(userAgent);
}