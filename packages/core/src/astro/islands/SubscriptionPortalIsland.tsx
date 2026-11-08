import { useEffect, useState } from "react";

/**
 * Subscription self-service island.
 *
 * Customers arrive here via a signed token link emailed with their
 * subscription receipt (`/account/subscription?token=…`). The token
 * proves ownership; no login is required (DashCommerce uses
 * email-gated accounts).
 *
 * In addition to the local Cancel / Pause / Resume actions (which
 * forward to Stripe), we expose a "Manage billing" button that
 * redirects to the Stripe-hosted Billing Portal — customers can
 * update their card, download invoices, and manage billing there
 * without us having to implement those screens ourselves.
 */

interface Money {
	currency: string;
	amount: number;
}
interface Subscription {
	id: string;
	status: string;
	currency: string;
	unitAmount: Money;
	interval: string;
	intervalCount: number;
	currentPeriodEnd: string;
	cancelAtPeriodEnd: boolean;
}

export interface SubscriptionPortalIslandProps {
	token: string;
}

function formatMoney(m: Money, locale = "ja-JP") {
	try {
		const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: m.currency });
		const digits = fmt.resolvedOptions().maximumFractionDigits;
		return fmt.format(m.amount / 10 ** digits);
	} catch {
		return `${m.currency} ${m.amount}`;
	}
}

const INTERVALS: Record<string, string> = {
	day: "日",
	week: "週間",
	month: "か月",
	year: "年",
};
const STATUSES: Record<string, string> = {
	active: "有効",
	trialing: "お試し中",
	past_due: "支払い遅延",
	canceled: "解約済み",
	cancelled: "解約済み",
	paused: "一時停止",
	incomplete: "未完了",
	unpaid: "未払い",
};

const API = "/_emdash/api/plugins/dashcommerce";

export default function SubscriptionPortalIsland({
	token,
}: SubscriptionPortalIslandProps) {
	const [sub, setSub] = useState<Subscription | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function reload() {
		try {
			const res = await fetch(
				`${API}/subscriptions/state?token=${encodeURIComponent(token)}`,
				{ credentials: "include" },
			);
			const body = (await res.json()) as {
				subscription?: Subscription;
				error?: string;
			};
			if (!res.ok) {
				setError(body.error ?? "リンクが無効です");
				return;
			}
			setSub(body.subscription ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		}
	}

	useEffect(() => {
		reload();
	}, []);

	async function act(action: "cancel" | "pause" | "resume") {
		setPending(true);
		setError(null);
		try {
			const res = await fetch(`${API}/subscriptions/${action}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token,
					...(action === "cancel" ? { mode: "at_period_end" } : {}),
				}),
			});
			const body = (await res.json()) as { error?: string };
			if (!res.ok) {
				setError(body.error ?? "操作できませんでした");
			} else {
				await reload();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	async function openPortal() {
		setPending(true);
		setError(null);
		try {
			const res = await fetch(`${API}/subscriptions/portal`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, returnUrl: window.location.href }),
			});
			const body = (await res.json()) as { url?: string; error?: string };
			if (!res.ok || !body.url) {
				setError(body.error ?? "請求ポータルを開けませんでした");
				setPending(false);
				return;
			}
			window.location.href = body.url;
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
			setPending(false);
		}
	}

	if (error) return <p role="alert">{error}</p>;
	if (!sub) return <p>定期購入を読み込んでいます…</p>;

	return (
		<section className="dc-sub-portal">
			<h2>定期購入</h2>
			<p>
				<strong>状態:</strong> {STATUSES[sub.status] ?? sub.status}
			</p>
			<p>
				<strong>料金:</strong> {formatMoney(sub.unitAmount)} /{" "}
				{sub.intervalCount > 1 ? `${sub.intervalCount}` : ""}
				{INTERVALS[sub.interval] ?? sub.interval}
			</p>
			<p>
				<strong>次回の請求:</strong>{" "}
				{new Date(sub.currentPeriodEnd).toLocaleDateString("ja-JP")}
			</p>
			{sub.cancelAtPeriodEnd && (
				<p className="dc-notice">
					この定期購入は、現在の期間の終わりに解約されます。
				</p>
			)}
			<div className="dc-actions">
				{!sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
					<button type="button" onClick={() => act("cancel")} disabled={pending}>
						期間終了時に解約
					</button>
				)}
				{sub.status !== "canceled" && sub.status !== "paused" && (
					<button type="button" onClick={() => act("pause")} disabled={pending}>
						一時停止
					</button>
				)}
				{sub.status === "paused" && (
					<button type="button" onClick={() => act("resume")} disabled={pending}>
						再開
					</button>
				)}
				<button
					type="button"
					onClick={openPortal}
					disabled={pending}
					className="dc-actions-secondary"
				>
					Stripeで請求を管理
				</button>
			</div>
		</section>
	);
}
