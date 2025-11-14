import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type UnitInput = {
  componentId: number;
  quantity: number;
};

type FeeBreakdownItem = {
  componentName: string;
  amount: number;
};

type FeeRuleRecord = {
  id?: number;
  agency_id?: string;
  procedure_id?: number;
  role?: string;
  component_id?: number | null;
  componentId?: number | null;
  amount?: number | string | null;
  included_quantity?: number | string | null;
  includedQuantity?: number | string | null;
  component_name?: string | null;
};

type FeeComponentRecord = {
  id?: number | null;
  component_id?: number | null;
  componentId?: number | null;
  name?: string | null;
  component_name?: string | null;
  display_name?: string | null;
};

type AgencyRecord = {
  currency?: string | null;
  currency_code?: string | null;
};

type ApiSuccessResponse = {
  totalFee: number;
  currency: string;
  feeBreakdown: FeeBreakdownItem[];
};

type ApiErrorResponse = {
  error: string;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normaliseUnits(units: unknown): UnitInput[] {
  if (!Array.isArray(units)) {
    return [];
  }

  return units
    .map((unit) => {
      const componentId = toNumber((unit as UnitInput)?.componentId, NaN);
      const quantity = toNumber((unit as UnitInput)?.quantity, NaN);
      if (
        Number.isNaN(componentId) ||
        Number.isNaN(quantity) ||
        quantity < 0
      ) {
        return null;
      }

      return { componentId, quantity };
    })
    .filter((entry): entry is UnitInput => Boolean(entry));
}

function getRuleComponentId(rule: FeeRuleRecord): number | null {
  const componentId = toNumber(
    rule.component_id ?? rule.componentId,
    Number.NaN,
  );
  return Number.isNaN(componentId) ? null : componentId;
}

function getRuleAmount(rule: FeeRuleRecord): number {
  return Math.max(0, toNumber(rule.amount, 0));
}

function getIncludedQuantity(rule: FeeRuleRecord): number {
  return Math.max(0, toNumber(rule.included_quantity ?? rule.includedQuantity, 0));
}

function getRuleComponentName(
  rule: FeeRuleRecord,
  componentNameMap: Map<number, string>,
  fallbackId: number | null,
): string {
  const fromRule =
    (typeof rule.component_name === 'string' && rule.component_name.trim()) ||
    null;

  if (fromRule) {
    return fromRule;
  }

  if (fallbackId && componentNameMap.has(fallbackId)) {
    return componentNameMap.get(fallbackId) as string;
  }

  if (fallbackId) {
    return `Component ${fallbackId}`;
  }

  return 'Component';
}

async function fetchAgencyCurrency(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<string | null> {
  const trimmedId = agencyId.trim();
  try {
    const { data, error } = await supabase
      .from('Tbl_Agencies')
      .select('currency,currency_code')
      .eq('agency_id', trimmedId)
      .maybeSingle();

    if (error) {
      console.warn('Agency currency lookup error:', error);
      return null;
    }

    if (data) {
      const record = data as AgencyRecord;
      return (
        record.currency?.trim() ||
        record.currency_code?.trim() ||
        null
      );
    }

    const fallback = await supabase
      .from('Tbl_Agencies')
      .select('currency,currency_code')
      .eq('id', trimmedId)
      .maybeSingle();

    if (fallback.error) {
      console.warn('Agency fallback lookup error:', fallback.error);
      return null;
    }

    const fallbackData = fallback.data as AgencyRecord | null;
    return (
      fallbackData?.currency?.trim() ||
      fallbackData?.currency_code?.trim() ||
      null
    );
  } catch (error) {
    console.error('Unexpected agency lookup failure:', error);
    return null;
  }
}

async function fetchComponentNameMap(
  supabase: SupabaseClient,
  componentIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  if (componentIds.length === 0) {
    return map;
  }

  try {
    const { data, error } = await supabase
      .from('Tbl_Fee_Components')
      .select('*')
      .in('component_id', componentIds);

    if (error) {
      console.warn('Fee component lookup error:', error);
      return map;
    }

    (data as FeeComponentRecord[] | null)?.forEach((component) => {
      const id = toNumber(
        component.component_id ?? component.componentId ?? component.id,
        Number.NaN,
      );
      if (Number.isNaN(id)) {
        return;
      }

      const componentName =
        component.component_name?.trim() ||
        component.display_name?.trim() ||
        component.name?.trim();

      if (componentName) {
        map.set(id, componentName);
      }
    });
  } catch (error) {
    console.error('Unexpected component lookup failure:', error);
  }

  return map;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ error: 'Method Not Allowed. Use POST with a JSON body.' });
  }

  const { agencyId, procedureId, role, units: rawUnits } = req.body ?? {};

  if (typeof agencyId !== 'string' || !agencyId.trim()) {
    return res.status(400).json({ error: 'agencyId is required.' });
  }

  const numericProcedureId =
    typeof procedureId === 'number'
      ? procedureId
      : typeof procedureId === 'string'
        ? Number(procedureId)
        : Number.NaN;

  if (Number.isNaN(numericProcedureId)) {
    return res.status(400).json({ error: 'procedureId must be a number.' });
  }

  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'role is required.' });
  }

  const units = normaliseUnits(rawUnits);
  const supabase = getSupabaseServerClient();

  try {
    const { data: feeRulesRaw, error: feeRulesError } = await supabase
      .from('Tbl_Fee_Rules')
      .select('*')
      .eq('agency_id', agencyId.trim())
      .eq('procedure_id', numericProcedureId)
      .eq('role', role.trim());

    if (feeRulesError) {
      console.error('Fee rules query failed:', feeRulesError);
      return res
        .status(500)
        .json({ error: 'Unable to fetch fee rules at this time.' });
    }

    const feeRules = (feeRulesRaw as FeeRuleRecord[] | null) ?? [];

    const agencyCurrency =
      (await fetchAgencyCurrency(supabase, agencyId)) ?? 'USD';

    if (feeRules.length === 0) {
      return res.status(200).json({
        totalFee: 0,
        currency: agencyCurrency,
        feeBreakdown: [],
      });
    }

    const componentIds = Array.from(
      new Set(
        feeRules
          .map((rule) => getRuleComponentId(rule))
          .filter((id): id is number => typeof id === 'number'),
      ),
    );

    const componentNameMap = await fetchComponentNameMap(
      supabase,
      componentIds,
    );

    let totalFee = 0;
    const feeBreakdown: FeeBreakdownItem[] = [];

    for (const rule of feeRules) {
      const componentId = getRuleComponentId(rule);
      if (componentId === null || componentId <= 0) {
        continue;
      }

      const amountPerUnit = getRuleAmount(rule);
      if (amountPerUnit <= 0) {
        continue;
      }

      const componentName = getRuleComponentName(
        rule,
        componentNameMap,
        componentId,
      );

      if (componentId === 1) {
        totalFee += amountPerUnit;
        feeBreakdown.push({
          componentName,
          amount: amountPerUnit,
        });
        continue;
      }

      const matchingUnit = units.find(
        (unit) => unit.componentId === componentId,
      );

      if (!matchingUnit) {
        continue;
      }

      const includedQuantity = getIncludedQuantity(rule);
      const billableQuantity = matchingUnit.quantity - includedQuantity;

      if (billableQuantity <= 0) {
        continue;
      }

      const componentCost = billableQuantity * amountPerUnit;
      totalFee += componentCost;
      feeBreakdown.push({
        componentName: `${componentName} (x${billableQuantity})`,
        amount: componentCost,
      });
    }

    return res.status(200).json({
      totalFee,
      currency: agencyCurrency,
      feeBreakdown,
    });
  } catch (error) {
    console.error('Fee calculation API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.';
    return res.status(500).json({ error: message });
  }
}

export default handler;
