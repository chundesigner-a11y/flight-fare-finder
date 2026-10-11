import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthedUser } from "@/components/ProtectedRoute";

// API Gateway (AWS) — the browser only talks to this URL; it holds no AWS credentials.
const API_BASE = "https://fgtmixm75f.execute-api.us-east-1.amazonaws.com";

// Sky-blue backdrop that matches the landing page hero (blue sky, soft white clouds).
const SKY =
  "radial-gradient(ellipse 60% 40% at 15% 8%, rgba(255,255,255,0.85), transparent 70%), " +
  "radial-gradient(ellipse 50% 35% at 85% 18%, rgba(255,255,255,0.7), transparent 70%), " +
  "linear-gradient(to bottom, #8fd0f7 0%, #bfe3fb 40%, #e8f6fe 100%)";

type PlanName = "tokyo" | "seoul" | "london";
type Status = "pending_payment" | "active" | "cancelled" | "expired";

const PLANS: {
  plan: PlanName;
  title: string;
  subtitle: string;
  hint: string;
  suggested: number;
}[] = [
  {
    plan: "tokyo",
    title: "台北 ✈ 東京",
    subtitle: "Taipei → Tokyo",
    hint: "近期最低約 NT$7,000–9,300",
    suggested: 8000,
  },
  {
    plan: "seoul",
    title: "台北 ✈ 首爾",
    subtitle: "Taipei → Seoul",
    hint: "近期最低約 NT$6,000–6,400",
    suggested: 6500,
  },
  {
    plan: "london",
    title: "台北 ✈ 倫敦",
    subtitle: "Taipei → London",
    hint: "近期最低約 NT$25,000 起",
    suggested: 26000,
  },
];

type Subscription = {
  plan_name: PlanName;
  route: string;
  target_price: number;
  subscription_status?: Status | undefined;
  current_period_end_date?: string | undefined;
};

async function fetchSubscriptions(email: string): Promise<Subscription[]> {
  const res = await fetch(`${API_BASE}/subscriptions?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("load failed");
  const data = await res.json();
  return data.items ?? [];
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

const BTN_LIGHT =
  "rounded-full border border-primary/30 bg-white/70 px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-60";
const BTN_MAIN =
  "rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-60";

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
  // Rows created before M2 have no status: treat them as "payment pending".
  const status: Status | undefined = existing
    ? (existing.subscription_status ?? "pending_payment")
    : undefined;
  const [price, setPrice] = useState<string>(String(existing?.target_price ?? plan.suggested));
  const [editing, setEditing] = useState(!existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(targetPrice: number) {
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError("請輸入大於 0 的目標價 / Enter a valid target price");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ email, plan_name: plan.plan, target_price: targetPrice }),
      });
      if (!res.ok) throw new Error("save failed");
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/html")) {
        // Not paid yet: the server returned the ECPay checkout form, which auto-submits to the cashier.
        const html = await res.text();
        document.open();
        document.write(html);
        document.close();
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("儲存失敗，請稍後再試 / Could not save, please try again");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("確定要取消訂閱嗎？已付費的期間內仍會收到通知，之後不再扣款。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/cancel`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ plan_name: plan.plan }),
      });
      if (!res.ok) throw new Error("cancel failed");
      onSaved();
    } catch {
      setError("取消失敗，請稍後再試 / Could not cancel, please try again");
    } finally {
      setBusy(false);
    }
  }

  const badge =
    status === "active"
      ? "已訂閱 / Subscribed"
      : status === "cancelled"
        ? `已取消 · 有效至 ${existing?.current_period_end_date ?? ""}`
        : status === "expired"
          ? "已結束 / Ended"
          : status === "pending_payment"
            ? "未完成付款 / Payment pending"
            : null;

  const showForm = !existing || editing || status === "expired";

  return (
    <div className="rounded-2xl border border-white/70 bg-white/60 p-6 shadow-glow backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="whitespace-nowrap text-xl font-semibold">{plan.title}</h2>
          <p className="text-sm text-muted-foreground">{plan.subtitle}</p>
        </div>
        {badge && (
          <span className="whitespace-nowrap rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            {badge}
          </span>
        )}
      </div>

      {!showForm && existing ? (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">目前目標價 / Target price</p>
          <p className="text-2xl font-semibold">NT${existing.target_price.toLocaleString()}</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "pending_payment" && (
              <button
                onClick={() => save(existing.target_price)}
                disabled={busy}
                className={BTN_MAIN}
              >
                {busy ? "處理中…" : "完成付款 / Pay"}
              </button>
            )}
            <button onClick={() => setEditing(true)} disabled={busy} className={BTN_LIGHT}>
              更新目標價 / Update
            </button>
            {status === "active" && (
              <button onClick={cancel} disabled={busy} className={BTN_LIGHT}>
                取消訂閱 / Cancel
              </button>
            )}
          </div>
          {status === "pending_payment" && (
            <p className="mt-3 text-xs text-muted-foreground">付款後才會開始寄送降價通知。</p>
          )}
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
              className="w-full rounded-lg border border-primary/30 bg-white px-3 py-2 text-base"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{plan.hint}</p>
          {(status === undefined || status === "expired" || status === "pending_payment") && (
            <p className="mt-1 text-xs text-muted-foreground">
              月費 NT$300，按下後會前往付款頁（測試環境不會真的扣款）。
            </p>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <button
            onClick={() => save(Number(price))}
            disabled={busy}
            className={`mt-4 ${BTN_MAIN}`}
          >
            {busy
              ? "處理中…"
              : status === "active" || status === "cancelled"
                ? "儲存 / Save"
                : status === "expired"
                  ? "重新訂閱 / Resubscribe"
                  : "開始追蹤 / Start tracking"}
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
  const [params] = useSearchParams();
  const purchase = params.get("purchase");
  const email = (user.email ?? "").toLowerCase();

  const subs = useQuery({
    queryKey: ["subscriptions", email],
    queryFn: () => fetchSubscriptions(email),
    enabled: !!email,
  });

  // After paying, ECPay tells our server in the background; poll a few times so the card flips to "Subscribed".
  useEffect(() => {
    if (purchase !== "success") return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void subs.refetch();
      if (n >= 6) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <div
      className="min-h-screen text-foreground"
      style={{ backgroundColor: "#dff1fd", backgroundImage: SKY }}
    >
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/50 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold tracking-tight">Flight Price Notifier</span>
          <button onClick={signOut} className={BTN_LIGHT}>
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

        {purchase === "success" && (
          <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm font-medium text-primary">
            付款完成，正在更新訂閱狀態… / Payment received, updating your subscription…
          </p>
        )}
        {purchase === "failed" && (
          <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm text-destructive">
            付款未完成，請再試一次。 / Payment was not completed, please try again.
          </p>
        )}

        {subs.isError && (
          <p className="mt-4 text-sm text-destructive">
            讀取訂閱狀態失敗 / Could not load your subscriptions
          </p>
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
