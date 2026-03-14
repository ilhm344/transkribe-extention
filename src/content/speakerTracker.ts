import type { SpeakerLogEntry } from '../shared/types';

type GetActiveSpeakerFn = () => string | null;
type GetSelfNameFn = () => string;

/**
 * Tracks active speakers via MutationObserver.
 * Records {name, startMs, endMs} segments for each speaker turn.
 * TODO: activate in Speaker Tracker milestone.
 */
export class SpeakerTracker {
  private log: SpeakerLogEntry[] = [];
  private currentSpeaker: string | null = null;
  private speakerStartMs: number | null = null;
  private observer: MutationObserver | null = null;
  private selfName: string = 'Me';

  constructor(
    private readonly getActiveSpeaker: GetActiveSpeakerFn,
    private readonly getSelfName: GetSelfNameFn,
  ) {}

  start(): void {
    this.log = [];
    this.currentSpeaker = null;
    this.speakerStartMs = null;
    this.selfName = this.getSelfName();

    if (import.meta.env.DEV) {
      console.log('[speakerTracker] started, self name:', this.selfName);
    }

    this.observer = new MutationObserver(() => this.onDomChange());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-is-speaking', 'class', 'hidden'],
    });
  }

  stop(): SpeakerLogEntry[] {
    this.flushCurrentSpeaker();
    this.observer?.disconnect();
    this.observer = null;
    if (import.meta.env.DEV) {
      console.log('[speakerTracker] stopped, segments recorded:', this.log.length);
    }
    return [...this.log];
  }

  private onDomChange(): void {
    const rawName = this.getActiveSpeaker();
    // Replace "You"/"Вы" with real self name
    const name = (rawName === 'You' || rawName === 'Вы') ? this.selfName : rawName;
    const now = Date.now();

    if (name === this.currentSpeaker) return;

    this.flushCurrentSpeaker(now);
    this.currentSpeaker = name;
    this.speakerStartMs = name ? now : null;

    if (import.meta.env.DEV && name) {
      console.debug('[speakerTracker] speaker changed →', name);
    }
  }

  private flushCurrentSpeaker(endMs: number = Date.now()): void {
    if (this.currentSpeaker && this.speakerStartMs !== null) {
      this.log.push({
        name: this.currentSpeaker,
        startMs: this.speakerStartMs,
        endMs,
      });
    }
  }
}
