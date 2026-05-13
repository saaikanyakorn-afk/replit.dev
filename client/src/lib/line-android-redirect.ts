export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isLineApp(): boolean {
  return /Line\//i.test(navigator.userAgent);
}

export function isLineAndroid(): boolean {
  const ua = navigator.userAgent;
  return /android/i.test(ua) && /Line\//i.test(ua);
}

export function isLineIOS(): boolean {
  return isIOS() && isLineApp();
}

export function getChromeIntentUrl(): string {
  const host = window.location.hostname;
  const path = window.location.pathname + window.location.search;
  return `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
}

export function redirectToChrome(): boolean {
  if (!isLineAndroid()) return false;
  const host = window.location.hostname;
  const path = window.location.pathname + window.location.search;
  window.location.href = `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
  return true;
}

export function redirectIOSToSafari(): boolean {
  if (!isLineIOS()) return false;
  window.location.href = window.location.href;
  return true;
}
