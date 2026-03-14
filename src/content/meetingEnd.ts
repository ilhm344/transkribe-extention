type IsMeetingEndedFn = () => boolean;

/**
 * Watches the DOM for meeting-end signals and fires a callback once.
 * TODO: wire up in Speaker Tracker milestone.
 */
export class MeetingEndWatcher {
  private observer: MutationObserver | null = null;

  constructor(
    private readonly isMeetingEnded: IsMeetingEndedFn,
    private readonly onEnded: () => void,
  ) {}

  start(): void {
    if (import.meta.env.DEV) console.log('[meetingEnd] watcher started');

    this.observer = new MutationObserver(() => {
      if (this.isMeetingEnded()) {
        if (import.meta.env.DEV) console.log('[meetingEnd] meeting end detected');
        this.stop();
        this.onEnded();
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (import.meta.env.DEV) console.log('[meetingEnd] watcher stopped');
  }
}
