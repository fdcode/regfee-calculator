'use client';

import { FormEvent } from 'react';

export type ChatMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
};

type ChatWindowProps = {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
};

export default function ChatWindow({
  messages,
  inputValue,
  onInputChange,
  onSend,
  isSending,
}: ChatWindowProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            AI Assistant
          </p>
          <h2 className="text-2xl font-semibold text-slate-900">
            Need a second opinion?
          </h2>
        </div>
        {isSending ? (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Thinking…
          </span>
        ) : null}
      </div>

      <div className="mb-4 h-72 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ask the RegFee Assistant for guidance. It can fill the form for you
            or clarify the data it needs.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-sm rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-900 ring-1 ring-slate-200'
                }`}
                style={{ whiteSpace: 'pre-line' }}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="flex flex-col text-sm font-medium text-slate-700">
          Message
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-2xl border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="e.g. Calculate the centralised RMS fee for 2 strengths and 1 presentation"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            disabled={isSending}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSending || !inputValue.trim()}
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
