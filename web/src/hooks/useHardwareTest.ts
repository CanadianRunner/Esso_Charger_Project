import { useCallback, useState } from 'react';
import type { HardwareTestResponse } from '../types/AdminSettings';

export type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'done'; result: HardwareTestResponse };

/**
 * Drives one test-connection button on the Hardware tab. The hook itself
 * has no idea what's being tested — the caller passes the endpoint path
 * ('test-hpwc' or 'test-shelly') and the host to probe.
 */
export function useHardwareTest(endpoint: 'test-hpwc' | 'test-shelly') {
  const [state, setState] = useState<TestState>({ status: 'idle' });

  const run = useCallback(async (host: string) => {
    setState({ status: 'testing' });
    try {
      const res = await fetch(`/api/admin/hardware/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host }),
        credentials: 'same-origin',
      });
      const result = (await res.json()) as HardwareTestResponse;
      setState({ status: 'done', result });
    } catch (e) {
      setState({
        status: 'done',
        result: {
          success: false,
          latencyMs: 0,
          error: e instanceof Error ? e.message : 'Network error',
          details: null,
        },
      });
    }
  }, [endpoint]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
