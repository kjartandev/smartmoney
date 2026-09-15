(() => {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  let last = null;
  const poll = async () => {
    try {
      const r = await fetch('/__mtime', { cache: 'no-store' });
      const { mtime } = await r.json();
      if (last === null) last = mtime;
      else if (mtime > last) location.reload();
    } catch {}
  };
  setInterval(poll, 1000);
  poll();
})();
