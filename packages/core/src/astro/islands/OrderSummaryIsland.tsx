import { useEffect, useRef, useState } from "react";

interface Money {
	currency: string;
	amount: number;
}
interface Item {
	id: string;
	name: string;
	quantity: number;
	total: Money;
}
interface Order {
	id: string;
	orderNumber: string;
	status: string;
	customerEmail: string;
	total: Money;
	currency: string;
}
type PollResponse =
	| { status: "ready"; order: Order; items: Item[] }
	| { status: "pending" }
	| { status: "failed" };

export interface OrderSummaryIslandProps {
	orderDraftId: string;
	pollIntervalMs?: number;
	maxDurationMs?: number;
}

function moneyMinorDigits(currency: string, locale: string) {
	return new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
}

function formatMoney(m: Money, locale = "ja-JP") {
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency: m.currency,
		}).format(m.amount / 10 ** moneyMinorDigits(m.currency, locale));
	} catch {
		return `${m.currency} ${m.amount / 10 ** moneyMinorDigits(m.currency, locale)}`;
	}
}

export default function OrderSummaryIsland({
	orderDraftId,
	pollIntervalMs = 800,
	maxDurationMs = 60_000,
}: OrderSummaryIslandProps) {
	const [result, setResult] = useState<PollResponse | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const timerRef = useRef<number | null>(null);
	const notifiedRef = useRef(false);

	useEffect(() => {
		const deadline = Date.now() + maxDurationMs;
		async function poll() {
			if (Date.now() > deadline) {
				setTimedOut(true);
				// Give any lingering cart UI a chance to drop stale items
				// even if order polling timed out — the webhook may have
				// arrived after our window closed.
				if (!notifiedRef.current) {
					notifiedRef.current = true;
					window.dispatchEvent(
						new CustomEvent("dashcommerce:cart-updated", {
							detail: { silent: true },
						}),
					);
				}
				return;
			}
			try {
				const res = await fetch(
					`/_emdash/api/plugins/dashcommerce/orders/by-draft?id=${encodeURIComponent(orderDraftId)}`,
					{ credentials: "include" },
				);
				const body = (await res.json()) as PollResponse;
				if (body.status === "ready" || body.status === "failed") {
					setResult(body);
					// Order persisted → webhook fired → server-side cart
					// has been cleared. Broadcast so CartDrawerIsland /
					// CartPageIsland refetch and render an empty cart.
					if (!notifiedRef.current) {
						notifiedRef.current = true;
						window.dispatchEvent(
							new CustomEvent("dashcommerce:cart-updated", {
								detail: { silent: true },
							}),
						);
					}
					return;
				}
				setResult(body);
				timerRef.current = window.setTimeout(poll, pollIntervalMs);
			} catch {
				timerRef.current = window.setTimeout(poll, pollIntervalMs);
			}
		}
		poll();
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, [orderDraftId, pollIntervalMs, maxDurationMs]);

	if (timedOut) {
		return (
			<div role="alert">
				<h2>お支払いを処理しています</h2>
				<p>
					お支払いの確認がまだ完了していません。まもなく領収書のメールが届きます。ご不明な点は、照会番号{" "}
					<code>{orderDraftId}</code> を添えてサポートへご連絡ください。
				</p>
			</div>
		);
	}

	if (!result || result.status === "pending") {
		return (
			<div>
				<h2>ご注文を確認しています…</h2>
				<p>お支払いの確定まで、少々お待ちください。</p>
			</div>
		);
	}

	if (result.status === "failed") {
		return (
			<div role="alert">
				<h2>お支払いを確認できませんでした</h2>
				<p>
					請求が発生している場合は、照会番号{" "}
					<code>{orderDraftId}</code> を添えてサポートへご連絡ください。
				</p>
			</div>
		);
	}

	const { order, items } = result;
	return (
		<section className="dc-order-summary">
			<h2>ご注文ありがとうございました（注文番号 {order.orderNumber}）</h2>
			<p>
				領収書を <strong>{order.customerEmail}</strong> に送信しました。
			</p>
			<ul>
				{items.map((it) => (
					<li key={it.id}>
						{it.quantity} × {it.name} — {formatMoney(it.total)}
					</li>
				))}
			</ul>
			<p className="dc-total">
				<strong>合計:</strong> {formatMoney(order.total)}
			</p>
			<style>{`
        .dc-order-summary {
          max-width: 32rem;
          margin: 2rem auto;
          padding: 2rem;
          background: var(--success-bg, rgba(76, 175, 120, 0.08));
          border: 1px solid var(--success, #b8d9bf);
          border-radius: var(--radius-lg, 8px);
          color: var(--text, #111);
        }
        .dc-order-summary ul {
          list-style: none;
          padding: 0;
        }
        .dc-order-summary li {
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border-mid, rgba(76, 175, 120, 0.25));
          color: var(--text, #111);
        }
        .dc-total {
          font-size: 1.2em;
          margin-top: 1rem;
          color: var(--text, #111);
        }
      `}</style>
		</section>
	);
}
