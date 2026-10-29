// Stand-ins for the backend while tools are fake. Delete once tools call Supabase.

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Items mentioning any query word; all of them when nothing matches, so the model always has something to read.
export function keywordSearch<T>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean)
  const hits = items.filter(item => {
    const text = JSON.stringify(item).toLowerCase()
    return words.some(word => text.includes(word))
  })
  return hits.length ? hits : items
}
