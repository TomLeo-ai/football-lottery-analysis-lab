create table if not exists ocr_workflow (
  workflow_id varchar(64) primary key,
  current_stage varchar(64) not null,
  version bigint not null,
  current_ocr_task_id varchar(64),
  confirmed_snapshot_id varchar(64),
  current_report_id varchar(64),
  current_plan_id varchar(64),
  active_operation_type varchar(64),
  active_operation_key varchar(64),
  created_at varchar(64) not null,
  updated_at varchar(64) not null
);

create index if not exists idx_ocr_workflow_stage_updated_at
  on ocr_workflow (current_stage, updated_at);

create table if not exists workflow_operation (
  idempotency_key varchar(64) primary key,
  workflow_id varchar(64),
  operation_type varchar(64) not null,
  request_sha256 varchar(64) not null,
  operation_status varchar(32) not null,
  result_type varchar(64),
  result_id varchar(64),
  error_code varchar(128),
  http_status integer,
  created_at varchar(64) not null,
  updated_at varchar(64) not null,
  constraint fk_workflow_operation_workflow foreign key (workflow_id)
    references ocr_workflow(workflow_id)
);

create index if not exists idx_workflow_operation_workflow_status
  on workflow_operation (workflow_id, operation_status);

create table if not exists ocr_review_draft (
  ocr_task_id varchar(64) primary key,
  workflow_id varchar(64) not null,
  revision bigint not null,
  draft_status varchar(32) not null,
  risk_preference varchar(64),
  budget_amount decimal(18,2),
  currency varchar(16),
  matches_json clob not null,
  markets_json clob not null,
  schema_version varchar(64) not null,
  updated_at varchar(64) not null,
  constraint fk_review_draft_ocr_task foreign key (ocr_task_id) references ocr_task(ocr_task_id),
  constraint fk_review_draft_workflow foreign key (workflow_id) references ocr_workflow(workflow_id)
);

create index if not exists idx_ocr_review_draft_workflow
  on ocr_review_draft (workflow_id);

alter table screenshot_task
  add column if not exists workflow_id varchar(64);

alter table screenshot_task
  add column if not exists source_declaration varchar(64);

alter table screenshot_task
  add column if not exists source_policy_version varchar(64);

alter table screenshot_task
  add column if not exists authority_type varchar(64);

alter table screenshot_task
  add column if not exists provenance_json clob;

alter table screenshot_task
  add column if not exists schema_version varchar(64);

alter table ocr_task
  add column if not exists workflow_id varchar(64);

alter table ocr_task
  add column if not exists candidate_schema_version varchar(64);

alter table ocr_task
  add column if not exists authority_type varchar(64);

alter table ocr_task
  add column if not exists provenance_json clob;

alter table ocr_confirmed_snapshot
  add column if not exists workflow_id varchar(64);

alter table ocr_confirmed_snapshot
  add column if not exists confirmed_revision bigint;

alter table ocr_confirmed_snapshot
  add column if not exists authority_type varchar(64);

alter table ocr_confirmed_snapshot
  add column if not exists provenance_json clob;

alter table ocr_confirmed_snapshot
  add column if not exists schema_version varchar(64);

alter table analysis_report
  add column if not exists workflow_id varchar(64);

alter table analysis_report
  add column if not exists authority_type varchar(64);

alter table analysis_report
  add column if not exists provenance_json clob;

alter table analysis_report
  add column if not exists schema_version varchar(64);

alter table simulated_plan
  add column if not exists workflow_id varchar(64);

alter table simulated_plan
  add column if not exists authority_type varchar(64);

alter table simulated_plan
  add column if not exists provenance_json clob;

alter table simulated_plan
  add column if not exists schema_version varchar(64);

alter table simulated_plan_item
  alter column odds decimal(18,4);

alter table screenshot_task
  add constraint fk_screenshot_task_workflow
    foreign key (workflow_id) references ocr_workflow(workflow_id);

alter table screenshot_task
  add constraint uq_screenshot_task_workflow_task
    unique (workflow_id, task_id);

alter table ocr_task
  add constraint fk_ocr_task_workflow
    foreign key (workflow_id) references ocr_workflow(workflow_id);

alter table ocr_task
  add constraint uq_ocr_task_workflow_task
    unique (workflow_id, ocr_task_id);

alter table ocr_task
  add constraint fk_ocr_task_workflow_screenshot
    foreign key (workflow_id, screenshot_task_id) references screenshot_task(workflow_id, task_id);

alter table ocr_review_draft
  add constraint fk_review_draft_workflow_ocr_task
    foreign key (workflow_id, ocr_task_id) references ocr_task(workflow_id, ocr_task_id);

alter table ocr_confirmed_snapshot
  add constraint fk_snapshot_workflow
    foreign key (workflow_id) references ocr_workflow(workflow_id);

alter table ocr_confirmed_snapshot
  add constraint uq_snapshot_workflow
    unique (workflow_id);

alter table ocr_confirmed_snapshot
  add constraint uq_snapshot_workflow_snapshot
    unique (workflow_id, snapshot_id);

alter table ocr_confirmed_snapshot
  add constraint uq_snapshot_ocr_revision
    unique (ocr_task_id, confirmed_revision);

alter table ocr_confirmed_snapshot
  add constraint fk_snapshot_workflow_ocr_task
    foreign key (workflow_id, ocr_task_id) references ocr_task(workflow_id, ocr_task_id);

alter table analysis_report
  add constraint fk_analysis_report_workflow
    foreign key (workflow_id) references ocr_workflow(workflow_id);

alter table analysis_report
  add constraint uq_analysis_report_workflow
    unique (workflow_id);

alter table analysis_report
  add constraint uq_analysis_report_workflow_report
    unique (workflow_id, report_id);

alter table analysis_report
  add constraint uq_analysis_report_workflow_report_snapshot
    unique (workflow_id, report_id, snapshot_id);

alter table analysis_report
  add constraint fk_analysis_report_workflow_snapshot
    foreign key (workflow_id, snapshot_id) references ocr_confirmed_snapshot(workflow_id, snapshot_id);

alter table simulated_plan
  add constraint fk_simulated_plan_workflow
    foreign key (workflow_id) references ocr_workflow(workflow_id);

alter table simulated_plan
  add constraint uq_simulated_plan_workflow
    unique (workflow_id);

alter table simulated_plan
  add constraint uq_simulated_plan_workflow_plan
    unique (workflow_id, plan_id);

alter table simulated_plan
  add constraint fk_simulated_plan_workflow_report_snapshot
    foreign key (workflow_id, report_id, snapshot_id)
      references analysis_report(workflow_id, report_id, snapshot_id);
