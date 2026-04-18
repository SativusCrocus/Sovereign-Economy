// frontend/app/providers.tsx
"use client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, optimism, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const wagmiConfig = createConfig({
  chains: [base, optimism, hardhat],
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
  transports: {
    [base.id]:      http(process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org"),
    [optimism.id]:  http(process.env.NEXT_PUBLIC_OP_RPC_URL   ?? "https://mainnet.optimism.io"),
    [hardhat.id]:   http(process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://localhost:8545"),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
