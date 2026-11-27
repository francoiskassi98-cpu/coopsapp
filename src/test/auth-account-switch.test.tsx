import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const mock = vi.hoisted(() => ({
  callback: undefined as undefined | ((event: string, session: Session | null) => void),
  getSession: vi.fn(), signOut: vi.fn(), from: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/hooks/useVersionGuard", () => ({ useVersionGuard: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: mock.getSession, signOut: mock.signOut,
    onAuthStateChange: (callback: typeof mock.callback) => {
      mock.callback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    } },
  from: mock.from, rpc: mock.rpc,
} }));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const session = (id: string) => ({ user: { id, email: `${id}@example.test` } } as Session);
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let latest: ReturnType<typeof useAuth>;
const profiles = new Map<string, ReturnType<typeof deferred<{ data: unknown }>>>();
let childId = 0;
function Probe() {
  const auth = useAuth();
  latest = auth;
  const [instance] = useState(() => ++childId);
  const data = useQuery({ queryKey: ["accessible-data"], enabled: !!auth.user && !auth.loading,
    queryFn: async () => `${auth.user?.id}-records` });
  return <div>{JSON.stringify({ user: auth.user?.id, loading: auth.loading, profile: auth.profile?.username,
    coop: auth.cooperatives, role: auth.role, data: data.data, instance })}</div>;
}
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function emit(event: string, value: Session | null) {
  await act(async () => { mock.callback?.(event, value); });
  await settle();
}
function state() { return JSON.parse(container.textContent ?? "{}"); }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  profiles.clear(); childId = 0; vi.clearAllMocks();
  mock.getSession.mockResolvedValue({ data: { session: null } });
  mock.signOut.mockImplementation(async () => {
    mock.callback?.("SIGNED_OUT", null); return { error: null };
  });
  mock.rpc.mockResolvedValue({ data: null });
  mock.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder,
      eq: (_column: string, id: string) => {
        const result = table === "profiles"
          ? profiles.get(id)?.promise ?? Promise.resolve({ data: { username: id, email: `${id}@example.test` } })
          : Promise.resolve({ data: table === "user_roles" ? { role: id === "first" ? "coop_admin" : "agent" }
            : [{ cooperatives: { id: `coop-${id}`, name: `Coop ${id}` } }] });
        return Object.assign(result, { maybeSingle: () => result });
      },
    };
    return builder;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>); });
  await settle();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

describe("isolation lors du changement de compte", () => {
  it("recharge les données du deuxième compte sans actualiser après déconnexion", async () => {
    await emit("SIGNED_IN", session("first"));
    expect(state()).toMatchObject({ profile: "first", data: "first-records", coop: ["Coop first"] });
    const instance = state().instance;
    sessionStorage.setItem("knf-update-session", "old-update");
    await act(async () => { await latest.signOut(); });
    expect(client.getQueryData(["accessible-data"])).toBeUndefined();
    expect(sessionStorage.getItem("knf-update-session")).toBeNull();
    await emit("SIGNED_IN", session("second"));
    expect(state()).toMatchObject({ profile: "second", data: "second-records", coop: ["Coop second"], role: "agent" });
    expect(state().instance).not.toBe(instance);
  });
  it("masque l'ancien profil pendant le chargement du nouveau compte", async () => {
    await emit("SIGNED_IN", session("first"));
    profiles.set("second", deferred());
    await emit("SIGNED_IN", session("second"));
    expect(state()).toMatchObject({ user: "second", loading: true, coop: [], role: null });
    expect(state().profile).toBeUndefined();
    expect(state().data).toBeUndefined();
    profiles.get("second")?.resolve({ data: { username: "second" } });
    await settle();
    await settle();
    expect(state()).toMatchObject({ profile: "second", loading: false, data: "second-records" });
  });
  it("ignore une réponse de profil tardive de l'ancien compte", async () => {
    profiles.set("first", deferred());
    await emit("SIGNED_IN", session("first"));
    await emit("SIGNED_OUT", null);
    await emit("SIGNED_IN", session("second"));
    profiles.get("first")?.resolve({ data: { username: "first" } });
    await settle();
    expect(state()).toMatchObject({ profile: "second", role: "agent", coop: ["Coop second"] });
  });
  it("conserve le cache et les états lors du renouvellement du même compte", async () => {
    await emit("SIGNED_IN", session("first"));
    const instance = state().instance;
    client.setQueryData(["retained"], 42);
    await emit("TOKEN_REFRESHED", session("first"));
    expect(client.getQueryData(["retained"])).toBe(42);
    expect(state()).toMatchObject({ instance, profile: "first", loading: false });
  });
  it("annule une requête encore en cours avant qu'elle ne remplisse le cache du nouveau compte", async () => {
    await emit("SIGNED_IN", session("first"));
    const pending = deferred<string>();
    const oldQuery = client.fetchQuery({ queryKey: ["old-pending"], queryFn: () => pending.promise }).catch(() => undefined);
    await emit("SIGNED_IN", session("second"));
    pending.resolve("first-secret-records");
    await oldQuery; await settle();
    expect(client.getQueryData(["old-pending"])).toBeUndefined();
    expect(state().data).toBe("second-records");
  });
  it("ignore la session initiale si une nouvelle connexion arrive avant sa réponse", async () => {
    await act(async () => root.unmount());
    const bootstrap = deferred<{ data: { session: Session | null } }>();
    mock.getSession.mockReturnValue(bootstrap.promise);
    root = createRoot(container);
    await act(async () => { root.render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>); });
    await emit("SIGNED_IN", session("second"));
    bootstrap.resolve({ data: { session: session("first") } });
    await settle();
    expect(state()).toMatchObject({ user: "second", profile: "second", data: "second-records" });
  });
});
