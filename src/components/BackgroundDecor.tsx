import React from "react";

// Decorative background geometry for the preview themes. The shapes are plain
// divs so they can use the same CSS variables as the rest of the palette and
// switch with data-theme; they disappear entirely on the default theme.
export const BackgroundDecor: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="decor decor-grain" />

    {/* A · arches + sun */}
    <div className="decor decor-sand arch-a" />
    <div className="decor decor-sand arch-b" />
    <div className="decor decor-sand sun" />

    {/* B · diagonal slashes + ring + dots */}
    <div className="decor decor-volt slash-a" />
    <div className="decor decor-volt slash-b" />
    <div className="decor decor-volt halo" />
    <div className="decor decor-volt dots" />

    {/* C · organic blobs + wave */}
    <div className="decor decor-coastal blob-a" />
    <div className="decor decor-coastal blob-b" />
    <div className="decor decor-coastal wave" />
  </div>
);
