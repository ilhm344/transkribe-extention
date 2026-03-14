/**
 * Yandex Telemost DOM selectors for active speaker detection.
 * NOTE: Telemost uses obfuscated class names — use aria-label as primary strategy.
 * TODO: verify and expand selectors against live Telemost DOM in Speaker Tracker milestone.
 */

/**
 * Returns the display name of the currently speaking participant, or null if silence.
 */
export function getActiveSpeaker(): string | null {
  // Strategy 1: aria-label="Name, speaking" — same a11y pattern as Meet
  const elements = document.querySelectorAll<HTMLElement>('[aria-label]');
  for (const el of elements) {
    const label = el.getAttribute('aria-label') ?? '';
    if (label.includes(', speaking') || label.includes(', говорит')) {
      const name = label.replace(/, (speaking|говорит).*/, '').trim();
      if (name) return name;
    }
  }

  // Strategy 2: Telemost-specific speaking participant tile
  const activeTile = document.querySelector<HTMLElement>('.participant-tile_speaking')
                  ?? document.querySelector<HTMLElement>('[data-qa="speaking-participant"]')
                  ?? document.querySelector<HTMLElement>('[data-test-id="speaking-participant"]');
  if (activeTile) {
    const name = activeTile.querySelector<HTMLElement>('.participant-tile__name, .participant__name')
                           ?.textContent?.trim() ?? null;
    if (name) return name;
  }

  // TODO: inspect live Telemost DOM and add more robust selectors
  return null;
}

/**
 * Returns the self participant name for the current user.
 */
export function getSelfName(): string {
  // TODO: find Telemost-specific self-name element
  return 'Me';
}

/**
 * Returns true if the Telemost meeting has ended.
 */
export function isMeetingEnded(): boolean {
  // TODO: identify Telemost end-of-call DOM signal
  return false;
}
