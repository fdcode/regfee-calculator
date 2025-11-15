import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type ProcedureRow = {
  id?: number | null;
  procedure_id?: number | string | null;
  procedureid?: number | string | null;
  name?: string | null;
  display_name?: string | null;
  displayname?: string | null;
};

type ProceduresResponse =
  | {
      procedures: { id: number; name: string }[];
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProceduresResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('tbl_procedure_types')
      .select('*')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Failed to load procedures:', error);
      return res.status(500).json({ error: 'Unable to load procedures.' });
    }

    const procedures =
      (data as ProcedureRow[] | null)?.map((procedure) => {
        const stableIdRaw =
          procedure.procedure_id ??
          procedure.procedureid ??
          procedure.id ??
          0;
        const stableId =
          typeof stableIdRaw === 'string'
            ? Number(stableIdRaw)
            : stableIdRaw ?? 0;

        const displayName =
          procedure.display_name?.trim() ??
          procedure.displayname?.trim() ??
          procedure.name?.trim() ??
          `Procedure ${stableId || ''}`;

        return {
          id: stableId,
          name: displayName,
        };
      }) ?? [];

    return res.status(200).json({ procedures });
  } catch (error) {
    console.error('Procedures API error:', error);
    return res.status(500).json({ error: 'Unexpected error occurred.' });
  }
}
