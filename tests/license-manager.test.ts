import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LicenseManager } from '../chrome-extension/src/lib/license-manager';

describe('LicenseManager', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
            const res: Record<string, any> = {};
            keys.forEach(k => {
              if (k in mockStorage) res[k] = mockStorage[k];
            });
            return res;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(mockStorage, items);
          })
        }
      }
    };
  });

  it('initializes in Free tier with 10 monthly captures', async () => {
    const status = await LicenseManager.getStatus();

    expect(status.tier).toBe('free');
    expect(status.isPro).toBe(false);
    expect(status.monthlyUsage).toBe(0);
    expect(status.monthlyLimit).toBe(10);
    expect(status.canCapture).toBe(true);
  });

  it('tracks capture count and blocks on quota exhaustion', async () => {
    // Record 10 captures
    for (let i = 0; i < 9; i++) {
      await LicenseManager.recordCapture();
    }
    const status9 = await LicenseManager.getStatus();
    expect(status9.monthlyUsage).toBe(9);
    expect(status9.canCapture).toBe(true);

    const status10 = await LicenseManager.recordCapture();
    expect(status10.monthlyUsage).toBe(10);
    expect(status10.canCapture).toBe(false); // Quota hit!
  });

  it('activates Pro and Lifetime licenses and grants unlimited captures', async () => {
    // Set 15 captures on free tier (exceeded)
    const month = LicenseManager.getCurrentMonthKey();
    mockStorage[`usage_${month}`] = 15;

    let status = await LicenseManager.getStatus();
    expect(status.canCapture).toBe(false);

    // Activate Lifetime license
    const activation = await LicenseManager.activateLicense('LIFETIME-A1B2-C3D4-E5F6');
    expect(activation.success).toBe(true);
    expect(activation.status.tier).toBe('lifetime');
    expect(activation.status.isPro).toBe(true);
    expect(activation.status.monthlyLimit).toBe(Infinity);
    expect(activation.status.canCapture).toBe(true); // Unlocked!
  });

  it('rejects invalid license key formats', async () => {
    const res = await LicenseManager.activateLicense('invalid-key-123');
    expect(res.success).toBe(false);
    expect(res.message).toContain('Invalid license key format');
  });
});
