alter table analysis_report
  add column if not exists llm_output_json clob;

alter table analysis_report
  add column if not exists strategy_defaults_version varchar(64);

alter table analysis_report
  add column if not exists authority_revision bigint;

alter table analysis_report
  add column if not exists authority_snapshot_id varchar(64);

alter table analysis_report
  add constraint fk_analysis_report_authority_snapshot
    foreign key (workflow_id, authority_snapshot_id)
      references ocr_confirmed_snapshot(workflow_id, snapshot_id);
