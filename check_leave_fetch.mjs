const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

async function query(table, params = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    }
  });
  return res.json();
}

async function run() {
  console.log('--- Search Member ---');
  const members = await query('leadership_members', 'full_name=ilike.*ابوحيمد*&select=id,full_name,file_number,rank,job_title');
  console.log('Members:', JSON.stringify(members, null, 2));

  if (members && members.length > 0) {
    for (const m of members) {
      console.log(`--- Leaves for ${m.full_name} (${m.id}) ---`);
      const leaves = await query('leadership_leaves', `leadership_member_id=eq.${m.id}&select=*`);
      console.log('Leaves:', JSON.stringify(leaves, null, 2));
    }
  }

  console.log('--- Last 5 leaves created ---');
  const lastLeaves = await query('leadership_leaves', 'order=created_at.desc&limit=5&select=id,leadership_member_id,start_date,end_date,approval_status,status,workflow_status,current_approval_stage,created_at');
  console.log('Last leaves:', JSON.stringify(lastLeaves, null, 2));

  console.log('--- Test review_queue_scoped undersecretary ---');
  const rpcUndersecretary = await fetch(`${supabaseUrl}/rest/v1/rpc/review_queue_scoped`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_stage: 'undersecretary' })
  }).then(r => r.json());
  console.log('Review queue (undersecretary):', JSON.stringify(rpcUndersecretary, null, 2));

  console.log('--- Test review_queue_scoped minister ---');
  const rpcMinister = await fetch(`${supabaseUrl}/rest/v1/rpc/review_queue_scoped`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_stage: 'minister' })
  }).then(r => r.json());
  console.log('Review queue (minister):', JSON.stringify(rpcMinister, null, 2));
}

run().catch(console.error);
