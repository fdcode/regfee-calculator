import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type AgencyRow = {
  id?: string;
  agency_id?: string;
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
      .from('Tbl_Agencies')
      .select('id,agency_id,name')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load agencies:', error);
      return res.status(500).json({ error: 'Unable to load agencies.' });
    }

    const agencies =
      (data as AgencyRow[] | null)?.map((agency) => ({
        id: agency.agency_id ?? agency.id ?? '',
        name:
          agency.name?.trim() ??
          agency.agency_id ??
          agency.id ??
          'Untitled Agency',
      })) ?? [];

    return res.status(200).json({ agencies });
  } catch (error) {
    console.error('Agencies API error:', error);
    return res.status(500).json({ error: 'Unexpected error occurred.' });
  }
}
