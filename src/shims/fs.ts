const notAvailable = () => {
  throw new Error('fs is not available in the browser environment')
}

export const readFileSync = notAvailable
export const writeFileSync = notAvailable
export const existsSync = () => false
export const mkdirSync = notAvailable
export const statSync = () => ({})

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
}
