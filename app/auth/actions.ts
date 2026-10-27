"use server";
import { signOut } from "@workos-inc/authkit-nextjs";
export async function signOutAction() {
  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!redirectUri) throw new Error("WorkOS redirect URI is not configured");
  await signOut({ returnTo: new URL("/", redirectUri).toString() });
}
