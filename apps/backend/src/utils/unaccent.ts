/**
 * Vietnamese accent-insensitive search utilities.
 *
 * Uses PostgreSQL `unaccent` extension to strip diacritical marks so that
 * searching "goi" matches "gỏi", "Gỏi Cuốn", etc.
 *
 * Because Prisma's `contains` filter doesn't support `unaccent()`,
 * we use raw SQL queries for search, then hydrate via Prisma includes.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Remove Vietnamese diacritics in JS (for client-side filtering / fallback).
 * Normalises to NFD, strips combining marks, and maps đ/Đ → d/D.
 */
export function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Escape SQL LIKE wildcards in user input.
 */
function escapeLike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// ── Product search ──────────────────────────────────────────────────────

export async function searchProducts(opts: {
  search?: string;
  categoryId?: string;
  page: number;
  size: number;
}) {
  const { search, categoryId, page, size } = opts;
  const offset = (page - 1) * size;

  if (!search) {
    const where: Prisma.ProductWhereInput = {};
    if (categoryId) where.categoryId = categoryId;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, unit: true, bundleUnit: true, parentProduct: { select: { id: true, code: true, name: true, unit: true, currentStock: true } }, variants: { include: { bundleUnit: true } } },
        skip: offset,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    return { items, total, page, size };
  }

  const like = `%${escapeLike(search)}%`;

  // Use parameterised category filter
  const categoryIdParam = categoryId ?? null;

  const items = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    WHERE (
      unaccent(p.code) ILIKE unaccent(${like})
      OR unaccent(p.name) ILIKE unaccent(${like})
    )
    AND (${categoryIdParam}::uuid IS NULL OR p."categoryId" = ${categoryIdParam}::uuid)
    ORDER BY p."createdAt" DESC
    LIMIT ${size} OFFSET ${offset}
  `;

  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM products p
    WHERE (
      unaccent(p.code) ILIKE unaccent(${like})
      OR unaccent(p.name) ILIKE unaccent(${like})
    )
    AND (${categoryIdParam}::uuid IS NULL OR p."categoryId" = ${categoryIdParam}::uuid)
  `;
  const total = Number(countResult[0].count);

  const ids = items.map((i) => i.id);
  if (ids.length === 0) return { items: [], total, page, size };

  const fullItems = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { category: true, unit: true, bundleUnit: true, parentProduct: { select: { id: true, code: true, name: true, unit: true, currentStock: true } }, variants: { include: { bundleUnit: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return { items: fullItems, total, page, size };
}

// ── Customer search ─────────────────────────────────────────────────────

export async function searchCustomers(opts: {
  search?: string;
  page: number;
  size: number;
}) {
  const { search, page, size } = opts;
  const offset = (page - 1) * size;

  if (!search) {
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        include: { group: true },
        skip: offset,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count(),
    ]);
    return { items, total, page, size };
  }

  const like = `%${escapeLike(search)}%`;

  const items = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id
    FROM customers c
    WHERE (
      unaccent(c.code) ILIKE unaccent(${like})
      OR unaccent(c."fullName") ILIKE unaccent(${like})
      OR c.phone ILIKE ${like}
    )
    ORDER BY c."createdAt" DESC
    LIMIT ${size} OFFSET ${offset}
  `;

  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM customers c
    WHERE (
      unaccent(c.code) ILIKE unaccent(${like})
      OR unaccent(c."fullName") ILIKE unaccent(${like})
      OR c.phone ILIKE ${like}
    )
  `;
  const total = Number(countResult[0].count);

  const ids = items.map((i) => i.id);
  if (ids.length === 0) return { items: [], total, page, size };

  const fullItems = await prisma.customer.findMany({
    where: { id: { in: ids } },
    include: { group: true },
    orderBy: { createdAt: 'desc' },
  });

  return { items: fullItems, total, page, size };
}