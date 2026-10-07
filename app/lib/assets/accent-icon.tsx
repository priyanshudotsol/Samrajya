interface AccentIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function AccentIcon({
  size = 29,
  width,
  height,
  color = 'currentColor',
  className,
}: AccentIconProps) {
  const iconWidth = width || size;
  const iconHeight = height || (size * 16) / 29; // Maintain aspect ratio

  return (
    <svg
      width={iconWidth}
      height={iconHeight}
      viewBox="0 0 29 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M21.582 0L19.4477 9.46348e-05L27.1103 15.1714L29.0001 15.1714L21.582 0Z"
        fill={color}
      />
      <path d="M18.0933 0L13.267 9.46348e-05L20.5718 15.1714H25.6289L18.0933 0Z" fill={color} />
      <path d="M11.9119 0L7.08559 9.46348e-05L14.3904 15.1714H19.4475L11.9119 0Z" fill={color} />
      <path
        d="M4.82629 0L2.09808e-05 9.46348e-05L7.30479 15.1714H12.3619L4.82629 0Z"
        fill={color}
      />
    </svg>
  );
}
