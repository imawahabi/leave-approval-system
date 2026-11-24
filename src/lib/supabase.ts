import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createShowcaseMockClient } from './showcase/mockClient';

/**
 * SHOWCASE MOCK SWITCH - see src/lib/showcase/README.md.
 *
 * When (and only when) the app is built/run with VITE_SHOWCASE_MOCK=1, the
 * exported `supabase` client is an in-browser mock backed by fictional seed
 * data, so the UI can be presented and screenshotted without any backend.
 * The flag is OFF by default: unset it and the real Supabase client below
 * is created exactly as before - no mock code path can activate in a
 * normal build or deployment.
 */
const useShowcaseMock = import.meta.env.VITE_SHOWCASE_MOCK === '1';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://your-project.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'YOUR_SUPABASE_ANON_KEY';

const realClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const supabase: SupabaseClient = useShowcaseMock
  ? (createShowcaseMockClient() as unknown as SupabaseClient)
  : realClient;
