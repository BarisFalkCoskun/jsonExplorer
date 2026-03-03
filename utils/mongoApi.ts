import { ObjectId } from "bson";

export type MongoImage = {
  large?: string;
  medium?: string;
  small?: string;
};

export const normalizeImageUrl = (img: unknown): string => {
  if (typeof img === 'string' && img.trim().length > 0) {
    return img.trim();
  }

  if (img && typeof img === 'object') {
    const imgObj = img as MongoImage;
    return imgObj.medium || imgObj.small || imgObj.large || "";
  }

  return "";
};

export const addThumbnailFields = (doc: Record<string, unknown>): Record<string, unknown> => {
  const images = Array.isArray(doc.images) ? (doc.images as unknown[]) : [];
  const oldImages = Array.isArray(doc.oldImages) ? (doc.oldImages as unknown[]) : [];
  const allImages = [...images, ...oldImages];

  const firstUrl = allImages.length > 0 ? normalizeImageUrl(allImages[0]) : "";

  const result = { ...doc };
  result.thumbnail = firstUrl || undefined;
  result.imageCount = allImages.length;
  delete result.images;
  delete result.oldImages;

  return result;
};

export const SAFE_FILTER_OPERATORS = new Set([
  '$all', '$and', '$elemMatch', '$eq', '$exists',
  '$gt', '$gte', '$in', '$lt', '$lte',
  '$ne', '$nin', '$nor', '$not', '$options',
  '$or', '$regex', '$size', '$type',
]);

export const sanitizeFilter = (obj: unknown): void => {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith('$') && !SAFE_FILTER_OPERATORS.has(key)) {
      throw new Error(`Disallowed filter operator: ${key}`);
    }
    if (Array.isArray(value)) {
      for (const item of value) sanitizeFilter(item);
    } else if (value && typeof value === 'object') {
      sanitizeFilter(value);
    }
  }
};

export const ALLOWED_METHODS: Record<string, string[]> = {
  'collections': ['GET'],
  'databases': ['GET'],
  'document': ['DELETE', 'GET', 'PATCH', 'PUT'],
  'documents': ['GET'],
  'drop-collection': ['DELETE'],
  'drop-database': ['DELETE'],
  'images': ['GET'],
  'mkdir': ['POST'],
  'test': ['GET'],
};

export const getDocumentFilters = (documentId: string): object[] => {
  const filters: object[] = [{ _id: documentId }];

  if (ObjectId.isValid(documentId)) {
    filters.push({ _id: new ObjectId(documentId) });
  }

  filters.push({ name: documentId });

  return filters;
};
