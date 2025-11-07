export const join = (...segments: string[]) => segments.filter(Boolean).join('/')
export const resolve = (...segments: string[]) => join(...segments)
export const dirname = (path: string) => path.split('/').slice(0, -1).join('/') || '/'
export const basename = (path: string) => path.split('/').pop() || ''

export default {
  join,
  resolve,
  dirname,
  basename,
}
