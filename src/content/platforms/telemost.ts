/**
 * Yandex Telemost DOM selectors for active speaker detection.
 *
 * Telemost uses CSS-modules with hashed class names (e.g. Participant_dominant_LGlf-).
 * The base names (before the hash) are stable across builds, so we match via
 * substring selectors: [class*="dominant"], [class*="participantName"], etc.
 */

const TAG = '[telemost]';

/**
 * Returns the display name of the currently speaking participant, or null if silence.
 */
export function getActiveSpeaker(): string | null {
  // Strategy 1 (primary): Telemost highlights the active speaker tile with a CSS-module
  // class whose base name is "dominant" (e.g. Participant_dominant_LGlf-).
  const dominant = document.querySelector<HTMLElement>('[class*="dominant"]');
  if (dominant) {
    // Try several name element selectors — class hashes change but base names are stable
    const nameEl =
      dominant.querySelector<HTMLElement>('[class*="participantName"]') ??
      dominant.querySelector<HTMLElement>('[class*="avatarWithNameBlock__name"]') ??
      dominant.querySelector<HTMLElement>('[class*="TextName"]') ??
      dominant.querySelector<HTMLElement>('[class*="Name_"]');
    const name = nameEl?.textContent?.trim() ?? null;
    if (name) {
      console.debug(TAG, 'active speaker (dominant class):', name);
      return name;
    }

    // Fallback: walk up/down looking for any text that looks like a name
    const allText = dominant.querySelectorAll<HTMLElement>('span, div, p');
    for (const el of allText) {
      const t = el.textContent?.trim();
      if (t && t.length > 0 && t.length < 60 && !t.includes('\n')) {
        console.debug(TAG, 'active speaker (dominant fallback text):', t);
        return t;
      }
    }

    console.debug(TAG, 'dominant element found but no name extracted');
  }

  // Strategy 2: aria-label="Name, speaking" / "Name, говорит"
  const elements = document.querySelectorAll<HTMLElement>('[aria-label]');
  for (const el of elements) {
    const label = el.getAttribute('aria-label') ?? '';
    if (label.includes(', speaking') || label.includes(', говорит')) {
      const name = label.replace(/, (speaking|говорит).*/, '').trim();
      if (name) {
        console.debug(TAG, 'active speaker (aria-label):', name);
        return name;
      }
    }
  }

  return null;
}

/**
 * Returns the self participant name for the current user.
 */
export function getSelfName(): string {
  // Strategy 1: Telemost shows the user's display name in the header/profile area
  const displayNameEl =
    document.querySelector<HTMLElement>('[class*="userDisplayName"]') ??
    document.querySelector<HTMLElement>('[class*="DisplayName"]') ??
    document.querySelector<HTMLElement>('[class*="displayNameInput"] input');

  if (displayNameEl) {
    const name =
      (displayNameEl as HTMLInputElement).value?.trim() ||
      displayNameEl.textContent?.trim();
    if (name) {
      console.debug(TAG, 'self name resolved:', name);
      return name;
    }
  }

  // Strategy 2: selfView tile — look for name inside the self-view container
  const selfView = document.querySelector<HTMLElement>('[class*="selfView"]');
  if (selfView) {
    const nameEl =
      selfView.querySelector<HTMLElement>('[class*="participantName"]') ??
      selfView.querySelector<HTMLElement>('[class*="Name"]');
    const name = nameEl?.textContent?.trim();
    if (name) {
      console.debug(TAG, 'self name from selfView:', name);
      return name;
    }
  }

  console.debug(TAG, 'self name not found, falling back to "Я"');
  return 'Я';
}

/**
 * Returns true if the Telemost meeting has ended.
 */
export function isMeetingEnded(): boolean {
  // Telemost shows "Эта встреча уже закончилась" when the meeting is over
  const body = document.body.textContent ?? '';
  if (body.includes('Эта встреча уже закончилась')) {
    console.debug(TAG, 'meeting ended detected');
    return true;
  }

  // Check for the post-meeting "reason" screen (not the in-call leave button!)
  // [class*="disconnect"] is too broad — it matches the always-visible leave button.
  const reasonEl = document.querySelector<HTMLElement>('[class*="reason-disconnect"], [class*="reasonDisconnect"], [class*="DisconnectReason"]');
  if (reasonEl && reasonEl.offsetParent !== null) {
    console.debug(TAG, 'disconnect reason screen visible');
    return true;
  }

  return false;
}
