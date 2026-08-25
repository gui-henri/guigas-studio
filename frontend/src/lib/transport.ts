import { createConnectTransport } from "@connectrpc/connect-web";
import type { Interceptor } from "@connectrpc/connect";

// "app_token" is the contract between transport and AuthContext (S0-10).
export const TOKEN_STORAGE_KEY = "app_token";

const authInterceptor: Interceptor = (next) => async (req) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    req.header.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await next(req);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 16 /* Unauthenticated */
    ) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    throw err;
  }
};

export const transport = createConnectTransport({
  baseUrl: "", // Vite proxy in dev, Caddy in production
  interceptors: [authInterceptor],
});
