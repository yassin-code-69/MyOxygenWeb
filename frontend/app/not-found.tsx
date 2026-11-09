import type { Metadata } from "next";
import { NotFoundClient } from "./NotFoundClient";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "Sorry, the page you are looking for could not be found. Explore our mother and baby care products delivered across Bangladesh.",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundClient />;
}
