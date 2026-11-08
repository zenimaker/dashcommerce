/**
 * Full-page cart. Safe rendering (React escapes text content), quantity
 * controls, line remove, coupon apply/remove, totals summary, and a
 * checkout CTA.
 *
 * Mounts at `client:load` on the storefront's `/cart` page. Reads state
 * from `/cart`, mutates via `PATCH/DELETE /cart/item?lineId={id}`,
 * `POST /cart/coupon`, `DELETE /cart/coupon/remove?code={code}`.
 */

import {
	useCallback,
	useEffect,
	useState,
	type FormEvent,
} from "react";

interface Money {
	currency: string;
	amount: number;
}

interface CartLine {
	lineId: string;
	productId: string;
	variantId?: string;
	quantity: number;
	unitPrice: Money;
	lineSubtotal: Money;
	title: string;
}

interface AppliedCoupon {
	code: string;
	discountAmount: Money;
	freeShipping: boolean;
}

interface CartState {
	items: CartLine[];
	coupons: AppliedCoupon[];
	subtotal: Money;
	discountTotal: Money;
	shippingTotal: Money;
	taxTotal: Money;
	total: Money;
	currency: string;
}

function moneyMinorDigits(currency: string, locale: string) {
	return new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
}

function formatMoney(m: Money | null | undefined, locale = "ja-JP") {
	if (!m) return "—";
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency: m.currency,
		}).format(m.amount / 10 ** moneyMinorDigits(m.currency, locale));
	} catch {
		return `${m.currency} ${m.amount / 10 ** moneyMinorDigits(m.currency, locale)}`;
	}
}

const API = "/_emdash/api/plugins/dashcommerce";

export interface CartPageIslandProps {
	checkoutHref?: string;
	shopHref?: string;
	locale?: string;
}

