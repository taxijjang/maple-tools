/** R2Bucket을 흉내 내는 인메모리 가짜 구현. get/put/list만 우리가 쓰는 만큼 구현한다. */
export function fakeR2() {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) {
      const v = store.get(key)
      if (v === undefined) return null
      return { json: async () => JSON.parse(v) } as any
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}) {
      const keys = [...store.keys()].filter(k => !prefix || k.startsWith(prefix)).sort()
      return { objects: keys.map(key => ({ key })), truncated: false, cursor: undefined as any }
    },
  }
}
