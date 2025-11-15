import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type AgencyRow = {
  id?: string | null;
  agency_id?: string | null;
  agencyid?: string | null;
  name?: string | null;
};

type AgenciesResponse =
  | {
      agencies: { id: string; name: string }[];
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AgenciesResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('tbl_agencies')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load agencies:', error);
      return res.status(500).json({ error: 'Unable to load agencies.' });
    }

    const agencies =
      (data as AgencyRow[] | null)?.map((agency) => {
        const stableId =
          agency.agency_id ??
          agency.agencyid ??
          agency.id ??
          '';
        const friendlyName =
          agency.name?.trim() ??
          agency.agency_id ??
          agency.agencyid ??
          stableId ||
          'Untitled Agency';

        return {
          id: stableId,
          name: friendlyName,
        };
      }) ?? [];

    return res.status(200).json({ agencies });
  } catch (error) {
    console.error('Agencies API error:', error);
    return res.status(500).json({ error: 'Unexpected error occurred.' });
  }
}
