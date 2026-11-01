// =============================================================================
// S@FE — Rapport d'audit PDF (côté serveur)
// =============================================================================
// Le CRM génère ses PDF dans le navigateur avec jsPDF. Ici le PDF est produit
// côté serveur avec pdf-lib (déjà dans l'import map), pour deux raisons :
//   * l'audit est FIGÉ à la soumission : le PDF doit correspondre exactement à
//     l'instantané enregistré, pas à ce qu'un navigateur veut bien dessiner ;
//   * il est déposé dans un bucket privé et envoyé par e-mail sans que le
//     client ait à rester sur la page.
//
// Charte reprise du rapport cyber du CRM : bandeau bleu nuit, pastille de score,
// synthèse par catégorie, détail, puis plan d'action.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ItemReferentiel, Recommandation } from "./scoring-audit.ts";

const NAVY = rgb(13 / 255, 27 / 255, 54 / 255);
const BLANC = rgb(1, 1, 1);
const GRIS = rgb(100 / 255, 116 / 255, 139 / 255);
const GRIS_CLAIR = rgb(226 / 255, 232 / 255, 240 / 255);
const ARDOISE = rgb(51 / 255, 65 / 255, 85 / 255);
const VERT = rgb(22 / 255, 163 / 255, 74 / 255);
const ORANGE = rgb(217 / 255, 119 / 255, 6 / 255);
const ROUGE = rgb(220 / 255, 38 / 255, 38 / 255);

const A4 = { l: 595.28, h: 841.89 };
const MARGE = 40;

/**
 * pdf-lib encode en WinAnsi avec les polices standard : tout caractère hors de
 * ce jeu fait échouer la génération. On remplace les quelques symboles que nos
 * référentiels utilisent (et on retire les émojis, réservés à l'écran).
 */
export function assainir(s: string): string {
  return String(s ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, "")
    .replace(/≥/g, ">=").replace(/≤/g, "<=")
    .replace(/→/g, "->").replace(/…/g, "...")
    .replace(/ | /g, " ")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .trim();
}

function couleurScore(score: number) {
  return score >= 80 ? VERT : score >= 50 ? ORANGE : ROUGE;
}

