"use client";
import { createContext, useContext, type ReactNode } from "react";
const TimeZone = createContext("Asia/Kolkata");
export function WorkspacePreferences({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  return <TimeZone.Provider value={timezone}>{children}</TimeZone.Provider>;
}
export function useWorkspaceDate() {
  const timeZone = useContext(TimeZone);
  return (value: number) =>
    new Intl.DateTimeFormat(undefined, { timeZone }).format(value);
}
