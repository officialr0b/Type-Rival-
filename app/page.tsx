import TypeRivalApp from './typerival-app';
import { parseAgeBand } from '../lib/age';

export default async function Home({ searchParams }: { searchParams: Promise<{ age?: string | string[] }> }) {
  const { age } = await searchParams;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabaseConfig = url && publishableKey ? { url, publishableKey } : null;

  return <TypeRivalApp supabaseConfig={supabaseConfig} initialAgeBand={parseAgeBand(age)} />;
}
