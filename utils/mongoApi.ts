import { ObjectId } from "bson";

export type MongoImage = {
  large?: string;
  medium?: string;
  small?: string;
};

export type MongoImageSource = "images" | "productImages";

export const DEFAULT_MONGO_IMAGE_SOURCE: MongoImageSource = "productImages";

const PRODUCT_IMAGE_BASE_URL = "http://localhost:8100/imgs/";

export const normalizeImageUrl = (img: unknown): string => {
  if (typeof img === "string" && img.trim().length > 0) {
    return img.trim();
  }

  if (img && typeof img === "object") {
    const imgObj = img as MongoImage;
    return imgObj.medium || imgObj.small || imgObj.large || "";
  }

  return "";
};

export const normalizeProductImageUrl = (path: unknown): string => {
  if (typeof path === "string" && path.trim().length > 0) {
    return `${PRODUCT_IMAGE_BASE_URL}${path.trim().replace(/^\//, "")}`;
  }
  return "";
};

export const normalizeMongoImageSource = (
  value: unknown
): MongoImageSource =>
  value === "images" ? "images" : DEFAULT_MONGO_IMAGE_SOURCE;

export const getMongoDocumentImageUrls = (
  doc: Record<string, unknown>,
  imageSource: MongoImageSource = DEFAULT_MONGO_IMAGE_SOURCE
): string[] => {
  const images = Array.isArray(doc.images) ? (doc.images as unknown[]) : [];
  const oldImages = Array.isArray(doc.oldImages)
    ? (doc.oldImages as unknown[])
    : [];

  if (imageSource === "images") {
    return [...images, ...oldImages]
      .map((img) => normalizeImageUrl(img))
      .filter((url): url is string => url.length > 0);
  }

  const productImages = Array.isArray(doc.productImages)
    ? (doc.productImages as unknown[])
    : undefined;

  if (productImages === undefined) {
    return [...images, ...oldImages]
      .map((img) => normalizeImageUrl(img))
      .filter((url): url is string => url.length > 0);
  }

  return productImages
    .map((path) => normalizeProductImageUrl(path))
    .filter((url): url is string => url.length > 0);
};

export const addThumbnailFields = (
  doc: Record<string, unknown>,
  imageSource: MongoImageSource = DEFAULT_MONGO_IMAGE_SOURCE
): Record<string, unknown> => {
  const imageUrls = getMongoDocumentImageUrls(doc, imageSource);

  const result = { ...doc };
  delete result.__sortId;
  delete result.__sortLabel;
  result.thumbnail = imageUrls[0] || undefined;
  result.imageCount = imageUrls.length;
  delete result.productImages;
  delete result.images;
  delete result.oldImages;

  return result;
};

export const LISTING_PROJECTION = {
  _id: 1,
  category: 1,
  dismissed: 1,
  images: 1,
  name: 1,
  oldImages: 1,
  productImages: 1,
  substituteGroup: 1,
  title: 1,
};

const nonEmptyStringField = (fieldPath: string): Record<string, unknown> => ({
  $let: {
    in: {
      $cond: [
        {
          $and: [
            { $eq: [{ $type: "$$value" }, "string"] },
            {
              $gt: [{ $strLenCP: { $trim: { input: "$$value" } } }, 0],
            },
          ],
        },
        "$$value",
        // eslint-disable-next-line unicorn/no-null -- Mongo aggregation null sentinel
        null,
      ],
    },
    vars: { value: fieldPath },
  },
});

export const PREFERRED_DOCUMENT_LABEL_AGGREGATION = {
  $ifNull: [
    nonEmptyStringField("$name"),
    {
      $ifNull: [nonEmptyStringField("$title"), { $toString: "$_id" }],
    },
  ],
};

export const SAFE_FILTER_OPERATORS = new Set([
  "$all",
  "$and",
  "$elemMatch",
  "$eq",
  "$exists",
  "$gt",
  "$gte",
  "$in",
  "$lt",
  "$lte",
  "$ne",
  "$nin",
  "$nor",
  "$not",
  "$options",
  "$or",
  "$regex",
  "$size",
  "$type",
]);

export const sanitizeFilter = (obj: unknown): void => {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith("$") && !SAFE_FILTER_OPERATORS.has(key)) {
      throw new Error(`Disallowed filter operator: ${key}`);
    }
    if (Array.isArray(value)) {
      for (const item of value) sanitizeFilter(item);
    } else if (value && typeof value === "object") {
      sanitizeFilter(value);
    }
  }
};

export const ALLOWED_METHODS: Record<string, string[]> = {
  collections: ["GET"],
  databases: ["GET"],
  document: ["DELETE", "GET", "PATCH", "PUT"],
  documents: ["GET"],
  "drop-collection": ["DELETE"],
  "drop-database": ["DELETE"],
  images: ["GET"],
  mkdir: ["POST"],
  test: ["GET"],
};

export const getDocumentFilters = (documentId: string): object[] => {
  const filters: object[] = [{ _id: documentId }];

  if (ObjectId.isValid(documentId)) {
    filters.push({ _id: new ObjectId(documentId) });
  }

  filters.push({ name: documentId });

  return filters;
};
