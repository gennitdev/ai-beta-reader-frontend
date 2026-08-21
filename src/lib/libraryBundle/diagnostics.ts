export type BundleDiagnosticSeverity = 'error' | 'warning'

export interface BundleDiagnostic {
  severity: BundleDiagnosticSeverity
  code: string
  message: string
  path?: string
  entityType?: string
  entityId?: string
}

export function bundleError(
  code: string,
  message: string,
  details: Omit<BundleDiagnostic, 'severity' | 'code' | 'message'> = {},
): BundleDiagnostic {
  return { severity: 'error', code, message, ...details }
}

export function bundleWarning(
  code: string,
  message: string,
  details: Omit<BundleDiagnostic, 'severity' | 'code' | 'message'> = {},
): BundleDiagnostic {
  return { severity: 'warning', code, message, ...details }
}

export function hasBundleErrors(diagnostics: readonly BundleDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}
