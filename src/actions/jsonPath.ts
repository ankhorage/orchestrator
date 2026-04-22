type JsonContainer = Record<string, unknown> | unknown[];

function parseJsonPath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

export function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = parseJsonPath(path);
  let current: unknown = obj;

  for (const part of parts) {
    if (!isJsonContainer(current)) {
      return undefined;
    }
    current = getContainerValue(current, part);
  }

  return current;
}

export function hasPath(obj: Record<string, unknown>, path: string): boolean {
  const parts = parseJsonPath(path);
  let current: unknown = obj;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined || !isJsonContainer(current)) {
      return false;
    }

    if (index === parts.length - 1) {
      return hasContainerKey(current, part);
    }

    current = getContainerValue(current, part);
  }

  return false;
}

export function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
  createMissing = true,
): Record<string, unknown> {
  const parts = parseJsonPath(path);
  if (parts.length === 0) {
    return obj;
  }

  const result = { ...obj };
  let current: JsonContainer = result;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined) {
      return obj;
    }

    const isLast = index === parts.length - 1;

    if (Array.isArray(current)) {
      const arrayIndex = Number(part);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
        throw new Error(`Invalid array index: ${part}`);
      }
      if (arrayIndex > current.length) {
        throw new Error(
          `Sparse array jump disallowed at index ${arrayIndex} in path ${path}`,
        );
      }
    }

    if (isLast) {
      setContainerValue(current, part, value);
      continue;
    }

    const existing = getContainerValue(current, part);
    let next: JsonContainer;

    if (!isJsonContainer(existing)) {
      if (!createMissing) {
        throw new Error(
          `Path segment "${part}" missing and createMissing is false`,
        );
      }

      const nextPart = parts[index + 1];
      next = nextPart !== undefined && /^\d+$/.test(nextPart) ? [] : {};
    } else {
      next = cloneContainer(existing);
    }

    setContainerValue(current, part, next);
    current = next;
  }

  return result;
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (left === null || right === null) {
    return left === right;
  }

  if (typeof left !== "object") {
    return left === right;
  }

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!(key in rightRecord)) {
      return false;
    }
    if (!deepEqual(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }

  return true;
}

function isJsonContainer(value: unknown): value is JsonContainer {
  return typeof value === "object" && value !== null;
}

function cloneContainer(value: JsonContainer): JsonContainer {
  return Array.isArray(value) ? [...value] : { ...value };
}

function getContainerValue(container: JsonContainer, key: string): unknown {
  if (Array.isArray(container)) {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 ? container[index] : undefined;
  }

  return container[key];
}

function setContainerValue(
  container: JsonContainer,
  key: string,
  value: unknown,
): void {
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid array index: ${key}`);
    }
    container[index] = value;
    return;
  }

  container[key] = value;
}

function hasContainerKey(container: JsonContainer, key: string): boolean {
  if (Array.isArray(container)) {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index in container;
  }

  return key in container;
}
