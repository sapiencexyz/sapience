/**
 * Latency collector with percentile computation and reservoir sampling.
 */

const MAX_RESERVOIR = 100_000;

export class MetricStream {
  readonly name: string;
  private samples: number[] = [];
  private sorted = false;
  private count = 0;
  private sum = 0;

  constructor(name: string) {
    this.name = name;
  }

  record(value: number): void {
    this.count++;
    this.sum += value;
    this.sorted = false;

    if (this.samples.length < MAX_RESERVOIR) {
      this.samples.push(value);
    } else {
      // Reservoir sampling: replace a random element
      const idx = Math.floor(Math.random() * this.count);
      if (idx < MAX_RESERVOIR) {
        this.samples[idx] = value;
      }
    }
  }

  get totalCount(): number {
    return this.count;
  }

  get mean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  get max(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples);
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    if (!this.sorted) {
      this.samples.sort((a, b) => a - b);
      this.sorted = true;
    }
    const idx = Math.min(
      Math.floor(this.samples.length * (p / 100)),
      this.samples.length - 1
    );
    return this.samples[idx];
  }
}

export class MetricsCollector {
  private streams = new Map<string, MetricStream>();

  get(name: string): MetricStream {
    let stream = this.streams.get(name);
    if (!stream) {
      stream = new MetricStream(name);
      this.streams.set(name, stream);
    }
    return stream;
  }

  record(name: string, value: number): void {
    this.get(name).record(value);
  }

  all(): MetricStream[] {
    return Array.from(this.streams.values());
  }
}
