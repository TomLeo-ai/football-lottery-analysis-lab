import { defineStore } from 'pinia';

import type { PublicResultProviderStatus } from '@/types/resultProvider';

interface ResultProviderState {
  status: PublicResultProviderStatus | null;
}

export const useResultProviderStore = defineStore('resultProvider', {
  state: (): ResultProviderState => ({
    status: null
  }),
  actions: {
    setStatus(status: PublicResultProviderStatus) {
      this.status = status;
    }
  }
});
