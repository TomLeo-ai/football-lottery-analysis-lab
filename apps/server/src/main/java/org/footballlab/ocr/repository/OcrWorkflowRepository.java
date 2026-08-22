package org.footballlab.ocr.repository;

import java.util.Optional;

import org.footballlab.ocr.domain.OcrTaskResponse;
import org.footballlab.ocr.domain.ScreenshotTaskResponse;
import org.footballlab.ocr.domain.UserConfirmedSnapshotResponse;

public interface OcrWorkflowRepository {

    void saveScreenshotTask(ScreenshotTaskResponse screenshotTask);

    void saveWorkflowScreenshotTask(
            String workflowId,
            ScreenshotTaskResponse screenshotTask,
            String sourceDeclaration,
            String sourcePolicyVersion);

    boolean existsScreenshotTask(String taskId);

    Optional<ScreenshotTaskResponse> findScreenshotTask(String taskId);

    Optional<ScreenshotTaskResponse> findScreenshotTaskByWorkflowId(String workflowId);

    long nextScreenshotSequence();

    void saveOcrTask(OcrTaskResponse ocrTask);

    boolean existsOcrTask(String ocrTaskId);

    Optional<OcrTaskResponse> findOcrTask(String ocrTaskId);

    long nextOcrSequence();

    void saveConfirmedSnapshot(UserConfirmedSnapshotResponse confirmedSnapshot);

    Optional<UserConfirmedSnapshotResponse> findConfirmedSnapshot(String snapshotId);

    long nextSnapshotSequence();

    void clearWorkflowPayloads(String workflowId);
}
