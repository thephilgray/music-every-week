import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Attempt to scroll main content area
    const main = document.querySelector('main');
    if (main) {
        main.scrollTo(0, 0);
    }
    // Fallback to window scroll
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}