export default function CartPageIsland({
	checkoutHref = "/checkout",
	shopHref = "/shop",
	locale = "ja-JP",
}: CartPageIslandProps) {
	const [cart, setCart] = useState<CartState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [couponDraft, setCouponDraft] = useState("");
	const [couponError, setCouponError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			const res = await fetch(`${API}/cart`, { credentials: "include" });
			if (!res.ok) {
				setError(`カートを読み込めませんでした（${res.status}）`);
				return;
			}
			const body = (await res.json()) as { cart: CartState };
			setCart(body.cart);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		}
	}, []);

	useEffect(() => {
		reload();
		const onUpdate = () => {
			reload();
		};
		window.addEventListener("dashcommerce:cart-updated", onUpdate);
		return () => window.removeEventListener("dashcommerce:cart-updated", onUpdate);
	}, [reload]);

	async function updateQuantity(lineId: string, quantity: number) {
		setPending(true);
		setError(null);
		try {
			const res = await fetch(
				`${API}/cart/item?lineId=${encodeURIComponent(lineId)}`,
				{
					method: "PATCH",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ quantity }),
				},
			);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setError(body.error ?? `更新できませんでした（${res.status}）`);
				return;
			}
			const body = (await res.json()) as { cart: CartState };
			setCart(body.cart);
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	async function removeLine(lineId: string) {
		setPending(true);
		setError(null);
		try {
			const res = await fetch(
				`${API}/cart/item?lineId=${encodeURIComponent(lineId)}`,
				{ method: "DELETE", credentials: "include" },
			);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setError(body.error ?? `削除できませんでした（${res.status}）`);
				return;
			}
			const body = (await res.json()) as { cart: CartState };
			setCart(body.cart);
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	async function applyCoupon(e: FormEvent) {
		e.preventDefault();
		const code = couponDraft.trim();
		if (!code) return;
		setPending(true);
		setCouponError(null);
		try {
			const res = await fetch(`${API}/cart/coupon`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setCouponError(body.error ?? `クーポンを適用できませんでした（${res.status}）`);
				return;
			}
			const body = (await res.json()) as { cart: CartState };
			setCart(body.cart);
			setCouponDraft("");
		} catch (err) {
			setCouponError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	async function clearCart() {
		const ok = window.confirm("カートの商品をすべて削除しますか？");
		if (!ok) return;
		setPending(true);
		setError(null);
		try {
			const res = await fetch(`${API}/cart/clear`, {
				method: "DELETE",
				credentials: "include",
			});
			const body = (await res.json().catch(() => ({}))) as {
				cart?: CartState;
				error?: string;
			};
			if (!res.ok) {
				setError(body.error ?? `カートを空にできませんでした（${res.status}）`);
				return;
			}
			if (body.cart) setCart(body.cart);
		} catch (err) {
			setError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	async function removeCoupon(code: string) {
		setPending(true);
		setCouponError(null);
		try {
			const res = await fetch(
				`${API}/cart/coupon/remove?code=${encodeURIComponent(code)}`,
				{ method: "DELETE", credentials: "include" },
			);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setCouponError(body.error ?? `削除できませんでした（${res.status}）`);
				return;
			}
			const body = (await res.json()) as { cart: CartState };
			setCart(body.cart);
		} catch (err) {
			setCouponError(err instanceof Error ? err.message : "通信エラーです");
		} finally {
			setPending(false);
		}
	}

	if (!cart && !error) return <p>カートを読み込んでいます…</p>;
	if (error) {
		return (
			<div role="alert" className="dc-cart-error">
				<p>{error}</p>
				<button type="button" onClick={reload}>
					再試行
				</button>
			</div>
		);
	}
	if (!cart) return null;

	if (cart.items.length === 0) {
		return (
			<div className="dc-cart-empty">
				<h2>カートは空です</h2>
				<p>
					<a href={shopHref}>買い物を続ける</a>
				</p>
			</div>
		);
	}

	return (
		<div className="dc-cart-page">
			<table className="dc-cart-table">
				<thead>
					<tr>
						<th scope="col" className="dc-th-item">商品</th>
						<th scope="col" className="dc-th-qty">数量</th>
						<th scope="col" className="dc-th-total">小計</th>
						<th scope="col"><span className="dc-sr-only">削除</span></th>
					</tr>
				</thead>
				<tbody>
					{cart.items.map((it) => (
						<tr key={it.lineId}>
							<td>
								<strong>{it.title}</strong>
								<div className="dc-line-unit">
									各 {formatMoney(it.unitPrice, locale)}
								</div>
							</td>
							<td>
								<div className="dc-qty-controls">
									<button
										type="button"
										aria-label={`${it.title}の数量を減らす`}
										disabled={pending || it.quantity <= 1}
										onClick={() => updateQuantity(it.lineId, it.quantity - 1)}
									>
										−
									</button>
									<input
										type="number"
										min={1}
										value={it.quantity}
										aria-label={`${it.title}の数量`}
										onChange={(e) => {
											const n = Math.max(1, Number(e.currentTarget.value) || 1);
											updateQuantity(it.lineId, n);
										}}
										disabled={pending}
									/>
									<button
										type="button"
										aria-label={`${it.title}の数量を増やす`}
										disabled={pending}
										onClick={() => updateQuantity(it.lineId, it.quantity + 1)}
									>
										+
									</button>
								</div>
							</td>
							<td className="dc-line-total">
								{formatMoney(it.lineSubtotal, locale)}
							</td>
							<td>
								<button
									type="button"
									className="dc-remove"
									aria-label={`${it.title}を削除`}
									disabled={pending}
									onClick={() => removeLine(it.lineId)}
								>
									×
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			<section className="dc-coupon">
				<h3>クーポン</h3>
				{cart.coupons.length > 0 && (
					<ul className="dc-applied-coupons">
						{cart.coupons.map((c) => (
							<li key={c.code}>
								<code>{c.code}</code>{" "}
								{c.freeShipping
									? "（送料無料）"
									: `−${formatMoney(c.discountAmount, locale)}`}
								<button
									type="button"
									onClick={() => removeCoupon(c.code)}
									disabled={pending}
									aria-label={`クーポン ${c.code} を削除`}
								>
									削除
								</button>
							</li>
						))}
					</ul>
				)}
				<form onSubmit={applyCoupon} className="dc-coupon-form">
					<label>
						クーポンコード{" "}
						<input
							type="text"
							value={couponDraft}
							onChange={(e) => setCouponDraft(e.currentTarget.value)}
							placeholder="クーポンコード"
							aria-label="クーポンコード"
							disabled={pending}
						/>
					</label>
					<button type="submit" disabled={pending || !couponDraft.trim()}>
						適用
					</button>
				</form>
				{couponError && (
					<p role="alert" className="dc-coupon-error">
						{couponError}
					</p>
				)}
			</section>

			<section className="dc-totals">
				<div className="dc-total-row">
					<span>小計</span>
					<span>{formatMoney(cart.subtotal, locale)}</span>
				</div>
				{cart.discountTotal.amount > 0 && (
					<div className="dc-total-row">
						<span>割引</span>
						<span>−{formatMoney(cart.discountTotal, locale)}</span>
					</div>
				)}
				{cart.shippingTotal.amount > 0 && (
					<div className="dc-total-row">
						<span>送料</span>
						<span>{formatMoney(cart.shippingTotal, locale)}</span>
					</div>
				)}
				{cart.taxTotal.amount > 0 && (
					<div className="dc-total-row">
						<span>税</span>
						<span>{formatMoney(cart.taxTotal, locale)}</span>
					</div>
				)}
				<div className="dc-total-row dc-total-row-grand">
					<strong>合計</strong>
					<strong>{formatMoney(cart.total, locale)}</strong>
				</div>
			</section>

			<div className="dc-cart-actions">
				<a href={shopHref}>買い物を続ける</a>
				<button
					type="button"
					className="dc-clear-all"
					onClick={clearCart}
					disabled={pending}
				>
					カートを空にする
				</button>
				<a href={checkoutHref} className="dc-btn-primary">
					レジに進む
				</a>
			</div>

			<style>{`
				.dc-cart-page { max-width: 48rem; margin: 0 auto; color: var(--text, #111); }
				.dc-cart-error { padding: 1rem; color: var(--ember, #a00); }
				.dc-cart-empty { padding: 3rem 1rem; text-align: center; color: var(--text-muted, #666); }
				.dc-cart-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
				.dc-cart-table th { text-align: left; padding: 0.75rem 0; border-bottom: 1px solid var(--border-mid, #e4e4e7); color: var(--text-muted, #555); font-weight: 600; font-size: 0.85em; }
				.dc-cart-table td { padding: 0.75rem 0; border-bottom: 1px solid var(--border, #f4f4f5); vertical-align: middle; color: var(--text, #111); }
				.dc-th-qty, .dc-th-total { text-align: right; }
				.dc-line-unit { color: var(--text-muted, #666); font-size: 0.85em; margin-top: 0.25rem; }
				.dc-qty-controls { display: inline-flex; align-items: center; gap: 0.25rem; }
				.dc-qty-controls button {
					width: 1.75rem; height: 1.75rem;
					border: 1px solid var(--border-strong, #d4d4d8);
					background: var(--surface, #fff);
					color: var(--text, #111);
					border-radius: 4px; cursor: pointer; font-size: 1em; line-height: 1;
				}
				.dc-qty-controls button:hover:not(:disabled) { background: var(--surface-2, #f4f4f5); }
				.dc-qty-controls button:disabled { opacity: 0.4; cursor: not-allowed; }
				.dc-qty-controls input {
					width: 3rem; text-align: center; padding: 4px;
					border: 1px solid var(--border-strong, #d4d4d8);
					background: var(--surface, #fff);
					color: var(--text, #111);
					border-radius: 4px;
				}
				.dc-line-total { text-align: right; font-weight: 500; }
				.dc-remove { background: transparent; border: 0; color: var(--text-subtle, #888); cursor: pointer; font-size: 1.25em; padding: 0.25rem 0.5rem; }
				.dc-remove:hover:not(:disabled) { color: var(--ember, #a00); }
				.dc-coupon { padding: 1rem 0; border-top: 1px solid var(--border-mid, #e4e4e7); margin-bottom: 1.5rem; }
				.dc-coupon h3 { margin: 0 0 0.5rem; font-size: 1em; color: var(--text, #111); }
				.dc-applied-coupons { list-style: none; padding: 0; margin: 0 0 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
				.dc-applied-coupons li {
					display: inline-flex; gap: 0.5rem; align-items: center;
					padding: 0.25rem 0.5rem;
					background: var(--success-bg, rgba(76, 175, 120, 0.12));
					border: 1px solid var(--success, #86efac);
					color: var(--text, #14532d);
					border-radius: 4px; font-size: 0.9em;
				}
				.dc-applied-coupons button { background: transparent; border: 0; color: var(--text-mid, #555); cursor: pointer; font-size: 0.85em; text-decoration: underline; padding: 0; }
				.dc-coupon-form { display: flex; gap: 0.5rem; align-items: end; }
				.dc-coupon-form input {
					padding: 6px 10px;
					border: 1px solid var(--border-strong, #d4d4d8);
					background: var(--surface, #fff);
					color: var(--text, #111);
					border-radius: 4px;
				}
				.dc-coupon-form button {
					padding: 6px 12px;
					background: var(--surface, #fff);
					border: 1px solid var(--border-strong, #d4d4d8);
					color: var(--text, #111);
					border-radius: 4px; cursor: pointer;
				}
				.dc-coupon-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85em; color: var(--text-mid, #444); }
				.dc-coupon-error { color: var(--ember, #a00); margin-top: 0.5rem; font-size: 0.9em; }
				.dc-totals { border-top: 1px solid var(--border-mid, #e4e4e7); padding-top: 1rem; margin-bottom: 2rem; }
				.dc-total-row { display: flex; justify-content: space-between; padding: 0.25rem 0; color: var(--text, #111); }
				.dc-total-row-grand { padding-top: 0.5rem; border-top: 1px solid var(--border-mid, #e4e4e7); margin-top: 0.5rem; font-size: 1.1em; color: var(--text, #111); }
				.dc-cart-actions { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-mid, #e4e4e7); }
				.dc-clear-all {
					background: transparent; border: 0; cursor: pointer;
					color: var(--text-muted, #666); font-size: 0.9em;
					text-decoration: underline; padding: 0.5rem 0;
				}
				.dc-clear-all:hover:not(:disabled) { color: var(--ember, #a00); }
				.dc-clear-all:disabled { opacity: 0.4; cursor: not-allowed; }
				.dc-btn-primary {
					display: inline-flex; align-items: center;
					padding: 0.75rem 1.5rem;
					background: var(--accent, var(--gold, #111));
					color: var(--accent-on, #fff);
					border-radius: var(--radius, 6px);
					text-decoration: none; font-weight: 500;
				}
				.dc-btn-primary:hover { background: var(--gold-light, var(--accent, #333)); filter: brightness(1.08); text-decoration: none; }
				.dc-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
			`}</style>
		</div>
	);
}
