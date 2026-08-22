package org.footballlab.ocr;

import org.springframework.jdbc.core.JdbcTemplate;

final class TestDatabaseCleaner {

    private TestDatabaseCleaner() {
    }

    static void clean(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.update("delete from workflow_operation");
        jdbcTemplate.update("delete from ocr_review_draft");
        jdbcTemplate.update("delete from simulated_plan_item");
        jdbcTemplate.update("delete from review_record");
        jdbcTemplate.update("delete from simulated_plan");
        jdbcTemplate.update("delete from analysis_report");
        jdbcTemplate.update("delete from ocr_confirmed_snapshot");
        jdbcTemplate.update("delete from ocr_task");
        jdbcTemplate.update("delete from screenshot_task");
        jdbcTemplate.update("delete from ocr_workflow");
    }
}
