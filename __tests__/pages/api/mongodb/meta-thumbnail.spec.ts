import { addThumbnailFields } from "utils/mongoApi";

describe("meta thumbnail post-processing", () => {
  it("extracts thumbnail from string image URL", () => {
    const doc = { _id: "1", images: ["https://img.com/a.jpg"], name: "test" };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBe("https://img.com/a.jpg");
    expect(result.imageCount).toBe(1);
    expect(result).not.toHaveProperty("images");
    expect(result).not.toHaveProperty("oldImages");
  });

  it("extracts thumbnail from MongoImage object preferring medium", () => {
    const doc = {
      _id: "2",
      images: [{ large: "lg.jpg", medium: "md.jpg", small: "sm.jpg" }],
      name: "test",
    };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBe("md.jpg");
    expect(result.imageCount).toBe(1);
  });

  it("falls back to small then large", () => {
    const doc = { _id: "3", images: [{ large: "lg.jpg" }], name: "test" };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBe("lg.jpg");
  });

  it("returns null thumbnail when no images", () => {
    const doc = { _id: "4", name: "test" };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBeUndefined();
    expect(result.imageCount).toBe(0);
  });

  it("counts images + oldImages combined", () => {
    const doc = {
      _id: "5",
      images: ["a.jpg", "b.jpg"],
      name: "test",
      oldImages: ["c.jpg"],
    };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBe("a.jpg");
    expect(result.imageCount).toBe(3);
  });

  it("uses oldImages when images is empty", () => {
    const doc = { _id: "6", name: "test", oldImages: ["old.jpg"] };
    const result = addThumbnailFields(doc);

    expect(result.thumbnail).toBe("old.jpg");
    expect(result.imageCount).toBe(1);
  });
});
