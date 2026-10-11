import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthedUser } from "@/components/ProtectedRoute";

// API Gateway (AWS) — the browser only talks to this URL; it holds no AWS credentials.
const API_BASE = "https://fgtmixm75f.execute-api.us-east-1.amazonaws.com";

type PlanName = "tokyo" | "seoul" | "london";

const PLANS: {
  plan: PlanName;
  title: string;
  subtitle: string;
  hint: string;
  suggested: number;
}[] = [
  { plan: "tokyo", title: "台北 ✈ 東京", subtitle: "Taipei → Tokyo", hint: "近期最低約 NT$7,000–9,300", suggested: 8000 },
  { plan: "seoul", title: "台北 ✈ 首爾", subtitle: "Taipei → Seoul", hint: "近期最低約 NT$6,000–6,400", suggested: 6500 },
  { plan: "london", title: "台北 ✈ 倫敦", subtitle: "Taipei → London", hint: "近期最低約 NT$25,000 起", suggested: 26000 },
];

type Subscription = { plan_name: PlanName; route: string; target_price: number };

async function fetchSubscriptions(email: string): Promise<Subscription[]> {
  const res = await fetch(`${API_BASE}/subscriptions?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("load failed");
  const data = await res.json();
  return data.items ?? [];
}

function PlanCard({
  plan,
  email,
  existing,
  onSaved,
}: {
  plan: (typeof PLANS)[number];
  email: string;
  existing: Subscription | undefined;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState<string>(String(existing?.target_price ?? plan.suggested));
  const [editing, setEditing] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) {
      setError("請輸入大於 0 的目標價 / Enter a valid target price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, plan_name: plan.plan, target_price: n }),
      });
      if (!res.ok) throw new Error("save failed");
      setEditing(false);
      onSaved();
    } catch {
      setError("儲存失敗，請稍後再試 / Could not save, please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{plan.title}</h2>
          <p className="text-sm text-muted-foreground">{plan.subtitle}</p>
        </div>
        {existing && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            已訂閱 / Subscribed
          </span>
        )}
      </div>

      {existing && !editing ? (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">目前目標價 / Target price</p>
          <p className="text-2xl font-semibold">NT${existing.target_price.toLocaleString()}</p>
          <button
            onClick={() => setEditing(true)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            更新目標價 / Update
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <label className="text-sm font-medium" htmlFor={`price-${plan.plan}`}>
            目標價（TWD）/ Target price
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">NT$</span>
            <input
              id={`price-${plan.plan}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{plan.hint}</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {saving ? "儲存中…" : existing ? "儲存 / Save" : "開始追蹤 / Start tracking"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const user = useAuthedUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const email = (user.email ?? "").toLowerCase();

  const subs = useQuery({
    queryKey: ["subscriptions", email],
    queryFn: () => fetchSubscriptions(email),
    enabled: !!email,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold tracking-tight">Flight Price Notifier</span>
          <button
            onClick={signOut}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            Sign out / 登出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-2xl font-semibold sm:text-3xl">Hi {user.email}</h1>
        <p className="mt-2 text-muted-foreground">
          選一條航線、設定目標價，降到目標價時我們會寄 email 通知你。
          <br />
          Pick a route and a target price — we email you when the fare drops.
        </p>

        {subs.isError && (
          <p className="mt-4 text-sm text-destructive">讀取訂閱狀態失敗 / Could not load your subscriptions</p>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={`${p.plan}-${subs.dataUpdatedAt}`}
              plan={p}
              email={email}
              existing={subs.data?.find((s) => s.plan_name === p.plan)}
              onSaved={() => subs.refetch()}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
