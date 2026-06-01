import { SpotifyHelperApp } from "@/components/spotify-helper-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Home() {
  return <SpotifyHelperApp />;
}
