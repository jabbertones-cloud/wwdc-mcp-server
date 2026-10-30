/**
 * Shared DocC availability parsing (TL-194).
 *
 * One parser for platform availability, used by BOTH the base docs ingest
 * (which fetches the DocC JSON anyway) and the deprecation backfill (the
 * repair path for already-indexed rows). Before TL-194 this logic lived
 * only in the backfill, and the backfill's queue could never select a
 * real row — so structured deprecation data was never populated at all.
 */

export type PlatformAvailability = {
  name?: string;
  introducedAt?: string;
  deprecatedAt?: string;
  message?: string;
  /** DocC top-level platforms use isDeprecated; metadata.platforms use deprecated */
  isDeprecated?: boolean;
  deprecated?: boolean;
  unavailable?: boolean;
  beta?: boolean;
};

export type DeprecationSummaryNode = {
  type?: string;
  text?: string;
  /** reference nodes carry no text — the target lives in the identifier */
  identifier?: string;
  /** codeVoice nodes carry their text in `code` */
  code?: string;
  inlineContent?: DeprecationSummaryNode[];
};

/** The DocC shapes the parser reads, in either storage position. */
export type AvailabilitySource = {
  deprecated?: boolean;
  platforms?: PlatformAvailability[];
  deprecationSummary?: { inlineContent?: DeprecationSummaryNode[] }[];
  metadata?: {
    platforms?: PlatformAvailability[];
  };
};

export interface Availability {
  deprecated: boolean;
  introducedAt: string | null;
  deprecatedAt: string | null;
  deprecatedMessage: string | null;
}

function extractInlineText(nodes: DeprecationSummaryNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text" && typeof n.text === "string") return n.text;
      if (n.type === "codeVoice" && typeof n.code === "string") return n.code;
      if (n.type === "reference" && typeof n.identifier === "string") {
        // A DocC reference names its target only by identifier, e.g.
        // "doc://com.apple.uikit/documentation/UIKit/UIGraphicsImageRenderer".
        // The display name is the last path segment. Dropping these nodes
        // produced messages like "Use  instead." — the replacement symbol
        // silently vanished (found in the first TL-194 corpus rebuild).
        const segment = n.identifier.split("/").filter(Boolean).pop() ?? "";
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      }
      if (n.inlineContent) return extractInlineText(n.inlineContent);
      return "";
    })
    .join("")
    .trim();
}

/** Numeric dotted-version comparison ("2.0" < "13.1" < "27.0"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function versionMin(values: string[]): string | null {
  if (!values.length) return null;
  return values.reduce((min, v) => (compareVersions(v, min) < 0 ? v : min));
}

export function parseAvailability(doc: AvailabilitySource): Availability {
  // DocC JSON stores platform availability under metadata.platforms, not top-level
  const platforms = doc.metadata?.platforms ?? doc.platforms ?? [];
  const deprecated =
    doc.deprecated === true ||
    platforms.some(
      (p) => p.isDeprecated || p.deprecated === true || Boolean(p.deprecatedAt),
    );

  const introducedAt = versionMin(
    platforms.map((p) => p.introducedAt).filter((v): v is string => Boolean(v)),
  );
  const deprecatedAt = versionMin(
    platforms.map((p) => p.deprecatedAt).filter((v): v is string => Boolean(v)),
  );

  // Deprecation message: try deprecationSummary first, then a platform message
  let deprecatedMessage: string | null = null;
  const summary = doc.deprecationSummary?.[0];
  if (summary?.inlineContent) {
    deprecatedMessage = extractInlineText(summary.inlineContent) || null;
  }
  if (!deprecatedMessage) {
    deprecatedMessage = platforms.find((p) => p.message)?.message ?? null;
  }

  return { deprecated, introducedAt, deprecatedAt, deprecatedMessage };
}

/**
 * DocC symbol titles carry their signature: "UIGraphicsBeginImageContext(_:)".
 * The bare symbol name is the title with a trailing parenthesised group
 * removed. Lookups by bare name must match signature-bearing rows (TL-194).
 */
export function bareSymbolName(title: string): string {
  return title.replace(/\s*\([^()]*\)\s*$/, "").trim();
}
