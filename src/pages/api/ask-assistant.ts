import type { NextApiRequest, NextApiResponse } from 'next';
import { promises as fs } from 'fs';
import path from 'path';

type AskAssistantRequestBody = {
  message?: unknown;
};

type AskAssistantErrorResponse = {
  error: string;
};

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'AGENTS.MD');
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

async function loadSystemPrompt(): Promise<string> {
  try {
    const prompt = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf8');
    return prompt.trim();
  } catch (error) {
    console.error('Failed to read AGENTS.MD:', error);
    throw new Error('System prompt file is missing.');
  }
}

async function callLlmAPI(systemPrompt: string, userMessage: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(
      `LLM API error (${response.status}): ${errorPayload || 'Unknown error'}`,
    );
  }

  const completion = (await response.json()) as {
    choices?: { message?: { content?: string | null } | null }[];
  };

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('LLM returned an empty response.');
  }

  return content;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<unknown | AskAssistantErrorResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ error: 'Method Not Allowed. Use POST with a JSON body.' });
  }

  const body = req.body as AskAssistantRequestBody;
  const message =
    typeof body?.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ error: 'message is required.' });
  }

  try {
    const systemPrompt = await loadSystemPrompt();
    const llmResponse = await callLlmAPI(systemPrompt, message);

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(llmResponse);
    } catch {
      parsedResponse = llmResponse;
    }

    return res.status(200).json(parsedResponse);
  } catch (error) {
    console.error('ask-assistant error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to process request.';
    return res.status(500).json({ error: message });
  }
}
