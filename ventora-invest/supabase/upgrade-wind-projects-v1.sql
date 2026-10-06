-- Ventora Invest — expansão do catálogo eólico
-- Execute no Supabase SQL Editor depois de aplicar o upgrade visual.
-- Seguro para reexecutar: usa ON CONFLICT (slug) DO UPDATE.
-- As projeções são cenários informativos e não garantia de resultado.

insert into public.wind_projects
(slug,name,description,city,region,image,capacity_mw,unit_value,duration_days,projected_scenario,available_units,max_units_per_user,featured,status)
values
('ventos-sertao','Ventos do Sertão','Projeto eólico no Nordeste brasileiro.','Mossoró','RN','/wind-vales.png',18,50,15,78,420,100,true,'available'),
('chapada-branca','Chapada Branca','Parque eólico em área de ventos constantes no interior potiguar.','João Câmara','RN','/wind-1.svg',24,75,15,108,360,80,true,'available'),
('atlas-litoral','Atlas Litoral','Complexo eólico em região litorânea.','Aracati','CE','/wind-litoral.png',32,120,20,174,260,100,true,'available'),
('litoral-potiguar','Litoral Potiguar','Projeto eólico costeiro com infraestrutura de geração distribuída.','Touros','RN','/wind-2.svg',38,180,20,252,230,70,true,'available'),
('serra-azul','Serra Azul Wind','Projeto em região serrana com forte potencial eólico.','Caetité','BA','/wind-serra.png',44,250,20,352,176,100,true,'available'),
('sertao-premium','Sertão Premium','Complexo eólico de médio porte no semiárido nordestino.','Petrolina','PE','/wind-3.svg',52,350,20,483,150,60,false,'available'),
('pampa-wind','Pampa Wind','Projeto eólico na região Sul.','Santana do Livramento','RS','/wind-campos.png',61,490,25,676,92,100,false,'closing'),
('bahia-vento-forte','Bahia Vento Forte','Projeto eólico de maior escala no corredor de ventos da Bahia.','Guanambi','BA','/wind-4.svg',72,690,25,932,88,50,true,'available'),
('nordeste-prime','Nordeste Prime','Parque eólico de maior capacidade no Nordeste.','Parnaíba','PI','/wind-hero.png',86,890,30,1190,64,100,true,'available'),
('rio-grande-wind','Rio Grande Wind','Projeto de alta capacidade no litoral do Rio Grande do Norte.','Macau','RN','/wind-5.svg',98,1290,30,1702,54,40,false,'available'),
('offshore-one','Offshore One','Projeto eólico marítimo ilustrativo.','Costa Brasileira','BR','/wind-offshore.png',120,1490,35,1950,38,100,true,'closing'),
('pampa-prime','Pampa Prime','Complexo eólico premium no extremo sul brasileiro.','Bagé','RS','/wind-6.svg',145,2390,30,3107,32,30,false,'available'),
('atlantico-offshore','Atlântico Offshore','Projeto marítimo de grande capacidade na costa brasileira.','Costa do Ceará','BR','/wind-offshore.png',190,3490,35,4467,26,25,true,'available'),
('patagonia-wind','Patagonia Wind','Projeto internacional em corredor de ventos patagônicos.','Patagônia','Argentina','/wind-campos.png',220,4990,40,6238,22,20,true,'available'),
('texas-wind-grid','Texas Wind Grid','Complexo eólico internacional conectado a corredor energético norte-americano.','Texas','EUA','/wind-vales.png',280,7490,40,9213,18,15,true,'available'),
('iberia-wind','Iberia Wind Prime','Projeto eólico internacional em região ibérica.','Galícia','Espanha','/wind-serra.png',340,10900,45,13298,14,12,false,'available'),
('north-sea-offshore','North Sea Offshore','Projeto offshore internacional de grande porte.','Mar do Norte','Europa','/wind-offshore.png',420,16900,45,20280,10,8,true,'available'),
('ventora-global','Ventora Global Wind','Projeto de maior porte do catálogo Ventora.','Portfólio Global','Global','/wind-hero.png',560,24900,50,29482,8,5,true,'available')
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  city=excluded.city,
  region=excluded.region,
  image=excluded.image,
  capacity_mw=excluded.capacity_mw,
  unit_value=excluded.unit_value,
  duration_days=excluded.duration_days,
  projected_scenario=excluded.projected_scenario,
  available_units=excluded.available_units,
  max_units_per_user=excluded.max_units_per_user,
  featured=excluded.featured,
  status=excluded.status,
  updated_at=now();
