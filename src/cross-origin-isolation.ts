import {Middleware} from 'koa';

// Enable cross-origin isolation for more precise timers:
// https://developer.chrome.com/blog/cross-origin-isolated-hr-timers/
export function crossOriginIsolation(): Middleware {
  // Based on https://github.com/fishel-feng/koa-isolated
  return async function isolated(ctx, next) {
    ctx.set('Cross-Origin-Opener-Policy', 'same-origin');
    ctx.set('Cross-Origin-Embedder-Policy', 'require-corp');
    await next();
  };
}
