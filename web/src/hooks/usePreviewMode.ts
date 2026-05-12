import { useMemo } from 'react';
import { isProductionBuild } from '../lib/environment';

/**
 * Preview mode (`?preview=true`) renders the dev-only labels that won't
 * exist on the actual mounted pump: the `$` / `SALE` flank labels around
 * Zone 1, the `$` prefix on Zone 5, the zone headers, and the bottom debug
 * strip. The real pump face has these as vinyl stickers; in production-kiosk
 * mode we render only the values inside the physical cutouts.
 *
 * Always returns false in production builds — the kiosk view ignores the URL
 * param so a bookmarked dev URL can't accidentally surface dev artifacts on
 * the installed displays.
 */
export function usePreviewMode(): boolean {
  return useMemo(() => {
    if (isProductionBuild()) return false;
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('preview') === 'true';
  }, []);
}
