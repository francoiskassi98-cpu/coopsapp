/**
 * Source unique des règles de mot de passe.
 * Ces règles reflètent STRICTEMENT la configuration réelle de l'authentification
 * du backend : longueur minimale de 6 caractères, aucune exigence de type de
 * caractère, et vérification des fuites de données (HIBP) côté serveur.
 *
 * Toute modification de la configuration backend doit être répercutée ici,
 * et nulle part ailleurs.
 */

export const PASSWORD_MIN_LENGTH = 6;

/** Exigences de caractères réellement imposées par le backend (aucune actuellement). */
export const PASSWORD_REQUIRED_CHARACTERS = {
  uppercase: false,
  lowercase: false,
  digit: false,
  special: false,
} as const;

/** Vérification des mots de passe compromis (HIBP), appliquée côté serveur. */
export const PASSWORD_HIBP_ENABLED = true;

export interface PasswordRule {
  id: string;
  label: string;
  /** Règle vérifiable côté client (sinon informative uniquement). */
  test?: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  ...(PASSWORD_REQUIRED_CHARACTERS.uppercase
    ? [{ id: "uppercase", label: "Une lettre majuscule", test: (v: string) => /[A-Z]/.test(v) }]
    : []),
  ...(PASSWORD_REQUIRED_CHARACTERS.lowercase
    ? [{ id: "lowercase", label: "Une lettre minuscule", test: (v: string) => /[a-z]/.test(v) }]
    : []),
  ...(PASSWORD_REQUIRED_CHARACTERS.digit
    ? [{ id: "digit", label: "Un chiffre", test: (v: string) => /\d/.test(v) }]
    : []),
  ...(PASSWORD_REQUIRED_CHARACTERS.special
    ? [{ id: "special", label: "Un caractère spécial", test: (v: string) => /[^A-Za-z0-9]/.test(v) }]
    : []),
  ...(PASSWORD_HIBP_ENABLED
    ? [{ id: "hibp", label: "Ne pas figurer dans une fuite de données connue (vérifié à l'enregistrement)" }]
    : []),
];

export interface PasswordRuleState extends PasswordRule {
  /** `null` lorsque la règle ne peut être évaluée que côté serveur. */
  valid: boolean | null;
}

export function evaluatePassword(value: string): PasswordRuleState[] {
  return PASSWORD_RULES.map((rule) => ({
    ...rule,
    valid: rule.test ? rule.test(value) : null,
  }));
}

/** Vrai lorsque toutes les règles vérifiables côté client sont respectées. */
export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => (rule.test ? rule.test(value) : true));
}

/** Message affiché lorsque le serveur refuse un mot de passe. */
export const PASSWORD_REJECTED_MESSAGE =
  "Mot de passe non conforme. Vérifiez les règles affichées sous le champ.";
