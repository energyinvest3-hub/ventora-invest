import { ProfileSubpage } from "@/components/profile-page";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <ProfileSubpage section={section}/>;
}
