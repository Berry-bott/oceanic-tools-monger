"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { HERO_SLIDES, type StoreProduct } from "@/data/tools-catalog";

interface HeroCarouselProps {
  products?: StoreProduct[];
}

export function HeroCarousel({ products = [] }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFading, setIsFading] = useState(false);

  const goToSlide = useCallback((index: number) => {
    setIsFading(true);
    setTimeout(() => {
      setCurrent(index);
      setIsFading(false);
    }, 300);
  }, []);

  const nextSlide = useCallback(() => {
    goToSlide((current + 1) % HERO_SLIDES.length);
  }, [current, goToSlide]);

  const prevSlide = useCallback(() => {
    goToSlide((current - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, [current, goToSlide]);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  const slide = HERO_SLIDES[current]!;

  // Dynamic backend product resolution:
  // Match the slide's product in the backend products list
  const matchedBackendProduct = useMemo(() => {
    if (!products || products.length === 0) return null;
    return products.find(
      (p) =>
        p.sku?.toLowerCase() === slide.productSlug?.toLowerCase() ||
        p.slug?.toLowerCase() === slide.productSlug?.toLowerCase() ||
        p.id === slide.productSlug
    );
  }, [products, slide.productSlug]);

  // If the product exists in the backend and has a valid price, use it.
  // Otherwise, if not available in backend, display cleanly without the price.
  const livePrice = matchedBackendProduct?.price && Number(matchedBackendProduct.price) > 0
    ? Number(matchedBackendProduct.price)
    : undefined;

  const originalPrice = livePrice
    ? matchedBackendProduct?.originalPrice || Math.round(livePrice * 1.15)
    : undefined;

  const discount = livePrice && originalPrice && originalPrice > livePrice
    ? Math.round(((originalPrice - livePrice) / originalPrice) * 100)
    : undefined;

  return (
    <div
      className="relative h-[500px] w-full overflow-hidden bg-peach-xlight select-none sm:h-[580px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Image */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 overflow-hidden ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      >
        <img
          src={slide.image}
          alt={slide.title}
          className="w-full h-full object-cover object-center scale-[1.02] transition-transform duration-1000 ease-out hover:scale-105"
          onError={(e) => {
            e.currentTarget.src = "/workshop-drill.jpg";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/20" />
      </div>

      {/* Hero Content */}
      <div
        className={`relative z-10 max-w-7xl mx-auto px-12 sm:px-6 flex items-center h-full transition-opacity duration-300 ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="max-w-xl py-12 sm:py-20">
          <span className="hero-content-enter inline-block text-[10px] sm:text-[11px] font-bold tracking-[0.2em] text-peach uppercase mb-4 border border-peach/50 px-3 py-1 rounded-full">
            {slide.category}
          </span>
          <h1 className="hero-content-enter font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white leading-tight mb-4">
            {slide.title.split("\n").map((line, idx) => (
              <span key={idx} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="hero-content-enter text-white/85 text-sm sm:text-base md:text-lg leading-relaxed mb-6 max-w-md">
            {slide.subtitle}
          </p>

          {/* Price Section: Displayed ONLY if product exists in backend and has a price */}
          {livePrice !== undefined ? (
            <div className="hero-content-enter flex items-baseline gap-3 mb-8">
              <span className="text-2xl md:text-3xl font-extrabold text-white">
                ₦{livePrice.toLocaleString("en-NG")}
              </span>
              {originalPrice && originalPrice > livePrice && (
                <>
                  <span className="text-white/60 line-through text-base">
                    ₦{originalPrice.toLocaleString("en-NG")}
                  </span>
                  {discount && discount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      -{discount}% OFF
                    </span>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="hero-content-enter mb-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm border border-white/20">
                Oceanic Industrial Grade Selection
              </span>
            </div>
          )}

          <div className="hero-content-enter flex flex-wrap gap-3">
            <Link
              href={`/product/${slide.productSlug}`}
              className="px-5 py-3 sm:px-7 sm:py-3.5 bg-peach-dark text-white rounded-full font-semibold text-xs sm:text-sm hover:bg-peach-deep transition-all duration-200 hover:scale-105 shadow-lg"
            >
              {slide.cta}
            </Link>
            <Link
              href={`/product/${slide.productSlug}`}
              className="px-5 py-3 sm:px-7 sm:py-3.5 bg-white/15 backdrop-blur-sm text-white rounded-full font-semibold text-xs sm:text-sm border border-white/30 hover:bg-white/25 transition-all duration-200"
            >
              View Product
            </Link>
          </div>
        </div>
      </div>

      {/* Prev / Next Buttons */}
      <button
        type="button"
        onClick={prevSlide}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/40 flex items-center justify-center transition-all"
        aria-label="Previous slide"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={nextSlide}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/40 flex items-center justify-center transition-all"
        aria-label="Next slide"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {HERO_SLIDES.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => goToSlide(idx)}
            className={`rounded-full transition-all duration-300 ${
              idx === current ? "w-7 h-2.5 bg-peach" : "w-2.5 h-2.5 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Counter */}
      <div className="absolute bottom-6 right-4 sm:right-6 z-20 text-white/60 text-xs font-medium">
        {current + 1} / {HERO_SLIDES.length}
      </div>
    </div>
  );
}
