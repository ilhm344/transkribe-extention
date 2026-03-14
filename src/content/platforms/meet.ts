/**
 * Google Meet DOM selectors for active speaker detection.
 * Strategy priority: aria-label (most stable) → data-is-speaking → class-based fallback
 */

/**
 * Returns the display name of the currently speaking participant, or null if silence.
 * Selector strategies ordered by stability (accessibility attributes > DOM classes).
 */
export function getActiveSpeaker(): string | null {
  // Strategy 1: aria-label="Name, speaking" or "Name, говорит" — most stable (a11y standard)
  const elements = document.querySelectorAll<HTMLElement>('[aria-label]');
  for (const el of elements) {
    const label = el.getAttribute('aria-label') ?? '';
    if (label.includes(', speaking') || label.includes(', говорит')) {
      const name = label.replace(/, (speaking|говорит).*/, '').trim();
      if (name) return name;
    }
  }

  // Strategy 2: data-is-speaking="true" attribute
  const speakingEl = document.querySelector<HTMLElement>('[data-is-speaking="true"]');
  if (speakingEl) {
    const tile = speakingEl.closest<HTMLElement>('[data-participant-id]');
    const name = tile?.querySelector<HTMLElement>('[data-participant-name]')?.textContent?.trim()
              ?? tile?.getAttribute('aria-label')?.split(',')[0]?.trim()
              ?? null;
    if (name) return name;
  }

  // TODO: add more fallback selectors as we test against live Meet DOM
  return null;
}

/**
 * Returns the self participant name (the current user).
 * Used to replace "You" / "Вы" entries in the speaker log.
 */
export function getSelfName(): string {
  const selfEl = document.querySelector<HTMLElement>('[data-self-name]');
  if (selfEl?.textContent?.trim()) return selfEl.textContent.trim();

  // Fallback: aria-label="You (Name)" pattern
  const youEl = document.querySelector<HTMLElement>('[aria-label*="You ("]');
  if (youEl) {
    const match = youEl.getAttribute('aria-label')?.match(/You \((.+?)\)/);
    if (match?.[1]) return match[1];
  }

  return 'Me';
}

/**
 * Returns true if the meeting has ended (user left the call).
 */
export function isMeetingEnded(): boolean {
  // "You left the call" screen — DOM key indicator
  const body = document.body.textContent ?? '';
  return body.includes('You left the call') || body.includes('Вы вышли из звонка');
}
