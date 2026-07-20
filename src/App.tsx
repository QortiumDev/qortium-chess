import { useEffect, useState } from 'react';
import { getBridgeState, qdnRequest } from './qdnRequest';
import type { BridgeState, NodeStatus } from './types';
import { Board } from './ui/Board';

const APP_TITLE = 'Chess';

function describeRuntime(bridgeState: BridgeState | null) {
  if (!bridgeState) return 'Detecting runtime…';
  return bridgeState.isHomeBridge ? 'Qortium Home' : 'Local browser (read-only fallback)';
}

function describeNode(status: NodeStatus | null) {
  if (!status) return 'node unavailable';
  if (typeof status.height === 'number') {
    const sync = typeof status.syncPercent === 'number' ? ` · ${status.syncPercent}%` : '';
    return `height ${status.height.toLocaleString()}${sync}`;
  }
  return 'node connected';
}

export function App() {
  const [bridgeState, setBridgeState] = useState<BridgeState | null>(null);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [state, status] = await Promise.all([
        getBridgeState().catch(() => null),
        qdnRequest<NodeStatus>({ action: 'GET_NODE_STATUS' }).catch(() => null),
      ]);
      if (!cancelled) {
        setBridgeState(state);
        setNodeStatus(status);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Qortium</p>
            <h1>{APP_TITLE}</h1>
          </div>
          <p className="runtime-note">
            {describeRuntime(bridgeState)} · {describeNode(nodeStatus)}
          </p>
        </header>

        <p className="intro">
          Local board (hot-seat) — play both sides. Networked games over Qortium chat are the
          next milestone.
        </p>

        <Board />
      </section>
    </main>
  );
}
