// Timer that keeps ticking when the page's own timers are throttled.
let id: any = null;
self.onmessage = (e: MessageEvent) => {
  if (id) clearInterval(id);
  id = setInterval(() => (self as any).postMessage(0), e.data || 25);
};
