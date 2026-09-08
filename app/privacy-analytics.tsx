'use client';

import { useSyncExternalStore } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { AGE_CHANGE_EVENT, AGE_STORAGE_KEY, parseAgeBand } from '../lib/age';

function subscribe(onStoreChange: () => void) {
  window.addEventListener(AGE_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(AGE_CHANGE_EVENT, onStoreChange);
}

function analyticsEnabledInBrowser() {
  const queryAge = parseAgeBand(new URLSearchParams(window.location.search).get('age'));
  const storedAge = parseAgeBand(window.localStorage.getItem(AGE_STORAGE_KEY));
  return Boolean(queryAge ?? storedAge) && (queryAge ?? storedAge) !== 'under13';
}

export default function PrivacyAnalytics() {
  const enabled = useSyncExternalStore(subscribe, analyticsEnabledInBrowser, () => false);

  return enabled ? <Analytics /> : null;
}
