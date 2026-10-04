"use client";
import { type ReactNode } from "react";
/** Dialogue overlays the camera without changing the world's scale. */
export default function WorldStage({ children }: { children: ReactNode }) {
  return <div className="content-area world-stage">{children}</div>;
}
