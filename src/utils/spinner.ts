const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private text = '';

  start(text: string): void {
    this.text = text;
    this.frameIndex = 0;

    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
      process.stderr.write(`\r   ${frame} ${this.text}`);
      this.frameIndex++;
    }, 80);
  }

  update(text: string): void {
    this.text = text;
  }

  stop(finalText?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (finalText) {
      process.stderr.write(`\r   ${finalText}\n`);
    } else {
      process.stderr.write('\r');
    }
  }
}
