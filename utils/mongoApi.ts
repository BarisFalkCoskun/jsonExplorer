import { ObjectId } from "bson";

export type MongoImage = {
  large?: string;
  medium?: string;
  small?: string;
};

const PRODUCT_IMAGE_BASE_URL = "http://localhost:8100/imgs/";

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

export const normalizeProductImageUrl = (path: unknown): string => {
  if (typeof path === 'string' && path.trim().length > 0) {
    return `${PRODUCT_IMAGE_BASE_URL}${path.trim()}`;
  }
  return "";
};

export const addThumbnailFields = (doc: Record<string, unknown>): Record<string, unknown> => {
  const productImages = Array.isArray(doc.productImages) ? (doc.productImages as unknown[]) : undefined;

  let firstUrl: string;
  let imageCount: number;

  if (productImages === undefined) {
    // Fallback: use images/oldImages
    const images = Array.isArray(doc.images) ? (doc.images as unknown[]) : [];
    const oldImages = Array.isArray(doc.oldImages) ? (doc.oldImages as unknown[]) : [];
    const allImages = [...images, ...oldImages];
    firstUrl = allImages.length > 0 ? normalizeImageUrl(allImages[0]) : "";
    imageCount = allImages.length;
  } else {
    // productImages exists: use it as primary source (empty array = no images)
    firstUrl = productImages.length > 0 ? normalizeProductImageUrl(productImages[0]) : "";
    imageCount = productImages.length;
  }

  const result = { ...doc };
  result.thumbnail = firstUrl || undefined;
  result.imageCount = imageCount;
  delete result.productImages;
  delete result.images;
  delete result.oldImages;

  return result;
};

export const LISTING_PROJECTION = {
  _id: 1,
  category: 1,
  dismissed: 1,
  images: { $slice: 1 },
  name: 1,
  oldImages: { $slice: 1 },
  productImages: { $slice: 1 },
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
