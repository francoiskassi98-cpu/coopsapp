import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://coopsapp.lovable.app";
const SITE_NAME = "COOPS APP";

type Meta = { title: string; description: string };

const ROUTES: Record<string, Meta> = {
  "/": {
    title: "Tableau de bord — COOPS APP",
    description:
      "Suivez en temps réel les volumes livrés, le potentiel restant et la performance de vos registres de coopérative cacao.",
  },
  "/producteurs": {
    title: "Producteurs & primes — COOPS APP",
    description:
      "Gérez le fichier producteurs, consultez les analyses de campagne et calculez les primes par volume livré.",
  },
  "/chargements": {
    title: "Chargements & traçabilité — COOPS APP",
    description:
      "Créez et distribuez vos chargements de cacao, contrôlez les poids des sacs et éditez les fiches de traçabilité Excel.",
  },
  "/export": {
    title: "Exports Excel — COOPS APP",
    description:
      "Exportez producteurs, livraisons et chargements de la campagne au format Excel pour vos rapports et audits.",
  },
  "/partenaires": {
    title: "Partenaires — COOPS APP",
    description:
      "Référencez acheteurs, exportateurs et partenaires techniques associés à votre coopérative et à vos chargements.",
  },
  "/gestion": {
    title: "Gestion du projet — COOPS APP",
    description:
      "Administrez utilisateurs, registres, rôles et paramètres de votre coopérative depuis un espace unique.",
  },
  "/audit": {
    title: "Journal d'audit — COOPS APP",
    description:
      "Consultez l'historique complet des actions réalisées sur les producteurs, chargements et comptes utilisateurs.",
  },
  "/auth": {
    title: "Connexion — COOPS APP",
    description:
      "Accédez à votre espace coopérative pour piloter les livraisons de cacao, les producteurs et la traçabilité.",
  },
};

const DEFAULT: Meta = {
  title: "COOPS APP — Gestion des chargements de cacao",
  description:
    "Plateforme de gestion des livraisons, des producteurs et de la traçabilité des coopératives de cacao : chargements, primes et exports.",
};

export default function RouteSeo() {
  const { pathname } = useLocation();
  const meta = ROUTES[pathname] ?? DEFAULT;
  const canonical = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
}
