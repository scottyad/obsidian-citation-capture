import { LicenseStatus, LicenseTier } from '@obsidian-citation/shared';

export class LicenseManager {
  public static readonly FREE_LIMIT = 10;
  public static readonly DEFAULT_CLOUD_CREDITS = 200;

  public static getCurrentMonthKey(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  }

  public static async getStatus(): Promise<LicenseStatus> {
    const currentMonth = this.getCurrentMonthKey();
    const usageKey = `usage_${currentMonth}`;
    const creditsKey = `credits_${currentMonth}`;

    let storageData: Record<string, any> = {};
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      storageData = await chrome.storage.local.get(['license_key', 'license_tier', usageKey, creditsKey]);
    }

    const licenseKey = storageData.license_key || '';
    let tier: LicenseTier = storageData.license_tier || 'free';

    // Validate license key format if present
    if (licenseKey && this.isValidLicenseFormat(licenseKey)) {
      if (licenseKey.startsWith('PROPLUS-') || licenseKey === 'DEMO-PROPLUS') {
        tier = 'pro_plus';
      } else if (licenseKey.startsWith('LIFETIME-') || licenseKey === 'DEMO-LIFETIME') {
        tier = 'lifetime';
      } else if (licenseKey.startsWith('PRO-') || licenseKey === 'DEMO-PRO') {
        tier = 'pro';
      }
    }

    const isPro = tier !== 'free';
    const monthlyUsage = Number(storageData[usageKey] || 0);
    const monthlyLimit = isPro ? Infinity : this.FREE_LIMIT;
    const canCapture = isPro || monthlyUsage < this.FREE_LIMIT;

    let cloudCreditsRemaining: number | undefined;
    if (tier === 'pro_plus') {
      cloudCreditsRemaining = storageData[creditsKey] !== undefined
        ? Number(storageData[creditsKey])
        : this.DEFAULT_CLOUD_CREDITS;
    }

    return {
      tier,
      isPro,
      monthlyUsage,
      monthlyLimit,
      canCapture,
      lastResetMonth: currentMonth,
      licenseKey: licenseKey || undefined,
      cloudCreditsRemaining
    };
  }

  public static async recordCapture(): Promise<LicenseStatus> {
    const status = await this.getStatus();
    const currentMonth = this.getCurrentMonthKey();
    const usageKey = `usage_${currentMonth}`;
    const newUsage = status.monthlyUsage + 1;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [usageKey]: newUsage });
    }

    return {
      ...status,
      monthlyUsage: newUsage,
      canCapture: status.isPro || newUsage < this.FREE_LIMIT
    };
  }

  public static async deductCloudCredit(): Promise<number> {
    const status = await this.getStatus();
    const currentMonth = this.getCurrentMonthKey();
    const creditsKey = `credits_${currentMonth}`;
    const currentCredits = status.cloudCreditsRemaining ?? this.DEFAULT_CLOUD_CREDITS;
    const remaining = Math.max(0, currentCredits - 1);

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [creditsKey]: remaining });
    }

    return remaining;
  }

  public static async activateLicense(key: string): Promise<{ success: boolean; status: LicenseStatus; message: string }> {
    const trimmed = key.trim().toUpperCase();
    if (!this.isValidLicenseFormat(trimmed)) {
      const current = await this.getStatus();
      return {
        success: false,
        status: current,
        message: 'Invalid license key format. Keys start with PRO-, PROPLUS-, or LIFETIME-.'
      };
    }

    let tier: LicenseTier = 'pro';
    if (trimmed.startsWith('PROPLUS-') || trimmed === 'DEMO-PROPLUS') {
      tier = 'pro_plus';
    } else if (trimmed.startsWith('LIFETIME-') || trimmed === 'DEMO-LIFETIME') {
      tier = 'lifetime';
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const currentMonth = this.getCurrentMonthKey();
      const updates: Record<string, any> = {
        license_key: trimmed,
        license_tier: tier
      };
      if (tier === 'pro_plus') {
        updates[`credits_${currentMonth}`] = this.DEFAULT_CLOUD_CREDITS;
      }
      await chrome.storage.local.set(updates);
    }

    const updated = await this.getStatus();
    return {
      success: true,
      status: updated,
      message: `Successfully activated ${tier.replace('_', '+').toUpperCase()} license!`
    };
  }

  public static async resetFreeUsage(): Promise<void> {
    const currentMonth = this.getCurrentMonthKey();
    const usageKey = `usage_${currentMonth}`;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [usageKey]: 0 });
    }
  }

  public static isValidLicenseFormat(key: string): boolean {
    const normalized = key.trim().toUpperCase();
    if (normalized === 'DEMO-PRO' || normalized === 'DEMO-LIFETIME' || normalized === 'DEMO-PROPLUS') return true;
    return /^(PRO|PROPLUS|LIFETIME|TEAM)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized);
  }
}
