import path from "node:path";

export function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(
      `Expected a relative project path, received "${relativePath}".`,
    );
  }

  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = ensureTrailingSeparator(path.resolve(projectRoot));
  const normalizedResolved = ensureTrailingSeparator(resolved);

  if (
    !normalizedResolved.startsWith(normalizedRoot) &&
    resolved !== path.resolve(projectRoot)
  ) {
    throw new Error(`Path traversal is not allowed: "${relativePath}".`);
  }

  return resolved;
}

function ensureTrailingSeparator(value: string): string {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}
