export type AgeBand = 'under13' | 'teen' | 'adult';

export const AGE_CHANGE_EVENT = 'typerival-age-changed';
export const AGE_STORAGE_KEY = 'typerival-age-band';

export function parseAgeBand(value: string | string[] | null | undefined): AgeBand | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'under13' || candidate === 'teen' || candidate === 'adult'
    ? candidate
    : null;
}
