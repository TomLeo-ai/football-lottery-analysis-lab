package org.footballlab.strategy.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.footballlab.strategy.domain.StrategyParameterRequest;
import org.springframework.stereotype.Service;

@Service
public class StrategyParameterDefaultsService {

    public static final String V2_DEFAULTS_VERSION = "STRATEGY_DEFAULTS_V2";

    private final AtomicReference<StrategyParameterRequest> defaults = new AtomicReference<>(new StrategyParameterRequest(
            BigDecimal.valueOf(20).setScale(2),
            "CNY",
            5,
            5,
            6,
            "BALANCED",
            BigDecimal.valueOf(0.60),
            BigDecimal.valueOf(0.30),
            BigDecimal.valueOf(0.10),
            true,
            BigDecimal.valueOf(2).setScale(2),
            4,
            List.of("WIN_DRAW_LOSS"),
            List.of(),
            "DISABLED",
            null,
            false,
            "BALANCED"));

    public StrategyParameterRequest getDefaults() {
        return defaults.get();
    }

    public StrategyParameterRequest updateDefaults(StrategyParameterRequest nextDefaults) {
        defaults.set(nextDefaults);
        return defaults.get();
    }
}