/** Découpe un texte pour qu'il tienne dans une largeur donnée. */
function lignes(texte: string, font: PDFFont, taille: number, largeur: number): string[] {
  const mots = assainir(texte).split(/\s+/);
  const out: string[] = [];
  let courante = "";
  for (const mot of mots) {
    const essai = courante ? courante + " " + mot : mot;
    if (font.widthOfTextAtSize(essai, taille) > largeur && courante) {
      out.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante) out.push(courante);
  return out.length ? out : [""];
}

export interface DonneesRapport {
  titreAudit: string;
  clientNom: string;
  domaine?: string | null;
  score: number;
  libelleRisque: string;
  catScores: Record<string, number>;
  poids: Record<string, number>;
  labelsCat: Record<string, string>;
  items: ItemReferentiel[];
  reponses: Record<string, string>;
  recommandations: Recommandation[];
  dateRapport: string;
}

const LIBELLE_STATUT: Record<string, string> = {
  conforme: "En place",
  partiel: "Partiel",
  non_conforme: "A traiter",
  na: "Non concerne",
  non_verifie: "Sans reponse",
};

export async function genererRapportPdf(d: DonneesRapport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(assainir(`S@FE - ${d.titreAudit} - ${d.clientNom}`));
  pdf.setProducer("S@FE Digitalisation");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page: PDFPage = pdf.addPage([A4.l, A4.h]);
  let y = A4.h;
  const largeur = A4.l - 2 * MARGE;

  const texte = (s: string, x: number, yy: number, taille: number, font: PDFFont, color = ARDOISE) =>
    page.drawText(assainir(s), { x, y: yy, size: taille, font, color });

  const nouvellePage = (reserve = 80) => {
    if (y > reserve) return;
    page = pdf.addPage([A4.l, A4.h]);
    y = A4.h - MARGE;
  };

  // ── Bandeau ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: A4.h - 110, width: A4.l, height: 110, color: NAVY });
  texte("S@FE", MARGE, A4.h - 45, 22, gras, BLANC);
  texte(d.titreAudit, MARGE, A4.h - 68, 14, gras, BLANC);
  texte(`${d.clientNom}${d.domaine ? "  -  " + d.domaine : ""}`, MARGE, A4.h - 86, 9.5, normal, GRIS_CLAIR);
  texte(`Audit realise en autonomie le ${d.dateRapport}`, MARGE, A4.h - 100, 8.5, normal, GRIS_CLAIR);

  page.drawRectangle({
    x: A4.l - MARGE - 110, y: A4.h - 92, width: 110, height: 62,
    color: rgb(30 / 255, 41 / 255, 59 / 255),
  });
  const sTxt = `${d.score}%`;
  texte(sTxt, A4.l - MARGE - 110 + (110 - gras.widthOfTextAtSize(sTxt, 26)) / 2, A4.h - 62, 26, gras, couleurScore(d.score));
  const rTxt = d.libelleRisque;
  texte(rTxt, A4.l - MARGE - 110 + (110 - normal.widthOfTextAtSize(assainir(rTxt), 8)) / 2, A4.h - 82, 8, normal, GRIS_CLAIR);

  y = A4.h - 140;

  // ── Synthèse par catégorie ───────────────────────────────────────────────
  texte("Synthese par theme", MARGE, y, 11, gras, NAVY);
  y -= 18;

  for (const [cle, label] of Object.entries(d.labelsCat)) {
    nouvellePage(100);
    const s = d.catScores[cle] ?? 0;
    const poids = Math.round((d.poids[cle] ?? 0) * 100);
    texte(`${label} (${poids}% du score)`, MARGE, y, 9, normal);
    const bx = MARGE + 300, bw = 150;
    page.drawRectangle({ x: bx, y: y - 1, width: bw, height: 5, color: GRIS_CLAIR });
    page.drawRectangle({ x: bx, y: y - 1, width: (bw * s) / 100, height: 5, color: couleurScore(s) });
    texte(`${s}%`, bx + bw + 8, y, 9, gras, couleurScore(s));
    y -= 16;
  }

  y -= 10;

  // ── Détail des points ────────────────────────────────────────────────────
  let catCourante = "";
  for (const item of d.items) {
    if (item.categorie !== catCourante) {
      nouvellePage(120);
      catCourante = item.categorie;
      page.drawRectangle({ x: MARGE, y: y - 4, width: largeur, height: 18, color: NAVY });
      texte(
        `${d.labelsCat[item.categorie] ?? item.categorie}  -  ${d.catScores[item.categorie] ?? 0}%`,
        MARGE + 8, y + 1, 9.5, gras, BLANC,
      );
      y -= 28;
    }

    nouvellePage(90);
    const statut = d.reponses[item.item_key] || "non_verifie";
    const couleur = statut === "conforme" ? VERT
      : statut === "partiel" ? ORANGE
      : statut === "non_conforme" ? ROUGE : GRIS;

    const ls = lignes(item.libelle_technique, normal, 8.5, largeur - 110);
    ls.forEach((l, i) => texte(l, MARGE + 4, y - i * 11, 8.5, normal));
    texte(LIBELLE_STATUT[statut] ?? statut, A4.l - MARGE - 80, y, 8.5, gras, couleur);
    y -= ls.length * 11 + 6;
  }

  // ── Plan d'action ────────────────────────────────────────────────────────
  if (d.recommandations.length) {
    nouvellePage(160);
    y -= 12;
    page.drawRectangle({ x: MARGE, y: y - 4, width: largeur, height: 20, color: NAVY });
    texte("Ce qu'il faut faire, dans l'ordre", MARGE + 8, y + 2, 10.5, gras, BLANC);
    y -= 30;

    const urgence: Record<string, string> = {
      critique: "A faire tout de suite",
      haute: "A faire rapidement",
      normale: "A planifier",
      basse: "Quand vous pourrez",
    };

    d.recommandations.forEach((r, i) => {
      nouvellePage(90);
      const couleur = r.priorite === "critique" ? ROUGE : r.priorite === "haute" ? ORANGE : GRIS;
      texte(`${i + 1}.`, MARGE + 2, y, 9, gras, couleur);
      const ls = lignes(r.titre, gras, 9, largeur - 130);
      ls.forEach((l, j) => texte(l, MARGE + 20, y - j * 11, 9, gras));
      texte(urgence[r.priorite] ?? r.priorite, A4.l - MARGE - 100, y, 8, normal, couleur);
      y -= ls.length * 11 + 10;
    });
  }

  // ── Mentions et pieds de page ────────────────────────────────────────────
  nouvellePage(120);
  y -= 10;
  const mention =
    "Ce rapport reprend vos declarations au jour de l'audit. Il ne constitue pas un audit technique " +
    "contractuel : un consultant S@FE peut completer et valider chaque point avec vous. " +
    "Vos reponses et ce rapport sont conserves dans votre espace client, heberges dans l'Union europeenne. " +
    "Si vous ne devenez pas client, ils sont supprimes au bout d'un an.";
  lignes(mention, italique, 7.5, largeur).forEach((l, i) => texte(l, MARGE, y - i * 10, 7.5, italique, GRIS));

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(assainir("S@FE Digitalisation - Document confidentiel"), {
      x: MARGE, y: 24, size: 7, font: normal, color: GRIS,
    });
    const n = `Page ${i + 1}/${pages.length}`;
    p.drawText(n, { x: A4.l - MARGE - normal.widthOfTextAtSize(n, 7), y: 24, size: 7, font: normal, color: GRIS });
  });

  return await pdf.save();
}

/** Encode un PDF en base64, pour la pièce jointe Brevo. */
export function base64(octets: Uint8Array): string {
  let bin = "";
  const pas = 0x8000;
  for (let i = 0; i < octets.length; i += pas) {
    bin += String.fromCharCode(...octets.subarray(i, i + pas));
  }
  return btoa(bin);
}
