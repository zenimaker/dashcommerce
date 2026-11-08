import { classify, verifyOwner, ownerDenied } from './owner-access.mjs';

function secure(response) {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return result;
}

export default {
  async fetch(request, env, ctx) {
    const scope = classify(request);
    if (scope === 'deny') return new Response('Not found', {
      status: 404, headers: { 'Cache-Control': 'no-store' }
    });
    if (scope === 'owner' && !await verifyOwner(request)) return ownerDenied();
    const result = await env.ASSETS.fetch(request);
    return scope === 'owner' ? secure(result) : result;
  }
};
