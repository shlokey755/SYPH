/**
 * useLinkPreview.ts
 * State for one YouTube link card: 'loading' until the oEmbed lookup answers, then the result. Passing null (the
 * message has no YouTube link) does nothing.
 */

import { useEffect, useState } from 'react';
import { fetchPreview, peekPreview } from '../services/linkPreviewService';
import { PreviewResult, YouTubeLink } from '../utils/linkPreview';

export type LinkPreviewState = { state: 'loading' } | PreviewResult;

export function useLinkPreview(link: YouTubeLink | null): LinkPreviewState {
  const id = link?.id ?? null;
  const [result, setResult] = useState<{ id: string; value: PreviewResult } | null>(() => {
    const hit = id ? peekPreview(id) : null;
    return id && hit ? { id, value: hit } : null;
  });

  useEffect(() => {
    if (!link) return;
    let active = true;
    fetchPreview(link).then((value) => {
      if (active) setResult({ id: link.id, value });
    });
    return () => {
      active = false;
    };
    // The link object is rebuilt each render; its id is what identifies the video.
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A result for another video (the message text was edited) must not show on this card.
  return result && result.id === id ? result.value : { state: 'loading' };
}
