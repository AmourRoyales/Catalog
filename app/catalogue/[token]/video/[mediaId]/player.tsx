"use client";

// Client-only because blocking the right-click "Save video as…" menu needs
// an event handler — same download lock as the catalogue viewer.
export default function VideoPlayer({ src, downloadsAllowed }: { src: string; downloadsAllowed: boolean }) {
  return (
    <video
      src={src}
      className="w-full h-full object-contain"
      controls
      controlsList={downloadsAllowed ? undefined : "nodownload"}
      onContextMenu={downloadsAllowed ? undefined : (e) => e.preventDefault()}
      autoPlay
      muted
      loop
      playsInline
    />
  );
}
