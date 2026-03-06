import { useState, useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';

export function FloatingScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef<number>(0);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const handleScroll = () => {
      const currentScrollTop = main.scrollTop;
      
      // Clear existing timeout
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      // Show button if scrolled down more than 300px AND scrolling UP
      if (currentScrollTop > 300 && currentScrollTop < lastScrollTopRef.current) {
        setIsVisible(true);
        
        // Hide after 2 seconds of no scrolling
        timeoutRef.current = window.setTimeout(() => {
          setIsVisible(false);
        }, 2000);
      } else {
        // Scrolling down or at top, hide it immediately
        setIsVisible(false);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    main.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      main.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scrollToTop = () => {
    const main = document.querySelector('main');
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <button
      onClick={scrollToTop}
      className={`
        fixed bottom-36 md:bottom-28 right-6 z-50 
        p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg 
        transition-all duration-500 transform
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}
      `}
      title="Back to Top"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
