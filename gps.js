'use strict';
/* ===== מרחק וקצב לפי GPS (ניסיוני) =====
   כל הקוד של ה-GPS נמצא כאן. app.js רק קורא ל-RW_GPS אם הוא קיים. */
(function () {
  const R = 6371000, rad = x => x * Math.PI / 180;
  function hav(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const G = {
    watch: null, last: null, dist: 0, bySeg: {}, fixes: 0, onKm: null, getSeg: null, paused: null,
    available: () => 'geolocation' in navigator,
    start({ getSeg, isPaused, onKm }) {
      this.stop();
      Object.assign(this, { last: null, dist: 0, bySeg: {}, fixes: 0, getSeg, paused: isPaused, onKm });
      if (!this.available()) return;
      this.watch = navigator.geolocation.watchPosition(p => this.onPos(p), () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    },
    onPos(p) {
      const c = p.coords;
      if (c.accuracy > 30) return;              // קליטה חלשה – מתעלמים
      const pt = { lat: c.latitude, lon: c.longitude, t: p.timestamp };
      this.fixes++;
      if (this.paused && this.paused()) { this.last = pt; return; }
      if (!this.last) { this.last = pt; return; }
      const d = hav(this.last, pt), dt = (pt.t - this.last.t) / 1000;
      if (d < 3) return;                        // רעש במקום – לא זזים
      if (dt > 0 && d / dt > 9) { this.last = pt; return; } // קפיצה לא הגיונית
      const before = Math.floor(this.dist / 1000);
      this.dist += d; this.last = pt;
      const i = this.getSeg ? this.getSeg() : -1;
      this.bySeg[i] = (this.bySeg[i] || 0) + d;
      const km = Math.floor(this.dist / 1000);
      if (km > before && this.onKm) this.onKm(km);
    },
    stop() {
      if (this.watch != null) navigator.geolocation.clearWatch(this.watch);
      this.watch = null;
    },
    // סיכום לפי סוגי הקטעים
    result(segs, runSec) {
      let runDist = 0;
      segs.forEach((s, i) => { if (s.kind === 'run') runDist += this.bySeg[i] || 0; });
      return { dist: this.dist, runDist, pace: runDist > 50 ? runSec / (runDist / 1000) : 0, fixes: this.fixes };
    }
  };
  G.km = m => (m / 1000).toFixed(2);
  G.pace = sec => sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')} דק׳/ק״מ` : '–';
  window.RW_GPS = G;
})();
