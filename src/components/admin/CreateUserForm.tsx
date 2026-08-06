"use client";

import { useActionState, useState } from "react";
import { createUser, type CreateUserState } from "@/app/panel-admina/uzytkownicy/actions";

const initialState: CreateUserState = {};

type ClientOption = { id: string; name: string };

export function CreateUserForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState(createUser, initialState);
  const [role, setRole] = useState("AGENCY");

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
        Nowy użytkownik
      </h2>

      {state.success ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Konto utworzone.</p>
          <p className="mt-1 text-emerald-800">
            E-mail: <strong>{state.success.email}</strong>
          </p>
          <p className="mt-1 text-emerald-800">
            Hasło startowe: <strong className="font-mono">{state.success.password}</strong>
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            Przekaż to hasło użytkownikowi teraz — nie da się go już później
            podejrzeć (jest zahashowane w bazie).
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted">
                E-mail
              </label>
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted">
                Imię i nazwisko (opcjonalnie)
              </label>
              <input
                name="name"
                type="text"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted">
                Rola
              </label>
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="AGENCY">Zespół agencji</option>
                <option value="ADMIN">Administrator</option>
                <option value="CLIENT">Klient</option>
              </select>
            </div>
            {role === "CLIENT" && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Klient
                </label>
                <select
                  name="clientId"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">— wybierz —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {state.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Tworzenie…" : "Utwórz użytkownika"}
          </button>
        </form>
      )}
    </div>
  );
}
