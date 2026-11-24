-- Older browser-generated audit entries copied complete form payloads.
-- Retain the action, actor, entity and non-sensitive fields while removing
-- civil/file numbers, free-text notes and credential-related values.
update public.audit_logs
set old_values = old_values - array[
      'file_number','civil_id','civil_hash','pin','pin_hash','pin_verifier',
      'phone_number','notes','attachment_url','reason','rejection_reason'
    ],
    new_values = new_values - array[
      'file_number','civil_id','civil_hash','pin','pin_hash','pin_verifier',
      'phone_number','notes','attachment_url','reason','rejection_reason'
    ]
where coalesce(old_values,'{}'::jsonb) ?| array[
      'file_number','civil_id','civil_hash','pin','pin_hash','pin_verifier',
      'phone_number','notes','attachment_url','reason','rejection_reason'
    ]
   or coalesce(new_values,'{}'::jsonb) ?| array[
      'file_number','civil_id','civil_hash','pin','pin_hash','pin_verifier',
      'phone_number','notes','attachment_url','reason','rejection_reason'
    ];
