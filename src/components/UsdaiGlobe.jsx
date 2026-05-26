import React, { useEffect, useImperativeHandle, useRef, forwardRef, useState } from "react";
import Globe from "react-globe.gl";

// Lazy-loaded by UsdaiPage via React.lazy(() => import("./UsdaiGlobe")).
// Props:
//   points: [{ id, lat, lng, size, color, label }]
//   onPointClick(point)
//   accent: hex string for atmosphere
// Imperative handle:
//   spinTo(lat, lng): smooth pointOfView animation
const UsdaiGlobe = forwardRef(function UsdaiGlobe({ points, onPointClick, accent }, ref) {
  const globeRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 480, h: 420 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const r = e.contentRect;
        const w = Math.max(280, Math.floor(r.width));
        setSize({ w, h: Math.max(360, Math.floor(w * 0.85)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // Initial view: angle so most of N. America / Europe are visible.
    try { g.pointOfView({ lat: 30, lng: -50, altitude: 2.1 }, 0); } catch {}
  }, []);

  useImperativeHandle(ref, () => ({
    spinTo(lat, lng) {
      const g = globeRef.current;
      if (!g) return;
      try { g.pointOfView({ lat, lng, altitude: 1.6 }, 1200); } catch {}
    },
  }), []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: size.h }}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={true}
        atmosphereColor={accent}
        atmosphereAltitude={0.14}
        globeImageUrl="https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(p) => 0.01 + (p.size || 0.005)}
        pointRadius={(p) => 0.35 + (p.size || 0) * 6}
        pointColor={(p) => p.color || accent}
        pointLabel={(p) =>
          `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;background:#131926;border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:4px;color:#e2e8f0;">${p.label || ""}</div>`
        }
        onPointClick={onPointClick}
      />
    </div>
  );
});

export default UsdaiGlobe;
