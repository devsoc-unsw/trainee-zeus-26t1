import { redirect } from "next/navigation";

export default async function Redirect({ params }) {
  const { code } = await params;
  const safe = (code || "").toString().toUpperCase();
  redirect(`/waiting-room/${safe}`);
}
