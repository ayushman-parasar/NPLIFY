"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Sun/moon switch. Persists the choice in a cookie (read by layout.tsx before first paint) and localStorage. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const saved = document.documentElement.getAttribute("data-theme") as Theme | null;
    setTheme(saved ?? systemTheme());
  }, []);

  const toggle = () => {
    const next: Theme = (theme ?? systemTheme()) === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("erd-theme", next);
      document.cookie = `erd-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    setTheme(next);
  };

  return (
    <button type="button" className="themetog" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
}
