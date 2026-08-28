import TypeRivalApp from './typerival-app';

export default function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabaseConfig = url && publishableKey ? { url, publishableKey } : null;

  return <TypeRivalApp supabaseConfig={supabaseConfig} />;
}
