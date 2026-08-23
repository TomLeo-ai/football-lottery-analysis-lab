create index if not exists idx_workflow_operation_status_type_updated_at
  on workflow_operation (operation_status, operation_type, updated_at);
