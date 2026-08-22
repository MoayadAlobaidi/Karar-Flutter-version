/**
 * The category catalogue value types: codes plus English and Arabic labels.
 *
 * **Deterministic only. No AI, no LLM, no scoring, no confidence, no
 * ranking.** A category is either what a person chose or what a reviewed,
 * versioned, exact-match rule produced. There is no third thing, and no
 * column anywhere in this module can hold a probability — the absence is
 * structural, not a convention, because a `score` column is all it takes for
 * "probably groceries" to become "groceries" one release later.
 *
 * Both languages are required on every catalogue entry. An Arabic-first
 * market with an English-only fallback label is a product that is not
 * bilingual; making the Arabic label non-nullable means a category cannot
 * ship half-translated.
 *
 * The catalogue itself is NON_PERSONAL platform reference data (MODULE.md):
 * no tenant, no subject, no account. This file holds only its value types —
 * the rows live in `financial_categories` (migration 0092).
 *
 * Pure: no clock, no randomness, no I/O.
 */

export class InvalidCategoryError extends Error {
  override readonly name = 'InvalidCategoryError';
}

/**
 * Category codes are stable, uppercase, dotted identifiers:
 * `FOOD`, `FOOD.GROCERIES`, `TRANSPORT.FUEL`. At most three levels, because a
 * deeper tree is a taxonomy nobody maintains and every level multiplies the
 * rules that must agree.
 *
 * Codes are ASCII by design: they are identifiers that appear in rules,
 * exports, and migrations, and a localisable identifier is a broken join
 * waiting to happen. The human-visible names are the labels.
 */
const CATEGORY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}(?:\.[A-Z][A-Z0-9_]{1,31}){0,2}$/;

declare const categoryCodeBrand: unique symbol;
export type CategoryCode = string & { readonly [categoryCodeBrand]: 'CategoryCode' };

export const CategoryCode = {
  of(value: string): CategoryCode {
    if (typeof value !== 'string' || !CATEGORY_CODE_PATTERN.test(value)) {
      throw new InvalidCategoryError(
        `'${String(value)}' is not a category code (uppercase ASCII segments separated by dots, at most three levels)`,
      );
    }
    return value as CategoryCode;
  },

  /** Boundary-facing form: an unknown-shaped code from a request is expected. */
  tryOf(value: string): CategoryCode | null {
    return typeof value === 'string' && CATEGORY_CODE_PATTERN.test(value)
      ? (value as CategoryCode)
      : null;
  },

  /** The parent code, or `null` at the root. Pure string algebra, no lookup. */
  parentOf(code: CategoryCode): CategoryCode | null {
    const lastDot = code.lastIndexOf('.');
    return lastDot === -1 ? null : (code.slice(0, lastDot) as CategoryCode);
  },
};

/** English and Arabic labels — both required, neither a fallback for the other. */
export interface CategoryLabels {
  readonly en: string;
  readonly ar: string;
}

/**
 * One catalogue entry.
 *
 * `retiredAt` retires a code without deleting it: assignments already
 * referencing it stay resolvable, which is why the catalogue outlives any
 * assignment referencing it (MODULE.md retention).
 */
export interface FinancialCategory {
  readonly code: CategoryCode;
  readonly parentCode: CategoryCode | null;
  readonly labels: CategoryLabels;
  /** Catalogue version this entry belongs to; assignments record what they saw. */
  readonly catalogueVersion: string;
  readonly retiredAt: Date | null;
}

export function createFinancialCategory(fields: {
  readonly code: string;
  readonly parentCode?: string | null;
  readonly labels: CategoryLabels;
  readonly catalogueVersion: string;
  readonly retiredAt?: Date | null;
}): FinancialCategory {
  const code = CategoryCode.of(fields.code);
  const declaredParent =
    fields.parentCode === undefined || fields.parentCode === null
      ? null
      : CategoryCode.of(fields.parentCode);
  const structuralParent = CategoryCode.parentOf(code);
  if (declaredParent !== structuralParent) {
    throw new InvalidCategoryError(
      `category '${code}' declares parent '${String(declaredParent)}' but its code implies '${String(structuralParent)}'; ` +
        'the code IS the hierarchy, so a second, disagreeing statement of it can only be wrong',
    );
  }
  for (const language of ['en', 'ar'] as const) {
    const label = fields.labels[language];
    if (typeof label !== 'string' || label.trim() === '') {
      throw new InvalidCategoryError(
        `category '${code}' requires a non-empty ${language} label; a half-translated catalogue ships a language that silently degrades to another`,
      );
    }
  }
  if (typeof fields.catalogueVersion !== 'string' || fields.catalogueVersion.trim() === '') {
    throw new InvalidCategoryError(`category '${code}' requires a catalogue version`);
  }
  return Object.freeze({
    code,
    parentCode: structuralParent,
    labels: Object.freeze({ ...fields.labels }),
    catalogueVersion: fields.catalogueVersion,
    retiredAt: fields.retiredAt ?? null,
  });
}

/** A retired code may still be read; it may not be newly assigned. */
export function isAssignable(category: FinancialCategory, at: Date): boolean {
  return category.retiredAt === null || category.retiredAt.getTime() > at.getTime();
}
