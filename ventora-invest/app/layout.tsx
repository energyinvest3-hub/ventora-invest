import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Ventora | Energia em movimento", description:"Plataforma Ventora para acompanhamento de projetos eólicos.", icons:{icon:"/icon.svg"} };
export const viewport: Viewport = { width:"device-width", initialScale:1, themeColor:"#071e25" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
