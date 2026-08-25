import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConnectError, Code } from "@connectrpc/connect";

import { login } from "../gen/app/studio/v1/auth-AuthService_connectquery";
import { useRpcMutation } from "../lib/rpc";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { login: persistToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  const { mutate: doLogin, isPending } = useRpcMutation(login, {
    onSuccess: (res) => {
      persistToken(res.token);
      void navigate(from, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
        setErrorMessage("Credenciais inválidas");
      } else {
        setErrorMessage("Falha de conexão — tente novamente");
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    doLogin({ username, password });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm"
      >
        <h1 className="font-serif text-xl font-semibold">Guigas Studio</h1>
        <p className="mt-1 text-xs text-neutral-500">Entre para acessar o dashboard</p>

        <label className="mt-6 block text-sm font-medium" htmlFor="username">
          Usuário
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />

        <label className="mt-4 block text-sm font-medium" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />

        {errorMessage && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-6 w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
