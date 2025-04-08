'use client';

import { Button } from '@foil/ui/components/ui/button';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

// Create a component to render the SVG icon from the iconSvg string
const FocusAreaIcon = ({
  iconSvg,
  color,
}: {
  iconSvg: string;
  color: string;
}) => (
  <div
    className="rounded-full p-4 w-16 h-16 flex items-center justify-center"
    style={{ backgroundColor: `${color}25` }} // Using 25% opacity version of the color
  >
    <div
      className="w-8 h-8 flex items-center justify-center"
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  </div>
);

// Duplicate the array to create a seamless loop
const extendedFocusAreas = [...FOCUS_AREAS, ...FOCUS_AREAS];

export default function TopicsOfInterest() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isManualScrolling, setIsManualScrolling] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [position, setPosition] = useState(0);
  const animationRef = useRef<number | null>(null);

  const startAutoScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel || isManualScrolling) return;

    const animate = () => {
      setPosition((prev) => {
        const newPosition = prev - 0.2; // Slow scroll speed

        // Reset position when first set of cards is out of view
        if (carousel && newPosition <= -carousel.scrollWidth / 2) {
          return 0;
        }

        return newPosition;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const stopAutoScroll = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // Handle mouse down event
  const handleMouseDown = (e: React.MouseEvent) => {
    stopAutoScroll();
    setIsManualScrolling(true);
    setStartX(e.pageX - (carouselRef.current?.offsetLeft || 0));
    setScrollLeft(position);
  };

  // Handle mouse leave event
  const handleMouseLeave = () => {
    if (isManualScrolling) {
      setIsManualScrolling(false);
      startAutoScroll();
    }
  };

  // Handle mouse up event
  const handleMouseUp = () => {
    setIsManualScrolling(false);
    startAutoScroll();
  };

  // Handle mouse move event
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isManualScrolling) return;
    e.preventDefault();

    const carousel = carouselRef.current;
    if (!carousel) return;

    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1; // Scroll speed multiplier
    const newPosition = scrollLeft + walk;

    setPosition(newPosition);
  };

  // Apply position to carousel
  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.style.transform = `translateX(${position}px)`;
    }
  }, [position]);

  // Start auto-scrolling on component mount
  useEffect(() => {
    startAutoScroll();

    return () => {
      stopAutoScroll();
    };
  }, [isManualScrolling]);

  return (
    <section className="pt-72 pb-24 px-8 overflow-hidden relative">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-heading font-normal">Interest Topics</h2>
          <Link
            href="/predictions"
            className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold"
          >
            VIEW ALL
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-0.5"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>

        <div className="relative">
          {/* Gradient overlays for fade effect */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

          {/* Carousel container */}
          <div className="overflow-hidden">
            <div
              ref={carouselRef}
              className="flex gap-6 py-4 cursor-grab active:cursor-grabbing"
              style={{ width: 'fit-content' }}
              role="button"
              tabIndex={0}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
            >
              {extendedFocusAreas.map((area, index) => (
                <div
                  key={index}
                  className="bg-background rounded-2xl overflow-hidden shadow-sm border border-muted border-t-0 flex flex-col w-[320px] flex-shrink-0"
                >
                  <div
                    className="h-3"
                    style={{ backgroundColor: area.color }}
                  />
                  <div className="p-6 flex-grow">
                    <div className="flex items-center gap-4 mb-4">
                      <FocusAreaIcon
                        iconSvg={area.iconSvg}
                        color={area.color}
                      />
                      <h3 className="text-xl font-semibold">{area.name}</h3>
                    </div>
                    <p className="text-gray-600 text-sm mb-6">
                      {area.description}
                    </p>
                    <div className="mt-auto">
                      <Link href={`/predictions?focus=${area.id}`}>
                        <Button
                          variant="secondary"
                          className="w-full rounded-full"
                        >
                          View Predictions
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
