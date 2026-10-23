# COOPS APP

Build a full web application for automating cocoa shipments (chargements) for a cooperative.

The app must include the following modules:

====================================================
1. DATABASE MODULE — PRODUCERS & PLANTATIONS REGISTRY
====================================================

The system must allow importing an Excel file containing these columns:

- Cooperative
- Producer full name
- Producer number
- National ID number
- Producer code
- Section
- Total cocoa area
- Number of cocoa fields
- Plantation code
- Delivery potential (Kg)
- Plantation area
- Polygon latitude
- Polygon longitude

All imported data must be stored in a database.

Validation rules:
- If a row contains missing or invalid data, show an error message and reject the import.
- Plantation codes must be unique.

====================================================
2. SHIPMENT CREATION MODULE (CHARGEMENT AUTOMATION)
====================================================

The user creates a shipment by entering:

- Total requested weight (example: 43,500 kg)
- Total declared bags (example: 670)
- Optional connaissement number
- Delivery date range (start date + end date)

The system must calculate:

Average bag weight = total weight / total bags

Then automatically distribute the shipment weight across producers based on their plantation delivery potential:

Rules:
- Deduct between 0.15% and 0.20% of each producer’s remaining potential.
- Continue distributing until the requested weight is reached.
- If a producer allocation is less than 50 kg, skip that producer.
- Calculate the number of bags per producer using the average bag weight.
- Bags must be rounded, but the total number of bags must equal exactly the declared total.

Once shipment is validated:
- Save shipment data into the database
- Update each producer’s remaining delivery potential

====================================================
3. DELIVERY SHEET GENERATION
====================================================

For each producer in the shipment, generate these fields:

- Producer full name
- Receipt number
- Section
- Plantation code
- Delivery date to warehouse
- Net delivered weight (Kg)
- Number of delivered bags

Delivery dates:
- User selects a start and end date
- System assigns delivery dates chronologically across producers
- Sections must be sorted alphabetically (A–Z) before assigning dates

====================================================
4. AUTOMATIC RECEIPT NUMBER GENERATION
====================================================

Receipt numbers must be 6 digits:

000001, 000002, ...

Rules:
- First shipment of the year starts at 000001
- Receipt numbers increment automatically for each producer line
- Next shipment starts at last receipt number + 1
- System must detect the last receipt number using MAX(receipt_number) in the database

====================================================
5. EXTRA FORM FIELDS (SINGLE-CHOICE DROPDOWNS)
====================================================

Shipment form must include:

- Connaissement (optional text)
- Project: Fairtrade / Rainforest Alliance / Ordinary
- Partner: SACO, CEMOI, CARGILL, OLAM, TOUTOU, COCOASOURCE, FACTA, PURATOS + option to add new partner into database
- Zone: cooperative name
- Destination: Abidjan / San-Pedro
- Campaign: Main / Intermediate

Campaign rules:
- Campaign runs from 01/10/YYYY to 31/09/YYYY+1
Example: Campaign 2025–2026 runs from 01/10/2025 to 31/09/2026

When a new campaign starts:
- Show a message asking to update delivery potential estimations
- Do NOT block the application

====================================================
6. EXCEL EXPORT MODULE
====================================================

The system must export shipment results into an Excel file with columns:

- Connaissement
- Producer full name
- Receipt number
- Section
- Plantation code
- Delivery date
- Net delivered weight (Kg)
- Number of delivered bags
- Project
- Partner
- Zone
- Destination
- Campaign

Also include an option to export existing shipments following the official template:
"Knf-Modèle-FA.xlsx"

====================================================
7. EXPORT VALIDATION
====================================================

If a shipment export includes a producer not found in the registry:
- Reject export
- Show error message

====================================================
8. SHIPMENT CANCELLATION MODULE
====================================================

Add a button: "Cancel or Delete Shipment"

Cancellation rules:
- Cancel by connaissement number
- All producer deliveries linked to this connaissement are removed
- Cancelled weight is restored back into producer remaining potential
- Keep a history log of all cancelled connaissements

====================================================
9. DASHBOARD (HOME PAGE)
====================================================

The home page must be an analytics dashboard showing KPIs:

- Total estimated delivery potential
- Total delivered weight
- Remaining potential
- Delivered weight by project (FT / RA / Ordinary)
- Delivered weight by partner
- Delivered weight by zone
- Shipment history

====================================================
10. EXPORT OPTIONS
====================================================

Allow exporting:

- All shipments
- Shipments filtered by connaissement
- Remaining delivery potential per producer

====================================================
UI REQUIREMENTS
====================================================

- Clean modern interface
- Buttons for Details on key records
- Forms with dropdowns for single-choice fields
- Full shipment history stored and searchable

====================================================

Build this as a production-ready Lovable web app using a database backend.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://coopsapp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4dc9a2b3-3771-430d-afb9-327fc3fd5bf1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
