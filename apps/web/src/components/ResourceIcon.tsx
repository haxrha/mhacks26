import { RESOURCE_META } from "@/game/content";
import type { Resource } from "@/game/types";

/** Cropped cells from the supplied resource sheet, scaled with nearest-neighbor pixels. */
export default function ResourceIcon({
  resource,
  size = 28,
}: {
  resource: Resource;
  size?: number;
}) {
  const { name, sprite } = RESOURCE_META[resource];
  const scale = size / sprite.width;
  return (
    <span
      className="resource-sprite"
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${sprite.sheet}")`,
        backgroundSize: `${sprite.sheetWidth * scale}px ${sprite.sheetHeight * scale}px`,
        backgroundPosition: `${-sprite.x * scale}px ${-sprite.y * scale}px`,
      }}
    />
  );
}
