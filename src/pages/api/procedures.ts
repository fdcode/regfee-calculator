import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type ProcedureRow = {
  id?: number;
  procedure_id?: number;
  name?: string | null;
  display_name?: string | null;
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
      .from('Tbl_Procedure_Types')
      .select('id,procedure_id,name,display_name')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Failed to load procedures:', error);
      return res.status(500).json({ error: 'Unable to load procedures.' });
    }

    const procedures =
      (data as ProcedureRow[] | null)?.map((procedure) => ({
        id: procedure.procedure_id ?? procedure.id ?? 0,
        name:
          procedure.display_name?.trim() ||
          procedure.name?.trim() ||
          `Procedure ${procedure.id ?? ''}`,
      })) ?? [];

    return res.status(200).json({ procedures });
  } catch (error) {
    console.error('Procedures API error:', error);
    return res.status(500).json({ error: 'Unexpected error occurred.' });
  }
}
