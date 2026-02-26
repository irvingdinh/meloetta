import { useCallback, useEffect, useState } from "react";

import { DiffOverlay } from "@/components/DiffOverlay";
import { FolderPicker } from "@/components/FolderPicker";
import { createSession } from "@/lib/api";
import type { CLIType } from "@/lib/types";
import { SessionListPage } from "@/pages/SessionListPage";
import { SessionPage } from "@/pages/SessionPage";

type Route = { view: "list" } | { view: "session"; id: string };

function parseHash(): Route {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/session/")) {
    return { view: "session", id: hash.slice(10) };
  }
  return { view: "list" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [showPicker, setShowPicker] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigateToSession = useCallback((id: string) => {
    location.hash = `#/session/${id}`;
  }, []);

  const navigateToList = useCallback(() => {
    location.hash = "#/";
  }, []);

  const handleCreateSession = useCallback(
    async (cwd: string, cli: CLIType) => {
      setShowPicker(false);
      try {
        const session = await createSession(cwd, cli);
        navigateToSession(session.id);
      } catch {
        // creation failed
      }
    },
    [navigateToSession],
  );

  return (
    <>
      {route.view === "list" && (
        <SessionListPage
          onOpenSession={navigateToSession}
          onNewSession={() => setShowPicker(true)}
        />
      )}

      {route.view === "session" && (
        <SessionPage
          sessionId={route.id}
          onBack={navigateToList}
          onShowDiff={() => setShowDiff(true)}
        />
      )}

      {showPicker && (
        <FolderPicker
          onClose={() => setShowPicker(false)}
          onSelect={handleCreateSession}
        />
      )}

      {showDiff && route.view === "session" && (
        <DiffOverlay sessionId={route.id} onClose={() => setShowDiff(false)} />
      )}
    </>
  );
}
