🧠 RCZ Watcher

RCZ Watcher est un script Google Apps Script automatisé qui scanne les emails de ventes privées RCZ BikeShop, extrait les bons plans (deals) et les insère dans une base Supabase pour exploitation (affichage sur site web, alertes, etc.).

🚀 Fonctionnement

Le script :

Lit les emails Gmail du label rcz_nl

Analyse le contenu (titre, prix, lien, image, coupon…)

Enrichit les données avec une analyse IA (catégorie, description courte…)

Envoie les deals dans la table public.deals de Supabase

Permet une exposition publique contrôlée via un token unique par deal

🧩 Architecture du projet
```mermaid
flowchart TD
  subgraph Gmail["📧 Gmail (label: rcz_nl)"]
    A1[Emails RCZ BikeShop]
  end

  subgraph AppsScript["🧠 Google Apps Script"]
    B1[gmail.gs<br/>Lecture des emails]
    B2[parser.gs<br/>Extraction données]
    B3[ai_enrich.gs<br/>Analyse IA]
    B4[supabase.gs<br/>Insertion deals]
  end

  subgraph Supabase["🗄️ Supabase"]
    C1[(Table: public.deals)]
  end

  subgraph Output["🌍 Sortie / Exploitation"]
    D1[Site web / API publique]
    D2[Notifications / Alertes]
  end

  A1 --> B1 --> B2 --> B3 --> B4 --> C1 --> D1
  C1 --> D2
  ```
⚙️ Stack technique

Google Apps Script → moteur principal (cron + traitement)

Gmail API → lecture des newsletters

Supabase → stockage et accès sécurisé (PostgREST + RLS)

LLM (Gemini / GPT) → enrichissement des descriptions

GitHub + Clasp → versionnement du code

📦 Données stockées
Champ	Description
title	Nom du produit
url	Lien RCZ
price_current	Prix actuel
price_original	Ancien prix
coupon_code	Code promo s’il existe
image	URL image
desc_ai	Description générée par IA
category / item_type	Catégorisation
token	Clé unique publique
🔄 Automatisation

Exécution automatique quotidienne (time-driven trigger)

Synchronisation Supabase → API publique via token

Déploiement versionné sur GitHub avec Clasp
