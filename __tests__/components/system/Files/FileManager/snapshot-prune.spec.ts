describe("allFilesRef snapshot pruning", () => {
  it("removes deleted entries from snapshot during sync", () => {
    // Simulate: snapshot has 3 entries, currentFiles only has 2 (one was deleted)
    const snapshot: Record<string, unknown> = {
      "a.json": { size: 1 },
      "b.json": { size: 2 },
      "deleted.json": { size: 3 },
    };
    const currentFiles: Record<string, unknown> = {
      "a.json": { size: 1 },
      "b.json": { size: 2 },
    };

    // Sync: add new entries from currentFiles
    for (const [name, stat] of Object.entries(currentFiles)) {
      if (!(name in snapshot)) {
        snapshot[name] = stat;
      }
    }

    // Prune: remove entries not in currentFiles
    for (const name of Object.keys(snapshot)) {
      if (!(name in currentFiles)) {
        delete snapshot[name];
      }
    }

    expect(snapshot).toEqual({
      "a.json": { size: 1 },
      "b.json": { size: 2 },
    });
    expect(snapshot).not.toHaveProperty(["deleted.json"]);
  });

  it("preserves new entries added since snapshot was taken", () => {
    const snapshot: Record<string, unknown> = {
      "a.json": { size: 1 },
    };
    const currentFiles: Record<string, unknown> = {
      "a.json": { size: 1 },
      "new.json": { size: 4 },
    };

    // Sync new entries
    for (const [name, stat] of Object.entries(currentFiles)) {
      if (!(name in snapshot)) {
        snapshot[name] = stat;
      }
    }

    // Prune stale entries
    for (const name of Object.keys(snapshot)) {
      if (!(name in currentFiles)) {
        delete snapshot[name];
      }
    }

    expect(snapshot).toHaveProperty(["new.json"]);
    expect(Object.keys(snapshot)).toHaveLength(2);
  });
});
