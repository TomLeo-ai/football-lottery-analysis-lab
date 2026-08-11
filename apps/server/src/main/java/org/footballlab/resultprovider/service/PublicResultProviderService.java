package org.footballlab.resultprovider.service;

import org.footballlab.resultprovider.domain.PublicResultProviderStatusResponse;
import org.footballlab.resultprovider.domain.PublicResultProviderSyncRequest;

public interface PublicResultProviderService {

    PublicResultProviderStatusResponse sync(PublicResultProviderSyncRequest request);

    PublicResultProviderStatusResponse status();
}
