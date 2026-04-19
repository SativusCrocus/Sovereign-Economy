// frontend/components/WalletConnect.tsx
"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS } from "@/lib/config";

function short(addr: string) { return addr.slice(0, 6) + "…" + addr.slice(-4); }

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, chains } = useSwitchChain();

  if (!isConnected) {
    const c = connectors[0];
    return (
      <button className="btn-p" disabled={status === "pending"} onClick={() => c && connect({ connector: c })}>
        {status === "pending" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const chainName = SUPPORTED_CHAINS.find(c => c.id === chainId)?.name ?? `chain ${chainId}`;

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Switch chain"
        className="input !w-auto !py-1 !text-xs"
        value={chainId ?? ""}
        onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
      >
        {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span className="chip-ok font-mono" title={address}>{short(address!)}</span>
      <button className="btn !py-1 !text-xs" onClick={() => disconnect()}>Disconnect</button>
      <span className="sr-only">Connected on {chainName}</span>
    </div>
  );
}
