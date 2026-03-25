type DisplayableMongoDocument = {
  _id?: unknown;
  name?: unknown;
  title?: unknown;
};

const getNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : undefined;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.toString === "function"
  ) {
    const stringValue = String(value);

    return stringValue && stringValue !== "[object Object]"
      ? stringValue
      : undefined;
  }

  return undefined;
};

export const getPreferredMongoDocumentLabel = (
  document: DisplayableMongoDocument
): string =>
  getNonEmptyString(document.name) ??
  getNonEmptyString(document.title) ??
  getNonEmptyString(document._id) ??
  "unnamed";
