import { createContext, useContext, useState, type ReactNode } from "react";

interface SubscriptionState {
  isPro: boolean;
  devProOverride: boolean;
  setDevProOverride: (v: boolean) => void;
  refreshCredits: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  isPro: false,
  devProOverride: false,
  setDevProOverride: () => {},
  refreshCredits: async () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [devProOverride, setDevProOverride] = useState(false);

  const isPro = devProOverride;

  const refreshCredits = async () => {
    // TODO: wire up subscription status check
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isPro,
        devProOverride,
        setDevProOverride,
        refreshCredits,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
