import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';

const { captureWarningMock, captureErrorMock } = vi.hoisted(() => ({
  captureWarningMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));
vi.mock('@/lib/observability/capture', () => ({
  captureWarning: captureWarningMock,
  captureError: captureErrorMock,
}));

describe('GlobalError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    captureWarningMock.mockClear();
    captureErrorMock.mockClear();
    window.localStorage.clear();
  });

  it('digest 付き（Server Component 起源 = 設定不備）は captureWarning を固定 fingerprint で呼ぶ', () => {
    const error = Object.assign(new Error('opaque server error'), { digest: 'abc123' });
    render(<GlobalError error={error} />);
    expect(captureWarningMock).toHaveBeenCalledWith(error, {
      scope: 'config-error-boundary',
      fingerprint: ['config-error-boundary'],
    });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('digest 無し（Providers 等 Client Component 起源の本物のバグ）は captureError を呼ぶ', () => {
    const error = new Error('real bug in Providers') as Error & { digest?: string };
    render(<GlobalError error={error} />);
    expect(captureErrorMock).toHaveBeenCalledWith(error, { scope: 'config-error-boundary-client' });
    expect(captureWarningMock).not.toHaveBeenCalled();
  });
});
