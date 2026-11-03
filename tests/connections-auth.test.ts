import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const exec = promisify(execFile);

test("installed AuthKit reads anonymous render cookies without attempting PKCE writes", async () => {
  const { stdout } = await exec(process.execPath, ["--input-type=module", "-e", `
    import { registerHooks, createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const require = createRequire(import.meta.url);
    const { RequestCookiesAdapter } = require('next/dist/server/web/spec-extension/adapters/request-cookies.js');
    const { RequestCookies, ResponseCookies } = require('next/dist/compiled/@edge-runtime/cookies');
    globalThis.fixtureCookies = RequestCookiesAdapter.seal(new RequestCookies(new Headers()));
    globalThis.fixtureHeaders = new Headers({
      'x-workos-middleware': 'true',
      'x-url': 'https://cue.example.test/connections',
      'x-redirect-uri': 'https://cue.example.test/auth/callback',
    });
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; throw new Error('Network is forbidden in this fixture'); };
    const sources = {
      'next/headers': 'export async function headers(){return globalThis.fixtureHeaders}; export async function cookies(){return globalThis.fixtureCookies}',
      'next/navigation': 'export function redirect(url){throw new Error("FIXTURE_REDIRECT:"+url)}',
      'next/cache': 'export function revalidatePath(){}; export function revalidateTag(){}',
      'server-only': 'export {}',
    };
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === 'next/server') return nextResolve('next/server.js', context);
        return Object.hasOwn(sources, specifier)
          ? {url: 'cue-fixture:' + specifier, shortCircuit: true}
          : nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        return url.startsWith('cue-fixture:')
          ? {format: 'module', source: sources[url.slice('cue-fixture:'.length)], shortCircuit: true}
          : nextLoad(url, context);
      },
    });
    const { withAuth } = await import(pathToFileURL(path.resolve('node_modules/@workos-inc/authkit-nextjs/dist/esm/session.js')).href);
    let strictError;
    try { await withAuth({ensureSignedIn: true}); } catch (error) { strictError = error.message; }
    const readOnlyAuth = await withAuth();
    const mutableCookies = new ResponseCookies(new Headers());
    globalThis.fixtureCookies = mutableCookies;
    const { getSignInUrl } = await import(pathToFileURL(path.resolve('node_modules/@workos-inc/authkit-nextjs/dist/esm/auth.js')).href);
    const authorizationUrl = new URL(await getSignInUrl({returnTo: '/cue', redirectUri: 'https://cue.example.test/auth/callback'}));
    console.log(JSON.stringify({
      strictError,
      readOnlyAuth,
      pkceCookieCount: mutableCookies.getAll().filter(cookie => cookie.name.startsWith('wos-auth-verifier-')).length,
      callback: authorizationUrl.searchParams.get('redirect_uri'),
      fetchCalls,
    }));
  `], {
    cwd: process.cwd(),
    timeout: 10000,
    env: {
      NODE_ENV: "test",
      WORKOS_API_KEY: "sk_test_offline_fixture",
      WORKOS_CLIENT_ID: "client_offline_fixture",
      WORKOS_COOKIE_PASSWORD: "offline-fixture-password-with-more-than-32-characters",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://cue.example.test/auth/callback",
    },
  });
  expect(JSON.parse(stdout)).toEqual({
    strictError: "Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options",
    readOnlyAuth: { user: null },
    pkceCookieCount: 1,
    callback: "https://cue.example.test/auth/callback",
    fetchCalls: 0,
  });
});
