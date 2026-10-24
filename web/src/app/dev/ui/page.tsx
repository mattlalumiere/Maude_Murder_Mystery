import { notFound } from "next/navigation";
import { Gallery } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
