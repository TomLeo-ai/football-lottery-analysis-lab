package org.footballlab.plan.repository;

import java.util.List;
import java.util.Optional;

import org.footballlab.plan.domain.SimulatedPlanResponse;
import org.footballlab.plan.persistence.SimulatedPlanV2Record;

public interface SimulatedPlanRepository {

    void savePlan(SimulatedPlanResponse plan);

    Optional<SimulatedPlanResponse> findPlan(String planId);

    List<SimulatedPlanResponse> listSavedPlans();

    void insertGeneratedPlan(SimulatedPlanV2Record plan);

    boolean transitionToPendingResult(String planId, String operatorNote, String updatedAt);

    Optional<SimulatedPlanV2Record> findV2ById(String planId);

    Optional<SimulatedPlanV2Record> findV2ByReportId(String reportId);

    Optional<SimulatedPlanResponse> findAnyById(String planId);

    long nextPlanSequence();

    long nextPlanItemSequence();
}
