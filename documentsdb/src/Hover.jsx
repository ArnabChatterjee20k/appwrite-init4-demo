import React from "react";

// Renders an element that merges `hover` styles on top of `style` while hovered.
// Replaces the design DSL's `style-hover=""` attribute.
export default function Hover({ as = "div", style, hover, children, onMouseEnter, onMouseLeave, ...rest }) {
  const [h, setH] = React.useState(false);
  return React.createElement(
    as,
    {
      ...rest,
      style: h && hover ? { ...style, ...hover } : style,
      onMouseEnter: (e) => {
        setH(true);
        onMouseEnter && onMouseEnter(e);
      },
      onMouseLeave: (e) => {
        setH(false);
        onMouseLeave && onMouseLeave(e);
      },
    },
    children
  );
}
