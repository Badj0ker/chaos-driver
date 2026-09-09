import { createFileRoute } from "@tanstack/react-router";
import VeraDrivingGame from "@/components/VeraDrivingGame";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vera's Driving Exam — Chaotic Meme Driving Game" },
      {
        name: "description",
        content:
          "Help Vera fail her driving exam in style: 60 seconds of top-down city chaos, flying pedestrians and a screaming instructor. Play on mobile or desktop.",
      },
      { property: "og:title", content: "Vera's Driving Exam — Chaotic Meme Driving Game" },
      {
        property: "og:description",
        content: "60 seconds. One city. Zero talent. Rack up Chaos points and fail the exam spectacularly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VeraDrivingGame,
});
