"use client";

import { useActionState } from "react";
import { createClient, type CreateClientState } from "@/app/panel-admina/klienci/actions";

const initialState: CreateClientState = {};

export function CreateClientForm() {
  const [state, formAction, pending] = useActionState(createClient, initialState);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
        Nowy klient
      </h2>
      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">
            Nazwa klienta
          </label>
          <input
            name="name"
            type="text"
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Dodawanie…" : "Dodaj klienta"}
        </button>
      </form>
      {state.error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
    </div>
  );
}
