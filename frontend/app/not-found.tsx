import type { Metadata } from "next";
import { NotFoundClient } from "./NotFoundClient";

export const metadata: Metadata = {
  title: "404 - Page Not Found | My Oxygen",
  description:
    "Sorry, the mother and baby care page you are looking for could not be found. Explore our safe, gentle products across Bangladesh.",
};

export default function NotFound() {
  return <NotFoundClient />;
}
