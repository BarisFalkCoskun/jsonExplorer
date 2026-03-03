import { addThumbnailFields } from "utils/mongoApi";

describe("paged listing projection", () => {
  it("addThumbnailFields derives thumbnail and imageCount from projected fields", () => {
    const projectedDoc = {
      _id: "doc1",
      category: "fruit",
      dismissed: false,
      images: ["https://example.com/img1.jpg"],
      name: "apple",
      oldImages: ["https://example.com/old1.jpg"],
    };

    const result = addThumbnailFields(projectedDoc);

    expect(result).toHaveProperty("thumbnail", "https://example.com/img1.jpg");
    expect(result).toHaveProperty("imageCount", 2);
    expect(result).not.toHaveProperty("images");
    expect(result).not.toHaveProperty("oldImages");
    expect(result).toHaveProperty("_id", "doc1");
    expect(result).toHaveProperty("name", "apple");
    expect(result).toHaveProperty("category", "fruit");
  });

  it("addThumbnailFields handles docs with no images", () => {
    const projectedDoc = {
      _id: "doc2",
      name: "banana",
    };

    const result = addThumbnailFields(projectedDoc);

    expect(result.thumbnail).toBeUndefined();
    expect(result).toHaveProperty("imageCount", 0);
  });
});
