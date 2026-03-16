import { calculateVirtualGrid } from "components/system/Files/FileManager/useVirtualGrid";
import { calculateVirtualRows } from "components/system/Files/FileManager/useVirtualRows";

describe("calculateVirtualRows", () => {
  it("returns the full range when virtualization is disabled", () => {
    expect(
      calculateVirtualRows({
        enabled: false,
        itemCount: 10,
        rowHeight: 24,
        scrollTop: 0,
        viewportHeight: 120,
      })
    ).toEqual({
      bottomOffset: 0,
      endIndex: 9,
      startIndex: 0,
      topOffset: 0,
    });
  });

  it("calculates start, end, and spacer offsets with overscan", () => {
    expect(
      calculateVirtualRows({
        enabled: true,
        itemCount: 1000,
        overscan: 2,
        rowHeight: 20,
        scrollTop: 400,
        viewportHeight: 100,
      })
    ).toEqual({
      bottomOffset: (1000 - 27) * 20,
      endIndex: 26,
      startIndex: 18,
      topOffset: 360,
    });
  });
});

describe("calculateVirtualGrid", () => {
  it("returns the full range when virtualization is disabled", () => {
    expect(
      calculateVirtualGrid({
        columnGap: 1,
        enabled: false,
        itemCount: 12,
        itemHeight: 70,
        itemWidth: 74,
        rowGap: 28,
        scrollTop: 0,
        viewportHeight: 200,
        viewportWidth: 250,
      })
    ).toEqual({
      columnCount: 1,
      endIndex: 11,
      startIndex: 0,
      totalHeight: 0,
    });
  });

  it("calculates a bounded visible grid slice and total scroll height", () => {
    expect(
      calculateVirtualGrid({
        columnGap: 1,
        enabled: true,
        itemCount: 100,
        itemHeight: 70,
        itemWidth: 74,
        overscanRows: 1,
        paddingBottom: 5,
        paddingTop: 5,
        rowGap: 28,
        scrollTop: 0,
        viewportHeight: 200,
        viewportWidth: 250,
      })
    ).toEqual({
      columnCount: 3,
      endIndex: 11,
      startIndex: 0,
      totalHeight: 5 + 5 + 34 * 70 + 33 * 28,
    });
  });

  it("starts at a later row when scrolled down", () => {
    expect(
      calculateVirtualGrid({
        columnGap: 1,
        enabled: true,
        itemCount: 100,
        itemHeight: 70,
        itemWidth: 74,
        overscanRows: 1,
        paddingBottom: 5,
        paddingTop: 5,
        rowGap: 28,
        scrollTop: 320,
        viewportHeight: 200,
        viewportWidth: 250,
      })
    ).toEqual({
      columnCount: 3,
      endIndex: 20,
      startIndex: 6,
      totalHeight: 5 + 5 + 34 * 70 + 33 * 28,
    });
  });
});
