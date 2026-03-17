import type { SpeakerLogEntry } from '../shared/types';

type GetActiveSpeakerFn = () => string | null;
type GetSelfNameFn = () => string;

const TAG = '[speakerTracker]';

/** Minimum time (ms) current speaker must be silent before we switch to another. */
const HOLD_MS = 800;
/** Time (ms) of total silence before we end the current segment. */
const SILENCE_MS = 1000;

/**
 * Tracks active speakers via:
 * 1. Main-world audio level detection (TRANSKRIBE_SPEAKER postMessage events) — remote
 * 2. Mic activity from offscreen document (MIC_ACTIVITY) — self
 * 3. DOM observation (MutationObserver + polling) as fallback
 *
 * When two speakers talk simultaneously, the current speaker holds the segment
 * until they go silent for HOLD_MS. This prevents rapid flip-flopping.
 */
export class SpeakerTracker {
  private log: SpeakerLogEntry[] = [];
  private currentSpeaker: string | null = null;
  private speakerStartMs: number | null = null;
  private observer: MutationObserver | null = null;
  private selfName: string = 'Я';
  private mutationCount = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private mainWorldEvents = 0;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private useMainWorld = false;

  // Per-source activity tracking
  private selfLastActiveMs = 0;
  private remoteLastActiveMs = 0;
  private remoteLastName: string | null = null;

  // [FIX] DOM fallback for remote speakers when audio detection fails (e.g. tab capture)
  private remoteAudioEventsCount = 0;
  private domFallbackLastName: string | null = null;

  constructor(
    private readonly getActiveSpeaker: GetActiveSpeakerFn,
    private readonly getSelfName: GetSelfNameFn,
  ) {}

  start(): void {
    this.log = [];
    this.currentSpeaker = null;
    this.speakerStartMs = null;
    this.mutationCount = 0;
    this.mainWorldEvents = 0;
    this.useMainWorld = false;
    this.selfLastActiveMs = 0;
    this.remoteLastActiveMs = 0;
    this.remoteLastName = null;
    this.remoteAudioEventsCount = 0;
    this.domFallbackLastName = null;
    this.selfName = this.getSelfName();

    console.log(TAG, '▶ started | selfName:', this.selfName);

    this.observer = new MutationObserver((mutations) => {
      this.mutationCount += mutations.length;
      if (!this.useMainWorld) this.onDomChange();
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-is-speaking', 'class', 'style', 'hidden'],
    });

    this.pollInterval = setInterval(() => {
      if (!this.useMainWorld) {
        this.onDomChange();
      } else {
        this.onDomSelfCheck();
        this.onDomRemoteFallback();
      }
    }, 300);

    console.log(TAG, 'observer + poll (300ms) attached | waiting for main-world speaker events...');
    this.logDomDiagnostics();
  }

  stop(): SpeakerLogEntry[] {
    this.flushCurrentSpeaker();
    this.observer?.disconnect();
    this.observer = null;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }

    const source = this.useMainWorld
      ? (this.remoteAudioEventsCount > 0 ? 'main-world audio' : 'main-world audio + DOM remote fallback')
      : 'DOM observation';
    console.log(
      TAG,
      '■ stopped | segments:', this.log.length,
      '| source:', source,
      '| main-world events:', this.mainWorldEvents,
      '| remote audio events:', this.remoteAudioEventsCount,
      '| mutations:', this.mutationCount,
      '| speakers:', [...new Set(this.log.map(e => e.name))].join(', ') || '(none)',
    );

    if (this.log.length > 0) {
      for (const entry of this.log) {
        const dur = ((entry.endMs - entry.startMs) / 1000).toFixed(1);
        console.log(TAG, `  segment: "${entry.name}" ${dur}s`);
      }
    } else {
      console.warn(TAG, '⚠ NO speaker segments recorded — diarization will be empty');
    }

