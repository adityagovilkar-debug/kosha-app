import { ImageResponse } from "next/og";

// Generated apple-touch-icon so iOS "Add to Home Screen" shows the Aurora
// mark instead of a screenshot. 180×180 is the iOS home-screen size.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 55%, #2dd4bf 100%)",
          color: "white",
          fontSize: 112,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
        }}
      >
        K
      </div>
    ),
    { ...size },
  );
}
