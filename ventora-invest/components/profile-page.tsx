"use client";
import { UserRound, Mail, ShieldCheck, Bell, LifeBuoy } from "lucide-react";
import { useApp } from "./app-provider";
export function ProfilePage(){const {profile}=useApp(); return <><div className="page-head"><div><span>CONTA</span><h1>Perfil</h1><p>Gerencie seus dados e a segurança da sua conta Ventora.</p></div></div>
<div className="profile-card"><div className="avatar">{profile.name[0]}</div><div><h2>{profile.name}</h2><p><Mail size={15}/>{profile.email}</p></div></div>
<div className="settings-grid"><article><UserRound/><div><strong>Dados pessoais</strong><p>Dados vinculados ao seu cadastro Supabase.</p></div></article><article><ShieldCheck/><div><strong>Segurança</strong><p>Proteção de sessão e redefinição de senha.</p></div></article><article><Bell/><div><strong>Notificações</strong><p>Configure alertas sobre eventos da conta.</p></div></article><article><LifeBuoy/><div><strong>Suporte</strong><p>Defina um canal oficial de atendimento.</p></div></article></div></>}
