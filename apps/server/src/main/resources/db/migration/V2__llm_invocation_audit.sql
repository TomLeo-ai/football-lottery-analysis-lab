alter table analysis_report
    add column if not exists provider_key varchar(64);

alter table analysis_report
    add column if not exists model_id varchar(128);

alter table analysis_report
    add column if not exists prompt_version varchar(128);

alter table analysis_report
    add column if not exists strategy_parameters_json clob;

alter table analysis_report
    add column if not exists safety_status varchar(64);

alter table analysis_report
    add column if not exists llm_audit_id varchar(64);

alter table simulated_plan
    add column if not exists strategy_parameters_json clob;

alter table review_record
    add column if not exists review_engine_type varchar(64);

alter table review_record
    add column if not exists provider_key varchar(64);

alter table review_record
    add column if not exists model_id varchar(128);

alter table review_record
    add column if not exists prompt_version varchar(128);

alter table review_record
    add column if not exists strategy_parameters_json clob;

alter table review_record
    add column if not exists llm_insight_json clob;

alter table review_record
    add column if not exists safety_status varchar(64);

alter table review_record
    add column if not exists llm_audit_id varchar(64);

create table if not exists llm_invocation_audit (
    audit_id varchar(64) not null,
    business_type varchar(64) not null,
    business_id varchar(64) not null,
    provider_key varchar(64) not null,
    model_id varchar(128) not null,
    prompt_version varchar(128) not null,
    input_hash varchar(64) not null,
    output_hash varchar(64),
    prompt_tokens int,
    completion_tokens int,
    total_tokens int,
    latency_ms bigint,
    safety_status varchar(64) not null,
    error_code varchar(128),
    created_at varchar(64) not null,
    primary key (audit_id)
);

create index if not exists idx_llm_invocation_audit_business
    on llm_invocation_audit (business_type, business_id);
