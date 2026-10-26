/**
 * LoginVisual — Fondo visual de la pantalla de acceso.
 *
 * Red de nodos animada en <canvas> a pantalla completa (reacciona al cursor),
 * radar, grilla y tipografía técnica. Es puramente decorativo: no contiene
 * lógica de auth. Respeta `prefers-reduced-motion` (frame estático).
 */
import { useEffect, useRef } from 'react';
import { Shield, Radar, Fingerprint } from 'lucide-react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function LoginVisual() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(110, Math.max(30, Math.round((width * height) / 18000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Enlaces entre nodos cercanos
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 132) {
            ctx.strokeStyle = `rgba(99,102,241,${(1 - dist / 132) * 0.24})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Enlaces al cursor (cian)
      for (const n of nodes) {
        const dist = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (dist < 180) {
          ctx.strokeStyle = `rgba(34,211,238,${(1 - dist / 180) * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      // Nodos
      for (const n of nodes) {
        const near = Math.hypot(n.x - mouse.x, n.y - mouse.y) < 180;
        ctx.beginPath();
        ctx.fillStyle = near ? 'rgba(34,211,238,0.95)' : 'rgba(129,140,248,0.7)';
        ctx.shadowColor = near ? 'rgba(34,211,238,0.8)' : 'rgba(99,102,241,0.55)';
        ctx.shadowBlur = near ? 10 : 6;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (reduceMotion) return;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }
      raf = requestAnimationFrame(draw);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    resize();
    draw();
    const observer = new ResizeObserver(() => {
      if (!reduceMotion) cancelAnimationFrame(raf);
      resize();
      draw();
    });
    observer.observe(wrap);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerleave', onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      wrap.removeEventListener('pointermove', onPointerMove);
      wrap.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <section className="login-visual" ref={wrapRef} aria-label="NetShield">
      <canvas ref={canvasRef} className="login-visual__canvas" aria-hidden="true" />
      <div className="login-visual__grid" aria-hidden="true" />
      <div className="login-visual__radar" aria-hidden="true" />
      <div className="login-visual__scan" aria-hidden="true" />

      <div className="login-visual__content">
        <div className="login-brand">
          <div className="login-brand__mark">
            <Shield size={20} />
          </div>
          <div className="login-brand__text">
            <span className="login-brand__name">NetShield</span>
            <span className="login-brand__tag">security operations</span>
          </div>
        </div>

        <div className="login-hero">
          <p className="login-kicker">
            <Radar size={13} /> plataforma de seguridad
          </p>
          <h1 className="login-title">
            Net<span>Shield</span>
          </h1>
          <p className="login-sub">
            Red, firewall, inventario y SIEM en una sola consola operativa.
          </p>
        </div>

        <div className="login-visual__bottom">
          <div className="login-uni">
            <span className="login-uni__line" aria-hidden="true" />
            <div>
              <p className="login-uni__name">Universidad Nacional de Mar del Plata</p>
              <p className="login-uni__caption">NetShield — Universidad Nacional de Mar del Plata</p>
            </div>
          </div>

          <div className="login-status">
            <span className="login-status__dot" aria-hidden="true" />
            <Fingerprint size={13} />
            <span>Acceso restringido · monitoreo activo</span>
          </div>
        </div>
      </div>
    </section>
  );
}
