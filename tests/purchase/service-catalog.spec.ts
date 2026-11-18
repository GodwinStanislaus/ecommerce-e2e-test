import { test, expect } from '../../fixtures';
import { PurchaseOrderPage } from '../../pages/purchase-order.page';

interface ServiceCatalog {
  services: { code: string; name: string; sacCode: string; defaultGstRate: number; allowedGstRates: number[] }[];
  gstOptions: number[];
}

test.describe('Purchase service catalog (served by the API)', () => {
  test('API serves freight and insurance service lines with SAC and GST rules', async ({ api }) => {
    const catalog = await api.get<ServiceCatalog>('/purchase-service-catalog');
    const profile = await api.get('/business-profile/active');

    const freight = catalog.services.find((s) => s.code === 'FREIGHT');
    expect(freight, 'FREIGHT is offered').toBeTruthy();
    // Freight SAC is the business profile's setting, falling back to the system default
    expect(freight!.sacCode).toBe(profile.freightSacCode || '996511');
    expect(freight!.allowedGstRates).toContain(freight!.defaultGstRate);

    const insurance = catalog.services.find((s) => s.code === 'INSURANCE');
    expect(insurance, 'INSURANCE is offered').toBeTruthy();
    expect(insurance).toMatchObject({ sacCode: '997139', defaultGstRate: 18 });
    expect(catalog.gstOptions).toEqual([0, 5, 12, 18, 28]);
  });

  test('a new purchase order starts with the Freight service line from the API catalog', async ({ page, api }) => {
    const catalog = await api.get<ServiceCatalog>('/purchase-service-catalog');
    const freight = catalog.services.find((s) => s.code === 'FREIGHT')!;
    const po = new PurchaseOrderPage(page);

    await po.gotoNew();

    // Default service line: SAC and default GST come from the API, not the UI
    await expect(po.serviceSac.first()).toHaveValue(freight.sacCode);
    await expect(po.serviceGstRate.first()).toHaveValue(String(freight.defaultGstRate));
    // The GST rate choices are the API's slabs
    const options = await po.serviceGstRate.first().locator('option').allTextContents();
    expect(options.map((o) => Number(o.replace(/[^0-9.]/g, '')))).toEqual(expect.arrayContaining(catalog.gstOptions));
  });
});
