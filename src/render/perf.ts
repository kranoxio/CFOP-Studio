/**
 * Leistungsanzeige: zählt tatsächlich gezeichnete Bilder pro Sekunde.
 * Dank Render-on-Demand zeigt sie im Stillstand 0 FPS – das ist gewollt.
 */
class PerfMeter {
  private el: HTMLElement | null = null;
  private frames = 0;
  private worst = 0;
  private calls = 0;
  private ratio = 1;
  private windowStart = performance.now();
  private timer = 0;

  frame(dt: number, calls: number, pixelRatio: number) {
    if (!this.el) return;
    this.frames++;
    this.worst = Math.max(this.worst, dt);
    this.calls = calls;
    this.ratio = pixelRatio;
  }

  /** Anzeige in einen Container (Kopfzeile) einhängen oder entfernen. */
  setVisible(on: boolean, host: HTMLElement = document.body) {
    if (on && !this.el) {
      this.el = document.createElement('div');
      this.el.className = 'perf-meter mono';
      host.append(this.el);
      this.windowStart = performance.now();
      this.timer = window.setInterval(() => this.flush(), 500);
      this.flush();
    } else if (!on && this.el) {
      this.el.remove();
      this.el = null;
      clearInterval(this.timer);
    }
  }

  private flush() {
    if (!this.el) return;
    const now = performance.now();
    const secs = (now - this.windowStart) / 1000;
    const fps = this.frames / secs;
    const worstMs = this.worst * 1000;
    this.el.textContent = `${fps.toFixed(0)} FPS · ${worstMs.toFixed(0)} ms · ${this.calls} Draws · ${this.ratio.toFixed(2)}x`;
    this.el.title = 'Gezeichnete Bilder pro Sekunde · längstes Bild · Draw Calls · Auflösungsfaktor';
    this.el.classList.toggle('idle', this.frames === 0);
    this.frames = 0;
    this.worst = 0;
    this.windowStart = now;
  }
}

export const perf = new PerfMeter();
