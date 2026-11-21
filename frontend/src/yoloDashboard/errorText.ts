export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
