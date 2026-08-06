/* Country-specific Excel template with valid jurisdiction and category codes. */
import { handler, auth } from '@/lib/api';
import { q } from '@/lib/db';
import { complianceTemplate } from '@/lib/excel';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  await auth();
  const country = new URL(req.url).searchParams.get('country') ?? '';

  const [countries, categories, jurisdictions] = await Promise.all([
    q<{ code: string; name: string }>(`SELECT code, name FROM countries ORDER BY name`),
    q<{ id: string; name: string }>(`SELECT id, name FROM categories ORDER BY sort_order`),
    q<{ id: string; name: string; level: string }>(
      country
        ? `SELECT id, name, level FROM jurisdictions WHERE country_code = $1 AND is_active ORDER BY level, name`
        : `SELECT id, name, level FROM jurisdictions WHERE is_active ORDER BY country_code, level, name`,
      country ? [country] : []),
  ]);

  const cName = countries.find(c => c.code === country)?.name;
  const buf = complianceTemplate({
    countryCode: country || undefined, countryName: cName,
    jurisdictions, categories,
  });

  const fname = `SGCMP_Compliance_Template${country ? '_' + country : ''}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${fname}"`,
      'cache-control': 'no-store',
    },
  });
});
