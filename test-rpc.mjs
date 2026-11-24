import { createClient } from '@supabase/supabase-js';

const url = 'https://your-project.supabase.co';
const anon = 'YOUR_SUPABASE_ANON_KEY';

const supabase = createClient(url, anon);

async function test() {
  const { data, error } = await supabase.functions.invoke('civil-auth', {
    body: { action: 'ping' }
  });
  console.log('civil-auth ping:', { data, error });
}

test();
