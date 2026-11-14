"use client";

import { useState, useRef, useEffect } from "react";

interface Product3DViewerProps {
  images: string[];
  productName: string;
}

export function Product3DViewer({ images, productName }: Product3DViewerProps) {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(14);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const dragStart = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let frameId: number;
    const tick = () => {
      if (autoRotate) setRotY((y) => (y + 0.35) % 360);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [autoRotate]);

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
    setRotX((x) => Math.max(-28, Math.min(28, x - dy * 0.3)));
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
    setRotX(14);
    setScale(1);
    setAutoRotate(true);
  };

  if (!images || !images.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-peach-xlight text-sm text-charcoal-light">
        No product photo available.
      </div>
    );
  }

  // Smart image assignment for square cube faces:
  // 3 images: front, back, and side (used for right & left)
  // 2 images: front, back, and alternating sides
  // 1 image: all 4 faces use the single image with directional shading
  const frontImg = images[0];
  let backImg = images[0];
  let rightImg = images[0];
  let leftImg = images[0];
  let mirrorLeft = false;

  if (images.length >= 3) {
    backImg = images[1];
    rightImg = images[2];
    leftImg = images[2];
    mirrorLeft = true; // mirror side view horizontally so left profile faces naturally
  } else if (images.length === 2) {
    backImg = images[1];
    rightImg = images[0];
    leftImg = images[1];
  }

  // True square cube: width = height = depth (288px x 288px x 288px)
  // Translation from center to each face is exactly half of the face dimension (144px)
  const cubeSize = 288;
  const depth = (cubeSize / 2) * scale;

  return (
    <div className="relative w-full aspect-square bg-gradient-to-br from-peach-xlight via-cream to-peach-light/70 rounded-2xl overflow-hidden flex items-center justify-center select-none shadow-sm border border-peach-light/40">
      {/* 3D Indicator Badge */}
      <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/90 backdrop-blur-md text-[10px] font-bold text-charcoal px-3 py-1 rounded-full z-10 shadow-sm border border-peach-light">
        <span className="w-1.5 h-1.5 rounded-full bg-peach-dark animate-pulse" />
        3D ROTATION
      </div>

      {/* Fixed Floor Shadow */}
      <div
        className="absolute bottom-8 w-64 h-8 rounded-full pointer-events-none transition-transform"
        style={{
          transform: `scale(${scale})`,
          background: "radial-gradient(ellipse at center, rgba(35, 45, 40, 0.22) 0%, rgba(35, 45, 40, 0.08) 50%, transparent 75%)",
          filter: "blur(5px)",
        }}
      />

      {/* Stage */}
      <div
        ref={stageRef}
        className="viewer-stage w-72 h-72 cursor-grab active:cursor-grabbing flex items-center justify-center"
        style={{ perspective: "1000px" }}
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
          {/* Front Face (1:1 square) */}
          <Face
            transform={`translateZ(${depth}px)`}
            img={frontImg}
            alt={`${productName} front view`}
            brightness={1}
          />

          {/* Back Face (1:1 square) */}
          <Face
            transform={`rotateY(180deg) translateZ(${depth}px)`}
            img={backImg}
            alt={`${productName} back view`}
            brightness={0.82}
          />

          {/* Right Side Face (1:1 square - equal width to front & back) */}
          <Face
            transform={`rotateY(90deg) translateZ(${depth}px)`}
            img={rightImg}
            alt={`${productName} right side view`}
            brightness={0.9}
          />

          {/* Left Side Face (1:1 square - equal width to front & back) */}
          <Face
            transform={`rotateY(-90deg) translateZ(${depth}px)`}
            img={leftImg}
            alt={`${productName} left side view`}
            brightness={0.86}
            mirror={mirrorLeft}
          />

          {/* Top Cap (1:1 square) */}
          <div
            className="absolute inset-0 rounded-2xl border border-peach-light/40"
            style={{
              transform: `rotateX(90deg) translateZ(${depth}px)`,
              backfaceVisibility: "hidden",
              background: "linear-gradient(135deg, #ffffff 0%, #f4f6f4 100%)",
            }}
          />

          {/* Bottom Cap (1:1 square) */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              transform: `rotateX(-90deg) translateZ(${depth}px)`,
              backfaceVisibility: "hidden",
              background: "#1e2924",
              opacity: 0.15,
            }}
          />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 flex gap-1.5 z-10">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(1.4, s + 0.15))}
          title="Zoom in"
          className="w-8 h-8 bg-white/95 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm border border-peach-light hover:border-peach transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.7, s - 0.15))}
          title="Zoom out"
          className="w-8 h-8 bg-white/95 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm border border-peach-light hover:border-peach transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Reset perspective"
          className="w-8 h-8 bg-white/95 hover:bg-white text-charcoal rounded-lg flex items-center justify-center shadow-sm border border-peach-light hover:border-peach transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.929 15.071A8 8 0 1 0 6.343 6.343" />
          </svg>
        </button>
      </div>

      <p className="absolute bottom-4 left-4 text-[11px] text-charcoal-light/70 font-medium z-10 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-peach-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Drag in any direction to spin 360°
      </p>
    </div>
  );
}

function Face({
  transform,
  img,
  alt,
  brightness,
  mirror = false,
}: {
  transform: string;
  img: string;
  alt: string;
  brightness: number;
  mirror?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 rounded-2xl overflow-hidden bg-white border border-peach-light/40 shadow-sm"
      style={{
        transform,
        backfaceVisibility: "hidden",
        filter: `brightness(${brightness})`,
      }}
    >
      <img
        src={img}
        alt={alt}
        className="w-full h-full object-cover select-none"
        style={mirror ? { transform: "scaleX(-1)" } : undefined}
        draggable={false}
      />
    </div>
  );
}
