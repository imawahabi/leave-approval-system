import { createClient } from '@supabase/supabase-js';

const url = 'https://your-project.supabase.co';
const serviceKey = 'YOUR_SUPABASE_ANON_KEY';
const sb = createClient(url, serviceKey);

async function inspect() {
  const { data: leaves, error } = await sb
    .from('leadership_leaves')
    .select(`
      *,
      member:leadership_members!leadership_leaves_leadership_member_id_fkey(id, full_name, rank, file_number),
      leave_type:leave_types(name_ar)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leaves:', error);
    return;
  }

  console.log(`\n=== إجمالي الإجازات في قاعدة البيانات: ${leaves.length} ===\n`);

  leaves.forEach((l, idx) => {
    console.log(`[#${idx + 1}] ID: ${l.id}`);
    console.log(`  الموظف: ${l.member?.rank ?? ''} / ${l.member?.full_name ?? ''} (ملف: ${l.member?.file_number ?? ''})`);
    console.log(`  نوع الإجازة: ${l.leave_type?.name_ar ?? 'غير محدد'}`);
    console.log(`  الفترة: من ${l.start_date} إلى ${l.end_date} (تاريخ العودة: ${l.return_date || 'غير محدد'})`);
    console.log(`  حالة الإجازة (status): ${l.status}`);
    console.log(`  حالة الاعتماد (approval_status): ${l.approval_status}`);
    console.log(`  حالة سير العمل (workflow_status): ${l.workflow_status}`);
    console.log(`  مرحلة الاعتماد الحالية (current_approval_stage): ${l.current_approval_stage}`);
    console.log(`  سبب الرفض: ${l.rejection_reason || 'لا يوجد'}`);
    console.log(`  تاريخ الإنشاء: ${l.created_at}`);
    console.log('─'.repeat(60));
  });

  const summary = {};
  leaves.forEach((l) => {
    const key = `workflow: ${l.workflow_status} | approval: ${l.approval_status} | stage: ${l.current_approval_stage}`;
    summary[key] = (summary[key] || 0) + 1;
  });

  console.log('\n=== ملخص الحالات الإحصائي في قاعدة البيانات ===');
  Object.entries(summary).forEach(([k, count]) => {
    console.log(`  ${k} => ${count} إجازة`);
  });
}

inspect();
