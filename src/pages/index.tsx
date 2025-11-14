import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import ChatWindow, { type ChatMessage } from '@/components/ChatWindow';

type Agency = {
  id: string;
  name: string;
};

type ProcedureType = {
  id: number;
  name: string;
};

type UnitEntry = {
  componentId: number;
  quantity: number;
};

type FeeBreakdownItem = {
  componentName: string;
  amount: number;
};

type FeeCalculationResponse = {
  totalFee: number;
  currency: string;
  feeBreakdown: FeeBreakdownItem[];
};

const ROLE_OPTIONS = ['National', 'CMS', 'RMS'] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];

type AssistantIntentPayload = {
  agencyId: string;
  procedureId: number;
  role: RoleOption;
  units?: UnitEntry[];
};

const BASE_UNIT_INPUTS = [
  { componentId: 2, label: 'Number of Strengths' },
  { componentId: 4, label: 'Number of Presentations' },
];

const createDefaultUnits = (): UnitEntry[] =>
  BASE_UNIT_INPUTS.map(({ componentId }) => ({ componentId, quantity: 0 }));

const normaliseRole = (value: unknown): RoleOption | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return (
    ROLE_OPTIONS.find(
      (role) => role.toLowerCase() === value.toLowerCase().trim(),
    ) ?? null
  );
};

const parseAssistantJsonResponse = (
  value: unknown,
): AssistantIntentPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const agencyCandidate =
    (typeof data.agencyId === 'string' && data.agencyId) ||
    (typeof data.agency_id === 'string' && data.agency_id) ||
    '';
  const agencyId = agencyCandidate.trim();

  const rawProcedure = data.procedureId ?? data.procedure_id;
  const procedureId =
    typeof rawProcedure === 'number'
      ? rawProcedure
      : typeof rawProcedure === 'string' && rawProcedure.trim()
        ? Number(rawProcedure)
        : Number.NaN;

  const role = normaliseRole(data.role ?? data.Role);

  if (!agencyId || Number.isNaN(procedureId) || !role) {
    return null;
  }

  const units = Array.isArray(data.units)
    ? data.units
        .map((unit) => {
          const componentId = Number((unit as UnitEntry)?.componentId);
          const quantity = Number((unit as UnitEntry)?.quantity);
          if (Number.isNaN(componentId) || Number.isNaN(quantity)) {
            return null;
          }
          return { componentId, quantity };
        })
        .filter((entry): entry is UnitEntry => Boolean(entry))
    : undefined;

  return {
    agencyId,
    procedureId,
    role,
    units,
  };
};

const sanitiseUnitsForState = (payloadUnits?: UnitEntry[]): UnitEntry[] => {
  const payloadMap = new Map<number, number>();
  payloadUnits?.forEach((unit) => {
    const componentId = Number(unit.componentId);
    const quantity = Number(unit.quantity);
    if (!Number.isNaN(componentId) && !Number.isNaN(quantity) && quantity > 0) {
      payloadMap.set(componentId, quantity);
    }
  });

  return BASE_UNIT_INPUTS.map(({ componentId }) => ({
    componentId,
    quantity: payloadMap.get(componentId) ?? 0,
  }));
};

const formatMoney = (currency: string, value: number) =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatFeeSummary = (result: FeeCalculationResponse): string => {
  const totalLine = formatMoney(result.currency, result.totalFee);
  const breakdown = result.feeBreakdown
    .map(
      (item) =>
        `${item.componentName}: ${formatMoney(result.currency, item.amount)}`,
    )
    .join('\n');

  return breakdown ? `${totalLine}\n${breakdown}` : totalLine;
};

const createChatMessage = (
  sender: ChatMessage['sender'],
  content: string,
): ChatMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sender,
  content,
});

