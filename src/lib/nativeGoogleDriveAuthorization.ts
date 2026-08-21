import { registerPlugin } from '@capacitor/core'

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export interface NativeGoogleDriveToken {
  accessToken: string
  expiresIn: number
  grantedScopes: string[]
}

interface GoogleDriveAuthorizationPlugin {
  authorize(): Promise<NativeGoogleDriveToken>
  clearToken(options: { accessToken: string }): Promise<void>
}

let googleDriveAuthorization: GoogleDriveAuthorizationPlugin | null = null

function getGoogleDriveAuthorization(): GoogleDriveAuthorizationPlugin {
  googleDriveAuthorization ??= registerPlugin<GoogleDriveAuthorizationPlugin>(
    'GoogleDriveAuthorization',
  )
  return googleDriveAuthorization
}

export async function authorizeGoogleDriveOnAndroid(): Promise<NativeGoogleDriveToken> {
  const result = await getGoogleDriveAuthorization().authorize()
  if (!result.accessToken) {
    throw new Error('Google Drive authorization did not return an access token.')
  }
  if (
    !Array.isArray(result.grantedScopes)
    || result.grantedScopes.length !== 1
    || result.grantedScopes[0] !== GOOGLE_DRIVE_FILE_SCOPE
  ) {
    throw new Error('Google Drive authorization returned an unexpected scope grant.')
  }
  if (!Number.isFinite(result.expiresIn) || result.expiresIn <= 0) {
    throw new Error('Google Drive authorization returned an invalid token lifetime.')
  }
  return result
}

export async function clearGoogleDriveTokenOnAndroid(accessToken: string): Promise<void> {
  await getGoogleDriveAuthorization().clearToken({ accessToken })
}
