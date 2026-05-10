import { useEffect, useState } from 'react';

const KIOSK_WIDTH = 768;
const KIOSK_HEIGHT = 1024;

/**
 * When the URL contains `?scale=kiosk`, lock the viewport to the actual installed
 * display dimensions (768×1024 portrait) and CSS-scale the rendered content to fit
 * the browser window. Lets us see what the mounted Pi 5 display will actually show
 * rather than the same content stretched across a desktop browser.
 *
 * Without the param, renders children unchanged.
 */
export default function KioskFrame({ children }: { children: React.ReactNode }) {
  const isKiosk =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('scale') === 'kiosk';

  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!isKiosk) return;
    const update = () => {
      const sw = window.innerWidth / KIOSK_WIDTH;
      const sh = window.innerHeight / KIOSK_HEIGHT;
      setScale(Math.min(sw, sh));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isKiosk]);

  if (!isKiosk) return <>{children}</>;

  return (
    <div className="fixed inset-0 bg-neutral-900 flex items-center justify-center overflow-hidden">
      <div
        style={{
          width: KIOSK_WIDTH,
          height: KIOSK_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
          background: 'black',
        }}
      >
        {children}
      </div>
    </div>
  );
}