export default function ExpertFormPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [procedures, setProcedures] = useState<ProcedureType[]>([]);
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState<RoleOption>('National');
  const [units, setUnits] = useState<UnitEntry[]>(() => createDefaultUnits());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feeResult, setFeeResult] = useState<FeeCalculationResponse | null>(
    null,
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      setErrorMessage(null);
      try {
        const [agenciesResponse, proceduresResponse] = await Promise.all([
          fetch('/api/agencies'),
          fetch('/api/procedures'),
        ]);

        const agenciesPayload = (await agenciesResponse.json()) as {
          agencies?: Agency[];
          error?: string;
        };
        const proceduresPayload = (await proceduresResponse.json()) as {
          procedures?: ProcedureType[];
          error?: string;
        };

        if (!agenciesResponse.ok) {
          throw new Error(agenciesPayload.error ?? 'Failed to load agencies.');
        }
        if (!proceduresResponse.ok) {
          throw new Error(
            proceduresPayload.error ?? 'Failed to load procedures.',
          );
        }

        setAgencies(agenciesPayload.agencies ?? []);
        setProcedures(proceduresPayload.procedures ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load reference data.';
        setErrorMessage(message);
      }
    };

    void loadInitialData();
  }, []);

  const resetUnits = () => {
    setUnits(createDefaultUnits());
  };

  const relevantUnits = useMemo(() => {
    if (!selectedProcedure) {
      return [];
    }

    return units;
  }, [selectedProcedure, units]);

  const handleUnitChange = (componentId: number, quantity: number) => {
    setUnits((prev) =>
      prev.map((entry) =>
        entry.componentId === componentId ? { ...entry, quantity } : entry,
      ),
    );
  };

  const calculateFee = async (
    override?: Partial<{
      agencyId: string;
      procedureId: number;
      role: RoleOption;
      units: UnitEntry[];
    }>,
  ) => {
    const agencyIdRaw = override?.agencyId ?? selectedAgency;
    const agencyId = typeof agencyIdRaw === 'string' ? agencyIdRaw.trim() : '';
    const procedureId =
      typeof override?.procedureId === 'number'
        ? override.procedureId
        : typeof selectedProcedure === 'number'
          ? selectedProcedure
          : Number.NaN;
    const role = override?.role ?? selectedRole;

    if (!agencyId || Number.isNaN(procedureId) || !role) {
      throw new Error('Agency, procedure, and role are all required.');
    }

    setErrorMessage(null);

    const unitsSource = override?.units ?? units;
    const payloadUnits = unitsSource
      .map((unit) => ({
        componentId: unit.componentId,
        quantity: Math.max(0, Number(unit.quantity) || 0),
      }))
      .filter((unit) => unit.quantity > 0);

    const response = await fetch('/api/calculate-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyId,
        procedureId,
        role,
        units: payloadUnits,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? 'Failed to calculate fee.');
    }

    const result = (await response.json()) as FeeCalculationResponse;
    setFeeResult(result);
    return result;
  };

  const handleCalculate = async () => {
    if (!selectedAgency || !selectedProcedure || !selectedRole) {
      setErrorMessage('Please complete all selections before calculating.');
      return;
    }

    setIsLoading(true);
    try {
      await calculateFee();
    } catch (error) {
      setFeeResult(null);
      const message =
        error instanceof Error ? error.message : 'Something went wrong.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSend = async () => {
    const message = chatInput.trim();
    if (!message || isChatLoading) {
      return;
    }

    setChatMessages((prev) => [
      ...prev,
      createChatMessage('user', message),
    ]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/ask-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          (payload as { error?: string })?.error ??
            'Assistant request failed.',
        );
      }

      const parsedIntent = parseAssistantJsonResponse(payload);
      if (parsedIntent) {
        const sanitisedUnits = sanitiseUnitsForState(parsedIntent.units);
        setSelectedAgency(parsedIntent.agencyId);
        setSelectedProcedure(parsedIntent.procedureId);
        setSelectedRole(parsedIntent.role);
        setUnits(sanitisedUnits);

        try {
          const result = await calculateFee({
            agencyId: parsedIntent.agencyId,
            procedureId: parsedIntent.procedureId,
            role: parsedIntent.role,
            units: sanitisedUnits,
          });

          setChatMessages((prev) => [
            ...prev,
            createChatMessage(
              'assistant',
              `I found that fee for you. Here is the result:\n${formatFeeSummary(
                result,
              )}`,
            ),
          ]);
        } catch (calcError) {
          const messageText =
            calcError instanceof Error
              ? calcError.message
              : 'Unable to calculate the fee.';
          setErrorMessage(messageText);
          setChatMessages((prev) => [
            ...prev,
            createChatMessage(
              'assistant',
              `I tried to calculate the fee but ran into an issue: ${messageText}`,
            ),
          ]);
        }
        return;
      }

      const assistantMessage =
        typeof payload === 'string'
          ? payload
          : JSON.stringify(payload, null, 2);

      setChatMessages((prev) => [
        ...prev,
        createChatMessage('assistant', assistantMessage),
      ]);
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        createChatMessage(
          'assistant',
          error instanceof Error
            ? `Sorry, something went wrong: ${error.message}`
            : 'Sorry, something went wrong while contacting the assistant.',
        ),
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>RegFee Expert Form</title>
      </Head>
      <main className="min-h-screen bg-slate-50 py-12">
        <div className="mx-auto max-w-4xl px-4">
          <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <header className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Expert Form
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Run A Fee Calculation
              </h1>
              <p className="mt-3 text-sm text-slate-600">
                Select an agency, procedure, and role, then provide the
                billable units for each add-on component to generate a fee
                estimate.
              </p>
            </header>

            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-700">
                  Agency
                  <select
                    className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    value={selectedAgency}
                    onChange={(event) => {
                      setSelectedAgency(event.target.value);
                      setFeeResult(null);
                    }}
                  >
                    <option value="">Select an Agency</option>
                    {agencies.map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col text-sm font-medium text-slate-700">
                  Procedure
                  <select
                    className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    value={selectedProcedure}
                    onChange={(event) => {
                      const nextValue =
                        event.target.value === ''
                          ? ''
                          : Number(event.target.value);
                      setSelectedProcedure(nextValue);
                      resetUnits();
                      setFeeResult(null);
                    }}
                  >
                    <option value="">Select a Procedure</option>
                    {procedures.map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedure.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col text-sm font-medium text-slate-700">
                Role
                <select
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  value={selectedRole}
                  onChange={(event) => {
                    setSelectedRole(event.target.value as RoleOption);
                    setFeeResult(null);
                  }}
                >
                  <option value="National">National</option>
                  <option value="CMS">CMS</option>
                  <option value="RMS">RMS</option>
                </select>
              </label>

              <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      Units
                    </p>
                    <p className="text-sm text-slate-600">
                      Only the components relevant to the selected procedure
                      will appear here.
                    </p>
                  </div>
                  {selectedProcedure ? null : (
                    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                      Select a procedure
                    </span>
                  )}
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {relevantUnits.map((unitEntry) => {
                    const inputMeta = BASE_UNIT_INPUTS.find(
                      (unit) => unit.componentId === unitEntry.componentId,
                    );
                    if (!inputMeta) {
                      return null;
                    }

                    return (
                      <label
                        key={unitEntry.componentId}
                        className="flex flex-col rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm font-medium text-slate-700 shadow-inner"
                      >
                        {inputMeta.label}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className="mt-2 rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          value={unitEntry.quantity}
                          onChange={(event) =>
                            handleUnitChange(
                              unitEntry.componentId,
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </section>

              {errorMessage ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="button"
                className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={handleCalculate}
                disabled={isLoading}
              >
                {isLoading ? 'Calculating…' : 'Calculate'}
              </button>
            </div>
          </section>

          <section className="mt-10 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-semibold text-slate-900">Results</h2>
            <p className="mt-2 text-sm text-slate-600">
              You&apos;ll see the final fee and every component&apos;s
              contribution once a calculation completes.
            </p>

            {feeResult ? (
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl bg-slate-50 px-6 py-4">
                  <p className="text-sm uppercase tracking-wide text-slate-500">
                    Total Fee
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {formatMoney(feeResult.currency, feeResult.totalFee)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Fee Breakdown
                  </p>
                  <ul className="mt-4 space-y-3">
                    {feeResult.feeBreakdown.map((item) => (
                      <li
                        key={`${item.componentName}-${item.amount}`}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800"
                      >
                        <span>{item.componentName}</span>
                        <span className="font-semibold">
                          {formatMoney(feeResult.currency, item.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-500">
                No calculation yet. Fill in the form above and select
                &ldquo;Calculate&rdquo; to view the result here.
              </div>
            )}
          </section>

          <div className="mt-10">
            <ChatWindow
              messages={chatMessages}
              inputValue={chatInput}
              onInputChange={setChatInput}
              onSend={handleChatSend}
              isSending={isChatLoading}
            />
          </div>
        </div>
      </main>
    </>
  );
}
