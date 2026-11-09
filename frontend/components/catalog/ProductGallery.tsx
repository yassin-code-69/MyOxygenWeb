"use client";

import { useState } from "react";
import { Carousel } from "@mantine/carousel";
import { Badge, UnstyledButton, VisuallyHidden } from "@mantine/core";
import type { EmblaCarouselType } from "embla-carousel";
import { ImageWithFallback } from "../ImageWithFallback";
import classes from "./ProductDetail.module.css";

export interface ProductGalleryProps {
  images: readonly string[];
  title: string;
  /** Rounded discount % shown as a pill on the image (omit when not discounted). */
  discountPercent?: number | null;
}

/**
 * Product image gallery on `@mantine/carousel` (Embla): swipe/drag, prev/next controls,
 * arrow-key navigation when focused, and thumbnail buttons synced with the slide.
 * The first image is the LCP element and loads with priority.
 */
export function ProductGallery({ images, title, discountPercent }: ProductGalleryProps) {
  const slides: Array<string | null> = images.length > 0 ? [...images] : [null];
  const multiple = slides.length > 1;
  const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);
  const [active, setActive] = useState(0);

  return (
    <div className={classes.gallery}>
      {discountPercent && discountPercent > 0 ? (
        <Badge size="lg" variant="filled" color="primaryPink.8" className={classes.discountBadge}>
          -{discountPercent}%<VisuallyHidden> off</VisuallyHidden>
        </Badge>
      ) : null}

      <Carousel
        className={classes.carousel}
        getEmblaApi={setEmbla}
        onSlideChange={setActive}
        withControls={multiple}
        withKeyboardEvents
        controlSize={34}
        emblaOptions={{ align: "start", containScroll: "trimSnaps" }}
        tabIndex={multiple ? 0 : undefined}
        aria-roledescription="carousel"
        aria-label={`${title} images`}
        previousControlProps={{ "aria-label": "Previous image" }}
        nextControlProps={{ "aria-label": "Next image" }}
      >
        {slides.map((src, index) => (
          <Carousel.Slide
            key={`${index}:${src ?? "placeholder"}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`Image ${index + 1} of ${slides.length}`}
          >
            <div className={classes.mainMedia}>
              <ImageWithFallback
                src={src}
                alt={index === 0 ? title : `${title} — image ${index + 1}`}
                fill
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                sizes="(max-width: 62em) 100vw, 600px"
                className={classes.mainImage}
              />
            </div>
          </Carousel.Slide>
        ))}
      </Carousel>

      {multiple ? (
        <ul className={classes.thumbs} aria-label="Choose an image">
          {slides.map((src, index) => (
            <li key={`${index}:${src ?? "placeholder"}`}>
              <UnstyledButton
                className={classes.thumb}
                data-active={index === active || undefined}
                aria-label={`Show image ${index + 1} of ${slides.length}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => embla?.scrollTo(index)}
              >
                <ImageWithFallback src={src} alt="" fill sizes="68px" className={classes.thumbImage} />
              </UnstyledButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
