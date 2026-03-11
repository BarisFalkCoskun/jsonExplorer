import { addThumbnailFields } from "utils/mongoApi";

describe("paged listing projection", () => {
  it("uses productImages as primary source with localhost prefix", () => {
    const doc = {
      _id: "doc1",
      images: ["https://example.com/should-not-use.jpg"],
      name: "apple",
      productImages: ["beepr/abc123.jpg"],
    };

    const result = addThumbnailFields(doc);

    expect(result).toHaveProperty("thumbnail", "http://localhost:8100/imgs/beepr/abc123.jpg");
    expect(result).toHaveProperty("imageCount", 1);
    expect(result).not.toHaveProperty("productImages");
    expect(result).not.toHaveProperty("images");
  });

  it("falls back to images/oldImages when productImages field is absent", () => {
    const doc = {
      _id: "doc2",
      images: ["https://example.com/img1.jpg"],
      name: "banana",
      oldImages: ["https://example.com/old1.jpg"],
    };

    const result = addThumbnailFields(doc);

    expect(result).toHaveProperty("thumbnail", "https://example.com/img1.jpg");
    expect(result).toHaveProperty("imageCount", 2);
    expect(result).not.toHaveProperty("images");
    expect(result).not.toHaveProperty("oldImages");
  });

  it("treats empty productImages array as no images", () => {
    const doc = {
      _id: "doc3",
      images: ["https://example.com/should-not-use.jpg"],
      name: "cherry",
      productImages: [],
    };

    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBeUndefined();
    expect(result).toHaveProperty("imageCount", 0);
  });

  it("handles docs with no image fields at all", () => {
    const doc = {
      _id: "doc4",
      name: "date",
    };

    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBeUndefined();
    expect(result).toHaveProperty("imageCount", 0);
  });
});
