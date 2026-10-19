// Small helpers that keep the strict TypeScript settings happy.

// Express 5 types a URL parameter as "string | string[]". We only ever expect one string.
export const paramString = (
    value: string | string[] | undefined
): string | undefined => (typeof value === "string" ? value : value?.[0]);

// The database contract expects a special timestamp type for date columns, but at runtime
// it is just an ISO date string. This returns that string typed loosely, the same way the
// existing user code already does it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const timestamp = (date: Date = new Date()): any => date.toISOString();