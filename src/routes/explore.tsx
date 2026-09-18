import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * There is no separate Explore destination: university research lives inside
 * the Matches screen. Old links land there instead of a dead end.
 */
export const Route = createFileRoute("/explore")({
  beforeLoad: () => {
    throw redirect({ to: "/app", hash: "matches" });
  },
});
