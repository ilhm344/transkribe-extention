/**
 * Google Meet DOM selectors for active speaker detection.
 *
 * Known stable attributes (verified via open-source extensions):
 *   [data-self-name]          — participant name label on video tile
 *   [data-allocation-index]   — video tile container
 *   [data-participantId]      — participant ID (camelCase)
 *
 * Google Meet does NOT expose a dedicated "data-is-speaking" attribute.
 * Primary detection is via aria-label patterns in the participants list.
 */

const TAG = '[meet]';

/**
 * Returns the display name of the currently speaking participant, or null if silence.
 */
export function getActiveSpeaker(): string | null {
  // Strategy 1: aria-label containing ", speaking" or ", говорит"
  // Google Meet annotates participant tiles/list items with this when speaking.
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

  // Strategy 2: Look for visual speaking indicator — Google Meet highlights
  // the active speaker tile with a colored border. The border is applied via
  // inline style or a class on the video tile container.
  // Check for elements with a blue/cyan border that indicates speaking.
  const tiles = document.querySelectorAll<HTMLElement>('[data-participant-id], [data-participantId]');
  for (const tile of tiles) {
    const style = window.getComputedStyle(tile);
    // Google Meet uses a colored border (blue/cyan) on the active speaker
    if (style.borderColor && style.borderColor !== 'rgb(0, 0, 0)' &&
        style.borderColor !== 'transparent' && style.borderColor !== '' &&
        style.borderWidth && parseInt(style.borderWidth) > 0) {
      const nameEl = tile.querySelector<HTMLElement>('[data-self-name]');
      const name = nameEl?.textContent?.trim();
      if (name) {
        console.debug(TAG, 'active speaker (border highlight):', name);
        return name;
      }
    }
  }

  // Strategy 3: Live captions — when enabled, Google Meet shows speaker name
  // above the caption text. Look for caption container with speaker attribution.
  const captionSpeaker = document.querySelector<HTMLElement>(
    '[class*="caption"] [class*="name"], [class*="Caption"] [class*="name"]'
  );
  if (captionSpeaker) {
    const name = captionSpeaker.textContent?.trim();
    if (name) {
      console.debug(TAG, 'active speaker (captions):', name);
      return name;
    }
  }

  return null;
}

/**
 * Returns the self participant name (the current user).
 * Used to replace "You" / "Вы" entries in the speaker log.
 */
export function getSelfName(): string {
  // Strategy 1: [data-self-name] — confirmed to exist on participant name labels
  const selfEl = document.querySelector<HTMLElement>('[data-self-name]');
  if (selfEl) {
    // The attribute value itself contains the name
    const attrName = selfEl.getAttribute('data-self-name')?.trim();
    if (attrName) {
      console.debug(TAG, 'self name from data-self-name attr:', attrName);
      return attrName;
    }
    // Fallback: text content
    const textName = selfEl.textContent?.trim();
    if (textName) {
      console.debug(TAG, 'self name from data-self-name text:', textName);
      return textName;
    }
  }

  // Strategy 2: aria-label="You" or "Вы" patterns
  const youEl =
    document.querySelector<HTMLElement>('[aria-label*="You ("]') ??
    document.querySelector<HTMLElement>('[aria-label*="Вы ("]');
  if (youEl) {
    const label = youEl.getAttribute('aria-label') ?? '';
    const match = label.match(/(?:You|Вы) \((.+?)\)/);
    if (match?.[1]) {
      console.debug(TAG, 'self name from aria-label:', match[1]);
      return match[1];
    }
  }

  // Strategy 3: Look for "You" / "Вы" label on video tile
  const allNames = document.querySelectorAll<HTMLElement>('[data-self-name]');
  for (const el of allNames) {
    const text = el.textContent?.trim();
    if (text && (text.startsWith('You') || text.startsWith('Вы'))) {
      // "You" or "Вы (Real Name)" — extract real name if present
      const match = text.match(/(?:You|Вы)\s*\((.+?)\)/);
      if (match?.[1]) {
        console.debug(TAG, 'self name from You label:', match[1]);
        return match[1];
      }
    }
  }

  console.debug(TAG, 'self name not found, falling back to "Me"');
  return 'Me';
}

/**
 * Returns true if the meeting has ended (user left the call).
 */
export function isMeetingEnded(): boolean {
  const body = document.body.textContent ?? '';

  // English
  if (body.includes('You left the call') || body.includes('The call has ended')) {
    console.debug(TAG, 'meeting ended detected (EN)');
    return true;
  }

  // Russian
  if (body.includes('Вы вышли из звонка') || body.includes('Звонок завершён') || body.includes('Звонок завершен')) {
    console.debug(TAG, 'meeting ended detected (RU)');
    return true;
  }

  // Generic: "Return to home screen" button visible
  const returnBtn = document.querySelector<HTMLElement>('[aria-label="Return to home screen"], [aria-label="Вернуться на главный экран"]');
  if (returnBtn?.offsetParent !== null) {
    console.debug(TAG, 'meeting ended detected (return button)');
    return true;
  }

  return false;
}
