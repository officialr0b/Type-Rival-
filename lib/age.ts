export type AgeBand = 'under13' | 'teen' | 'adult';

export function parseAgeBand(value: string | string[] | null | undefined): AgeBand | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'under13' || candidate === 'teen' || candidate === 'adult'
    ? candidate
    : null;
}
