# WebRosa

Painel de triagem com revisão médica (protótipo acadêmico, não faz diagnóstico).
Feito só com HTML, CSS, JavaScript e Node.

## Como abrir o site

Dê duplo clique no index.html (precisa de internet para carregar o Chart.js).

## Como gerar os dados de novo (opcional)

Precisa do Node instalado. Na pasta do projeto:

    node gerar-dados.js

O script lê breast-cancer-wisconsin.csv, treina o modelo em JavaScript e gera
dados.js, dados.json, casos_seed.js e casos_seed.json.

## Back4App

Preencha APP_ID e REST_KEY no config.js com as chaves do app criado só para este projeto.

## Arquivos

- index.html, style.css: página e visual
- app.js, dados.js: os 3 gráficos do dashboard (dados reais agregados)
- crud.js, config.js, casos_seed.js: fila de revisão (CRUD no Back4App) e API do IBGE
- gerar-dados.js, breast-cancer-wisconsin.csv, package.json: preparação dos dados com Node
- dados.json, casos_seed.json: os mesmos dados em JSON

## Fonte dos dados

Breast Cancer Wisconsin (Diagnostic), UCI Machine Learning Repository (licença CC BY 4.0).
O modelo usa medidas de células e não analisa imagens de mamografia ou ultrassom.
