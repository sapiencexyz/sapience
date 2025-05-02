'use client';

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
    className="rounded-full p-2.5 w-10 h-10 flex items-center justify-center"
    style={{ backgroundColor: `${color}25` }} // Using 25% opacity version of the color
  >
    <div
      className="w-5 h-5 flex items-center justify-center"
      style={{ color }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  </div>
);

// Duplicate the array to create a seamless loop
const extendedFocusAreas = [...FOCUS_AREAS, ...FOCUS_AREAS];

export default function TopicsOfInterest() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const animationRef = useRef<number | null>(null);

  const startAutoScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const scrollSpeed = 0.2; // Keep original speed

    const animate = () => {
      setPosition((prev) => {
        const newPosition = prev - scrollSpeed; // Use constant speed

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
  }, []); // Remove dependencies related to manual scroll and mobile detection

  return (
    <section className="pt-40 pb-24 px-8 overflow-hidden relative">
      <div className="container mx-auto">
        <div className="relative">
          {/* Gradient overlays for fade effect */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

          {/* Carousel container */}
          <div className="overflow-hidden">
            <div
              ref={carouselRef}
              className="flex gap-6 py-4"
              style={{ width: 'fit-content' }}
            >
              {extendedFocusAreas.map((area, index) => (
                <Link
                  key={index}
                  href={`/forecasting?category=${area.id}`}
                  className="bg-background rounded-lg overflow-hidden shadow-sm border border-muted border-t-0 flex flex-col w-auto flex-shrink-0 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <div className="flex items-center gap-4 px-6 py-4">
                    <FocusAreaIcon iconSvg={area.iconSvg} color={area.color} />
                    <h3 className="text-xl font-medium whitespace-nowrap">
                      {area.name}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
