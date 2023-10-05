export function elementsEqual<T>(a: T[], b: T[]): boolean {
  const [as, bs] = [new Set(a), new Set(b)]

  return as.size === bs.size && a.every((x) => bs.has(x))
}
