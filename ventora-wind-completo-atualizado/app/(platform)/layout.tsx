import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/shell";
export default function PlatformLayout({children}:{children:React.ReactNode}){return <AppProvider><AppShell>{children}</AppShell></AppProvider>}
