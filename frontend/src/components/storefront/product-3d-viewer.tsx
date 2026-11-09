"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Product3DViewerProps {
  images: string[];
  productName: string;
}

export function Product3DViewer({ images, productName }: Product3DViewerProps) {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(12);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const dragStart = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const tick = useCallback(() => {
    if (autoRotate) {
      setRotY((y) => y + 0.4);
    }
    animRef.current = requestAnimationFrame(tick);
  }, [autoRotate]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [tick]);

  const onStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setAutoRotate(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    dragStart.current = { x: clientX, y: clientY };
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setRotY((y) => y + dx * 0.6);
    setRotX((x) => Math.max(-25, Math.min(25, x - dy * 0.3)));
    dragStart.current = { x: clientX, y: clientY };
  };

  const onEnd = () => {
    setIsDragging(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setAutoRotate(true);
    }, 2500);
  };

  const onReset = () => {
    setRotY(0);
    setRotX(12);
    setScale(1);
    setAutoRotate(true);
  };

  const frontImg = images[0] || "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format";
  const backImg = images[1] || images[0] || frontImg;
  const depth = 140 * scale;

  return (
    <div className="relative w-full aspect-square bg-gradient-to-br from-peach-xlight via-cream to-peach-light rounded-2xl overflow-hidden flex items-center justify-center select-none">
      {/* 3D Badge */}
      <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm text-[10px] font-semibold text-charcoal-light px-2.5 py-1 rounded-full z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-peach-dark animate-pulse" />
        3D VIEW
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="viewer-stage w-72 h-72 cursor-grab active:cursor-grabbing"
        style={{ perspective: "900px" }}
        onMouseDown={(e) => onStart(e.clientX, e.clientY)}
        onMouseMove={(e) => onMove(e.clientX, e.clientY)}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        onTouchStart={(e) => {
          if (e.touches[0]) onStart(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) {
            e.preventDefault();
            onMove(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={onEnd}
      >
        <div
          className="viewer-cube relative w-full h-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transition: isDragging ? "none" : "transform 0.05s linear",
          }}
        >
          {/* Front */}
          <Face transform={`translateZ(${depth}px)`} img={frontImg} alt={productName} brightness={1} />
          {/* Back */}
          <Face transform={`rotateY(180deg) translateZ(${depth}px)`} img={backImg} alt={productName} brightness={0.92} />
          {/* Right */}
          <Face transform={`rotateY(90deg) translateZ(${depth}px)`} img={frontImg} alt="" brightness={0.8} scaleX={0.4} />
          {/* Left */}
          <Face transform={`rotateY(-90deg) translateZ(${depth}px)`} img={backImg} alt="" brightness={0.75} scaleX={0.4} />
          {/* Top Cap */}
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              transform: `rotateX(90deg) translateZ(${depth}px)`,
              backfaceVisibility: "hidden",
              background: "linear-gradient(135deg, #FFE8D9 0%, #FFAB84 100%)",
              opacity: 0.9,
            }}
          />
          {/* Bottom Shadow */}
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              transform: `rotateX(-90deg) translateZ(${depth}px)`,
              backfaceVisibility: "hidden",
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 flex gap-1.5 z-10">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(1.5, s + 0.15))}
          title="Zoom in"
          className="w-8 h-8 bg-white/90 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm transition-all hover:shadow-md"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
          title="Zoom out"
          className="w-8 h-8 bg-white/90 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm transition-all hover:shadow-md"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Reset"
          className="w-8 h-8 bg-white/90 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm transition-all hover:shadow-md"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.929 15.071A8 8 0 1 0 6.343 6.343" />
          </svg>
        </button>
      </div>

      <p className="absolute bottom-4 left-4 text-[10px] text-charcoal-light/60 font-medium z-10">
        Drag to rotate
      </p>
    </div>
  );
}

function Face({
  transform,
  img,
  alt,
  brightness,
  scaleX = 1,
}: {
  transform: string;
  img: string;
  alt: string;
  brightness: number;
  scaleX?: number;
}) {
  return (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden"
      style={{
        transform,
        backfaceVisibility: "hidden",
        filter: `brightness(${brightness})`,
      }}
    >
      <img
        src={img}
        alt={alt}
        className="w-full h-full object-cover"
        style={scaleX === 1 ? undefined : { transform: `scaleX(${scaleX})`, transformOrigin: "center" }}
        draggable={false}
      />
    </div>
  );
}
