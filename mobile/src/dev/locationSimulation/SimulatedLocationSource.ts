import type { LocationEvent, LocationSource } from '../../location/types';
import type { LocationSimulationFixture } from './fixtures';

export type SimulationState = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';

type SimulatedLocationSourceOptions = {
  playbackSpeed?: number;
  onStateChange?: (state: SimulationState) => void;
};

export class SimulatedLocationSource implements LocationSource {
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: SimulationState = 'idle';
  private onLocation: ((event: LocationEvent) => void) | null = null;

  constructor(
    private readonly fixture: LocationSimulationFixture,
    options: SimulatedLocationSourceOptions = {}
  ) {
    this.playbackSpeed = options.playbackSpeed ?? 1;
    this.onStateChange = options.onStateChange ?? null;
  }

  private playbackSpeed: number;
  private onStateChange: ((state: SimulationState) => void) | null;

  async start(onLocation: (event: LocationEvent) => void): Promise<void> {
    this.stopTimer();
    this.index = 0;
    this.onLocation = onLocation;
    this.setState('running');
    this.emitNext();
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.setState('paused');
    this.stopTimer();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('running');
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.setState('stopped');
    this.stopTimer();
    this.onLocation = null;
  }

  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.25, speed);
  }

  getState(): SimulationState {
    return this.state;
  }

  private emitNext(): void {
    if (this.state !== 'running' || !this.onLocation) return;
    const event = this.fixture.events[this.index];
    if (!event) {
      this.complete();
      return;
    }
    this.onLocation({ ...event });
    this.index += 1;
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.state !== 'running') return;
    const delayMs = this.fixture.intervalMs / this.playbackSpeed;
    this.timer = setTimeout(() => this.emitNext(), delayMs);
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private complete(): void {
    this.setState('completed');
    this.stopTimer();
    this.onLocation = null;
  }

  private setState(state: SimulationState): void {
    this.state = state;
    this.onStateChange?.(state);
  }
}
