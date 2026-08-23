package org.footballlab.analysis.service;

public interface AnalysisEngine {

    String engineMode();

    AnalysisEngineResult generate(AnalysisEngineContext context);
}
