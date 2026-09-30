# Ventora — Wind Energy Platform

Rebranding completo baseado na “carcaça” e navegação do EnergyInvest, agora voltado a energia eólica.

## Branding
- Nome: **Ventora**
- Assinatura: **Energia em movimento.**
- Paleta: azul-petróleo, ciano, verde-lima e fundos claros.
- Logo e favicon vetoriais próprios em `public/`.
- Fotografias eólicas próprias já incorporadas em `public/`, além dos vetores de fallback.

## Incluído
- Dashboard responsivo
- Catálogo de parques eólicos
- Detalhe de projeto
- Participação em modo demonstrativo
- “Meus ativos”
- Carteira demonstrativa
- Perfil
- Login/cadastro visual
- Base SQL inicial para Supabase
- Avisos e áreas de compliance

## Rodar
```bash
npm install
npm run dev
```
Depois abra `http://localhost:3000`.

## Importante sobre pagamentos e investimentos reais
Esta entrega mantém **somente a experiência de interface em modo demo**. Não há PIX, saque, crédito automático, promessa de rentabilidade ou gateway real. Antes de aceitar dinheiro de usuários, valide o modelo jurídico/regulatório aplicável, o enquadramento do produto, publicidade, contratos, KYC/AML quando aplicável, custódia/segregação, riscos e integração com provedor autorizado.

## Origem estrutural
A estrutura visual e os fluxos foram adaptados a partir do repositório EnergyInvest fornecido pelo cliente. O projeto Ventora foi construído separado para não alterar a aplicação solar existente.

## Imagens eólicas incluídas

O pacote inclui fotografias geradas especificamente para a identidade VENTORA e já vinculadas ao site:
- `public/wind-hero.png` — hero panorâmico.
- `public/wind-vales.png` — parque eólico entre colinas e vales.
- `public/wind-offshore.png` — parque eólico offshore.
- `public/wind-campos.png` — turbinas em campos agrícolas.
- `public/wind-serra.png` — close de turbina em região serrana.
- `public/wind-litoral.png` — parque eólico costeiro ao pôr do sol.

As imagens estão incorporadas no projeto e não dependem de URLs externas.

## Conectar ao Supabase

A Ventora deve usar um **projeto Supabase separado** do EnergyInvest, mesmo que fique na mesma conta Supabase. Para conectar, serão necessários:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou publishable key equivalente)
- `SUPABASE_SERVICE_ROLE_KEY` somente no backend, quando as rotas administrativas existirem

Depois, execute `supabase/schema.sql` no projeto novo e troque `DEMO_MODE=true` por `DEMO_MODE=false` apenas quando autenticação, RLS e regras de produção estiverem revisadas.
