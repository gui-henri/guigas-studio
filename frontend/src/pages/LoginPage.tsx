import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConnectError, Code } from "@connectrpc/connect";

import { login } from "../gen/app/studio/v1/auth-AuthService_connectquery";
import { useRpcMutation } from "../lib/rpc";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm border-border shadow-md">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-2 flex items-center justify-center gap-1.5">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              Guigas Studio
            </span>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-accent">
              v2
            </span>
          </div>
          <CardDescription>Acesse o pipeline de produção</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
