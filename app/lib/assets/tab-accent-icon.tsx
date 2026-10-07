interface TabAccentIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function TabAccentIcon({
  size = 29,
  width,
  height,
  color = 'currentColor',
  className,
}: TabAccentIconProps) {
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
        d="M15.6103 0.0839844L11.812 0.0840967L25.4488 18.084L28.812 18.0839L15.6103 0.0839844Z"
        fill={color}
      />
      <path
        d="M9.40112 0.0839844L0.812012 0.0840967L13.812 18.0839H22.812L9.40112 0.0839844Z"
        fill={color}
      />
    </svg>
  );
}
