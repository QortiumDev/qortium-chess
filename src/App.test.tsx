// @vitest-environment jsdom
//
// Shell-level contracts that need a mounted tree: the host display-settings
// listener composing a synchronous batch of messages, and the workspace tabs
// announcing the active workspace through aria-current.

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { applyDisplaySettings, getInitialDisplaySettings } from './displaySettings';
import type { ChessServiceState } from './game/useChessService';

const spectator: ChessServiceState & { refreshMembership: () => void } = {
  status: 'spectator',
  address: null,
  accountName: null,
  isGroupMember: false,
  service: null,
  games: [],
  error: null,
  refreshMembership: () => {},
};

vi.mock('./game/useChessService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./game/useChessService')>()),
  useChessService: () => spectator,
}));

function postDisplayMessage(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=lobby');
  // main.tsx stamps the initial settings before the tree mounts.
  applyDisplaySettings(getInitialDisplaySettings());
});

afterEach(cleanup);

describe('App display-settings listener', () => {
  it('composes several synchronous host messages instead of dropping earlier ones', () => {
    render(<App />);
    const root = document.documentElement;

    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('green');

    // Both arrive before React can re-render: only a functional update keeps
    // the first one.
    act(() => {
      postDisplayMessage({ action: 'THEME_CHANGED', theme: 'dark' });
      postDisplayMessage({ action: 'ACCENT_CHANGED', accent: 'clay' });
      postDisplayMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'huge' });
    });

    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('clay');
    expect(root.dataset.textSize).toBe('huge');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('keeps the previous settings when a message is invalid', () => {
    render(<App />);
    const root = document.documentElement;

    act(() => {
      postDisplayMessage({ action: 'ACCENT_CHANGED', accent: 'blue' });
      postDisplayMessage({ action: 'ACCENT_CHANGED', accent: 'mauve' });
      postDisplayMessage({ action: 'UNRELATED' });
    });

    expect(root.dataset.accent).toBe('blue');
  });
});

describe('App workspace tabs', () => {
  it('marks exactly the active workspace with aria-current="page" and follows navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const lobby = screen.getByRole('button', { name: 'Lobby' });
    const local = screen.getByRole('button', { name: 'Local board' });
    const developers = screen.getByRole('button', { name: 'Developers' });

    expect(lobby).toHaveAttribute('aria-current', 'page');
    expect(local).not.toHaveAttribute('aria-current');
    expect(developers).not.toHaveAttribute('aria-current');

    await user.click(developers);

    expect(developers).toHaveAttribute('aria-current', 'page');
    expect(lobby).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1);
    expect(new URLSearchParams(window.location.search).get('view')).toBe('developers');

    await user.click(local);

    expect(local).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1);
  });
});