    return [...this.log];
  }

  /**
   * Called when a REMOTE speaker is detected via main-world audio levels.
   */
  onRemoteSpeaker(name: string, _level: number): void {
    if (!this.useMainWorld) {
      console.log(TAG, '✓ main-world speaker detection active! Switching from DOM to audio-based detection.');
      this.useMainWorld = true;
    }
    this.mainWorldEvents++;
    this.remoteAudioEventsCount++;

    const resolvedName = (name === 'You' || name === 'Вы') ? this.selfName : name;
    const now = Date.now();
    this.remoteLastActiveMs = now;
    this.remoteLastName = resolvedName;

    this.resolveActiveSpeaker(now);
  }

  /**
   * Called when SELF mic activity is detected from offscreen document.
   */
  onSelfSpeaker(_level: number): void {
    if (!this.useMainWorld) {
      console.log(TAG, '✓ main-world speaker detection active! Switching from DOM to audio-based detection.');
      this.useMainWorld = true;
    }
    this.mainWorldEvents++;

    const now = Date.now();
    this.selfLastActiveMs = now;

    this.resolveActiveSpeaker(now);
  }

  /**
   * Determines who should own the current segment based on activity from both sources.
   * Key rule: don't switch away from current speaker unless they've been silent for HOLD_MS.
   */
  private resolveActiveSpeaker(now: number): void {
    const selfActive = (now - this.selfLastActiveMs) < HOLD_MS;
    const remoteActive = (now - this.remoteLastActiveMs) < HOLD_MS;

    let targetSpeaker: string | null = null;

    if (selfActive && remoteActive) {
      // Both speaking — keep current speaker (whoever started first holds the segment)
      if (this.currentSpeaker) {
        targetSpeaker = this.currentSpeaker;
      } else {
        // No current speaker — pick whoever was active most recently
        targetSpeaker = this.selfLastActiveMs >= this.remoteLastActiveMs
          ? this.selfName
          : this.remoteLastName;
      }
    } else if (selfActive) {
      targetSpeaker = this.selfName;
    } else if (remoteActive) {
      targetSpeaker = this.remoteLastName;
    } else {
      targetSpeaker = null;
    }

    // Apply hysteresis: only switch if current speaker is no longer active
    if (targetSpeaker !== this.currentSpeaker && this.currentSpeaker !== null && targetSpeaker !== null) {
      const currentIsSelf = this.currentSpeaker === this.selfName;
      const currentLastActive = currentIsSelf ? this.selfLastActiveMs : this.remoteLastActiveMs;
      if ((now - currentLastActive) < HOLD_MS) {
        // Current speaker still active — don't switch
        this.resetSilenceTimeout(now);
        return;
      }
    }

    this.commitSpeaker(targetSpeaker);
    this.resetSilenceTimeout(now);
  }

  private resetSilenceTimeout(now: number): void {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.silenceTimeout = setTimeout(() => {
      // Check if truly silent
      const elapsed = Date.now();
      const selfActive = (elapsed - this.selfLastActiveMs) < HOLD_MS;
      const remoteActive = (elapsed - this.remoteLastActiveMs) < HOLD_MS;
      if (!selfActive && !remoteActive) {
        this.commitSpeaker(null);
      }
    }, SILENCE_MS);
  }

  private commitSpeaker(name: string | null): void {
    if (name === this.currentSpeaker) return;
    const now = Date.now();
    this.flushCurrentSpeaker(now);

    if (this.currentSpeaker !== null && name !== null) {
      console.log(TAG, `speaker changed: "${this.currentSpeaker}" → "${name}"`);
    } else if (name !== null) {
      console.log(TAG, `speaker started: "${name}"`);
    } else if (this.currentSpeaker !== null) {
      console.log(TAG, `speaker stopped: "${this.currentSpeaker}" → (silence)`);
    }

    this.currentSpeaker = name;
    this.speakerStartMs = name ? now : null;
  }

  private onDomChange(): void {
    const rawName = this.getActiveSpeaker();
    const name = (rawName === 'You' || rawName === 'Вы') ? this.selfName : rawName;
    this.commitSpeaker(name);
  }

  private onDomSelfCheck(): void {
    if (Date.now() - Math.max(this.selfLastActiveMs, this.remoteLastActiveMs) < 500) return;

    const rawName = this.getActiveSpeaker();
    if (!rawName) return;

    const name = (rawName === 'You' || rawName === 'Вы') ? this.selfName : rawName;
    if (name === this.selfName) {
      this.selfLastActiveMs = Date.now();
      this.resolveActiveSpeaker(Date.now());
    }
  }

  /**
   * [FIX] DOM-based fallback for remote speaker detection.
   * During Chrome tab capture, AnalyserNode.getByteFrequencyData() returns all zeros
   * for WebRTC MediaStreams in the main world, making audio-based remote speaker
   * detection impossible. This method falls back to DOM observation (dominant tile,
   * aria-label) to detect remote speakers when audio detection has never worked.
   */
  private onDomRemoteFallback(): void {
    // Only activate when remote audio detection never worked (e.g. tab capture active)
    if (this.remoteAudioEventsCount > 0) return;

    const rawName = this.getActiveSpeaker();
    if (!rawName) return;
    const name = (rawName === 'You' || rawName === 'Вы') ? this.selfName : rawName;

    // Skip self — already handled by MIC_ACTIVITY + onDomSelfCheck
    if (name === this.selfName) return;

    if (name !== this.domFallbackLastName) {
      console.log(TAG, '[FIX] remote speaker (DOM fallback):', name);
      this.domFallbackLastName = name;
    }

    const now = Date.now();
    this.remoteLastActiveMs = now;
    this.remoteLastName = name;
    this.resolveActiveSpeaker(now);
  }

  private flushCurrentSpeaker(endMs: number = Date.now()): void {
    if (this.currentSpeaker && this.speakerStartMs !== null) {
      const dur = ((endMs - this.speakerStartMs) / 1000).toFixed(1);
      console.debug(TAG, `flush segment: "${this.currentSpeaker}" ${dur}s`);
      this.log.push({
        name: this.currentSpeaker,
        startMs: this.speakerStartMs,
        endMs,
      });
    }
  }

  private logDomDiagnostics(): void {
    const dominant = document.querySelector('[class*="dominant"]');
    const participantNames = document.querySelectorAll('[class*="participantName"]');
    const ariaLabels = document.querySelectorAll('[aria-label*="speaking"], [aria-label*="говорит"]');
    const selfView = document.querySelector('[class*="selfView"]');

    console.log(TAG, 'DOM diagnostics:');
    console.log(TAG, '  [class*="dominant"]:', !!dominant);
    console.log(TAG, '  [class*="participantName"] count:', participantNames.length);
    console.log(TAG, '  aria-label speaking:', ariaLabels.length);
    console.log(TAG, '  [class*="selfView"]:', !!selfView);

    participantNames.forEach((el, i) => {
      console.log(TAG, `  participantName[${i}]:`, el.textContent?.trim());
    });
  }
}
